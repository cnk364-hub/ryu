"""SQLite 기반 설정/이력 저장. 민감정보는 Fernet 대칭 암호화."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from cryptography.fernet import Fernet, InvalidToken

DB_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DB_DIR / "srt.db"
KEY_PATH = DB_DIR / ".fernet.key"

_lock = threading.RLock()


def _ensure_dir() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)


def _get_fernet() -> Fernet:
    """Fernet 키 로드(없으면 생성)."""
    _ensure_dir()
    if not KEY_PATH.exists():
        key = Fernet.generate_key()
        KEY_PATH.write_bytes(key)
        try:
            os.chmod(KEY_PATH, 0o600)
        except OSError:
            pass
    return Fernet(KEY_PATH.read_bytes())


def encrypt_str(plain: str) -> str:
    if plain is None:
        return ""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_str(cipher: str) -> str:
    if not cipher:
        return ""
    try:
        return _get_fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""


@contextmanager
def get_conn():
    _ensure_dir()
    with _lock:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                dep_station TEXT,
                arr_station TEXT,
                dep_date TEXT,
                dep_time TEXT,
                train_no TEXT,
                status TEXT,
                message TEXT,
                elapsed REAL
            );
            """
        )


# ---- Settings ---------------------------------------------------------------
# 암호화 보관 키 목록
_SENSITIVE_KEYS = {
    "srt_id",
    "srt_password",
    "kakao_access_token",
    "kakao_refresh_token",
    "kakao_rest_api_key",
}


def set_setting(key: str, value: Any) -> None:
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False)
    encrypted = key in _SENSITIVE_KEYS
    stored = encrypt_str(value) if encrypted else value
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO settings(key, value, encrypted, updated_at)
               VALUES(?,?,?,?)
               ON CONFLICT(key) DO UPDATE SET
                    value=excluded.value,
                    encrypted=excluded.encrypted,
                    updated_at=excluded.updated_at""",
            (key, stored, 1 if encrypted else 0, datetime.utcnow().isoformat()),
        )


def get_setting(key: str, default: Any = None) -> Any:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT value, encrypted FROM settings WHERE key=?", (key,)
        ).fetchone()
    if row is None:
        return default
    value = row["value"]
    if row["encrypted"]:
        value = decrypt_str(value)
    return value


def get_all_settings(mask_sensitive: bool = True) -> dict[str, Any]:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value, encrypted FROM settings").fetchall()
    out: dict[str, Any] = {}
    for r in rows:
        val = r["value"]
        if r["encrypted"]:
            val = decrypt_str(val)
            if mask_sensitive and val:
                # 비밀번호/토큰 등은 저장 여부만 알려주고 앞 2글자만 보여줌
                if r["key"] in {"srt_password", "kakao_access_token", "kakao_refresh_token"}:
                    val = _mask(val)
        out[r["key"]] = val
    return out


def _mask(s: str) -> str:
    if not s:
        return ""
    if len(s) <= 4:
        return "*" * len(s)
    return s[:2] + "*" * (len(s) - 4) + s[-2:]


# ---- History ----------------------------------------------------------------


def add_history(
    dep_station: str | None,
    arr_station: str | None,
    dep_date: str | None,
    dep_time: str | None,
    train_no: str | None,
    status: str,
    message: str,
    elapsed: float | None = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO history(created_at, dep_station, arr_station, dep_date,
                                   dep_time, train_no, status, message, elapsed)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                dep_station,
                arr_station,
                dep_date,
                dep_time,
                train_no,
                status,
                message,
                elapsed,
            ),
        )


def list_history(limit: int = 50) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def clear_history() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM history")
