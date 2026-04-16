"""
SQLite 데이터베이스 모듈 (SRT 버전)
- 계정 프로필 (암호화된 비밀번호 저장)
- 예약 설정
- 예약 시도 이력
- 암호화 키 관리
"""
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

from cryptography.fernet import Fernet

DB_PATH = os.environ.get("DATABASE_PATH", "srt.db")
KEY_PATH = os.environ.get(
    "FERNET_KEY_PATH",
    os.path.join(os.path.dirname(DB_PATH) or ".", ".fernet.key"),
)

_lock = threading.RLock()


def _load_or_create_key() -> bytes:
    env_key = os.environ.get("FERNET_KEY")
    if env_key:
        try:
            Fernet(env_key.encode())
            return env_key.encode()
        except Exception:
            pass

    if os.path.exists(KEY_PATH):
        with open(KEY_PATH, "rb") as f:
            return f.read().strip()

    key = Fernet.generate_key()
    os.makedirs(os.path.dirname(KEY_PATH) or ".", exist_ok=True)
    with open(KEY_PATH, "wb") as f:
        f.write(key)
    try:
        os.chmod(KEY_PATH, 0o600)
    except Exception:
        pass
    return key


_fernet: Optional[Fernet] = None


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_or_create_key())
    return _fernet


def encrypt_password(plain: str) -> str:
    if not plain:
        return ""
    return get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_password(token: str) -> str:
    if not token:
        return ""
    try:
        return get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""


@contextmanager
def get_conn():
    with _lock:
        os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                srt_id TEXT NOT NULL,
                password_enc TEXT NOT NULL,
                is_selected INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                dep_station TEXT,
                arr_station TEXT,
                dep_date TEXT,
                time_from TEXT,
                time_to TEXT,
                seat_class TEXT,
                passengers INTEGER,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                section TEXT,
                train_no TEXT,
                status TEXT,
                duration_ms INTEGER,
                message TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_history_ts ON history(ts DESC);
            """
        )

        row = conn.execute("SELECT id FROM settings WHERE id=1").fetchone()
        if row is None:
            conn.execute(
                """INSERT INTO settings (id, dep_station, arr_station, dep_date,
                   time_from, time_to, seat_class, passengers, updated_at)
                   VALUES (1, '수서', '부산', '', '06:00', '22:00', 'ANY', 1, ?)""",
                (datetime.utcnow().isoformat(),),
            )


# ---------- 프로필 ----------

def list_profiles():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, srt_id, is_selected, created_at FROM profiles ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]


def create_profile(name: str, srt_id: str, password: str) -> int:
    with get_conn() as conn:
        cnt = conn.execute("SELECT COUNT(*) AS c FROM profiles").fetchone()["c"]
        if cnt >= 5:
            raise ValueError("프로필은 최대 5개까지 저장할 수 있습니다.")
        enc = encrypt_password(password)
        cur = conn.execute(
            """INSERT INTO profiles (name, srt_id, password_enc, is_selected, created_at)
               VALUES (?, ?, ?, 0, ?)""",
            (name, srt_id, enc, datetime.utcnow().isoformat()),
        )
        new_id = cur.lastrowid
        if cnt == 0:
            conn.execute("UPDATE profiles SET is_selected=1 WHERE id=?", (new_id,))
        return new_id


def update_profile(profile_id: int, name: str, srt_id: str, password: Optional[str]):
    with get_conn() as conn:
        if password:
            conn.execute(
                "UPDATE profiles SET name=?, srt_id=?, password_enc=? WHERE id=?",
                (name, srt_id, encrypt_password(password), profile_id),
            )
        else:
            conn.execute(
                "UPDATE profiles SET name=?, srt_id=? WHERE id=?",
                (name, srt_id, profile_id),
            )


def delete_profile(profile_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM profiles WHERE id=?", (profile_id,))
        row = conn.execute("SELECT COUNT(*) AS c FROM profiles WHERE is_selected=1").fetchone()
        if row["c"] == 0:
            first = conn.execute("SELECT id FROM profiles ORDER BY id LIMIT 1").fetchone()
            if first:
                conn.execute("UPDATE profiles SET is_selected=1 WHERE id=?", (first["id"],))


def select_profile(profile_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE profiles SET is_selected=0")
        conn.execute("UPDATE profiles SET is_selected=1 WHERE id=?", (profile_id,))


def get_selected_profile_with_password():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, name, srt_id, password_enc FROM profiles WHERE is_selected=1 LIMIT 1"
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "srt_id": row["srt_id"],
            "password": decrypt_password(row["password_enc"]),
        }


# ---------- 설정 ----------

def get_settings() -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM settings WHERE id=1").fetchone()
        return dict(row) if row else {}


def save_settings(data: dict):
    with get_conn() as conn:
        conn.execute(
            """UPDATE settings SET
                 dep_station=?, arr_station=?, dep_date=?,
                 time_from=?, time_to=?, seat_class=?,
                 passengers=?, updated_at=?
               WHERE id=1""",
            (
                data.get("dep_station"),
                data.get("arr_station"),
                data.get("dep_date"),
                data.get("time_from", "06:00"),
                data.get("time_to", "22:00"),
                data.get("seat_class", "ANY"),
                int(data.get("passengers", 1)),
                datetime.utcnow().isoformat(),
            ),
        )


# ---------- 이력 ----------

def add_history(section: str, train_no: str, status: str, duration_ms: int, message: str = ""):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO history (ts, section, train_no, status, duration_ms, message)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                section,
                train_no,
                status,
                duration_ms,
                message,
            ),
        )
        conn.execute(
            """DELETE FROM history WHERE id NOT IN
               (SELECT id FROM history ORDER BY id DESC LIMIT 100)"""
        )


def list_history(limit: int = 100):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def clear_history():
    with get_conn() as conn:
        conn.execute("DELETE FROM history")
