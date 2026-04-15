"""자동예약 엔진. 랜덤 딜레이 + 실패 5회 시 3분 휴식 + 성공 시 자동 중지."""
from __future__ import annotations

import asyncio
import json
import logging
import random
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Optional

import database as db
from notifier import send_reservation_success
from srt_adapter import NetFunnelError, adapter, is_netfunnel_error

logger = logging.getLogger(__name__)

# 상태 상수
STATUS_IDLE = "대기중"
STATUS_SEARCHING = "조회중"
STATUS_SUCCESS = "예약성공"
STATUS_ERROR = "오류"
STATUS_COOLDOWN = "휴식중"
STATUS_NETFUNNEL = "대기열"


def get_random_interval() -> float:
    """30초~60초 사이 랜덤."""
    return random.uniform(30.0, 60.0)


def human_like_delay() -> float:
    """조회 전 0.5~2초 랜덤 딜레이."""
    d = random.uniform(0.5, 2.0)
    time.sleep(d)
    return d


@dataclass
class EngineState:
    status: str = STATUS_IDLE
    running: bool = False
    total_checks: int = 0
    last_check_at: Optional[str] = None
    next_check_at_ts: Optional[float] = None  # epoch seconds
    last_error: Optional[str] = None
    last_success: Optional[dict] = None
    consecutive_failures: int = 0
    netfunnel_count: int = 0  # 연속 NetFunnel 차단 횟수

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "running": self.running,
            "total_checks": self.total_checks,
            "last_check_at": self.last_check_at,
            "next_check_at_ts": self.next_check_at_ts,
            "last_error": self.last_error,
            "last_success": self.last_success,
            "consecutive_failures": self.consecutive_failures,
            "netfunnel_count": self.netfunnel_count,
            "now_ts": time.time(),
        }


class LogBus:
    """최근 로그 보관 + 구독 큐 분배."""

    MAX = 500

    def __init__(self):
        self.buffer: deque[dict] = deque(maxlen=self.MAX)
        self._subs: list[asyncio.Queue] = []
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subs.append(q)
        # 기존 로그 미리 전달
        for item in list(self.buffer):
            q.put_nowait(item)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._subs.remove(q)
        except ValueError:
            pass

    def log(self, level: str, message: str) -> None:
        item = {
            "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "level": level,
            "message": message,
        }
        self.buffer.append(item)
        # 파일 로그
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        except OSError:
            pass
        # 구독자에게 전달
        for q in list(self._subs):
            try:
                if self._loop is not None and self._loop.is_running():
                    self._loop.call_soon_threadsafe(self._put_nowait_safe, q, item)
                else:
                    q.put_nowait(item)
            except Exception:
                pass

    @staticmethod
    def _put_nowait_safe(q: asyncio.Queue, item: dict) -> None:
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            pass

    def clear(self) -> None:
        self.buffer.clear()
        try:
            open(LOG_FILE, "w", encoding="utf-8").close()
        except OSError:
            pass


from pathlib import Path

LOG_FILE = Path(__file__).resolve().parent / "data" / "srt.log"


class BookingEngine:
    def __init__(self):
        self.state = EngineState()
        self.log_bus = LogBus()
        self._thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()
        self._state_lock = threading.RLock()

    # ---- 제어 --------------------------------------------------------------
    def start(self) -> tuple[bool, str]:
        with self._state_lock:
            if self.state.running:
                return False, "이미 실행 중입니다."
            cfg = self._read_config()
            ok, msg = self._validate_cfg(cfg)
            if not ok:
                return False, msg
            self._stop_evt.clear()
            self.state = EngineState(status=STATUS_SEARCHING, running=True)
            self._thread = threading.Thread(target=self._run, args=(cfg,), daemon=True)
            self._thread.start()
            self._log("SUCCESS", "자동 예약 엔진 시작")
            return True, "엔진이 시작되었습니다."

    def stop(self) -> tuple[bool, str]:
        with self._state_lock:
            if not self.state.running:
                return False, "실행 중이 아닙니다."
            self._stop_evt.set()
            self.state.running = False
            self.state.status = STATUS_IDLE
            self.state.next_check_at_ts = None
            self._log("WARNING", "자동 예약 엔진 중지 요청")
            return True, "엔진 중지 요청됨."

    # ---- 설정 --------------------------------------------------------------
    @staticmethod
    def _read_config() -> dict:
        raw = db.get_setting("reservation_cfg", "")
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _validate_cfg(cfg: dict) -> tuple[bool, str]:
        required = ["dep_station", "arr_station", "dep_date", "time_from", "time_to",
                    "seat_type", "passengers"]
        for k in required:
            if not cfg.get(k):
                return False, f"설정값 누락: {k}"
        if not db.get_setting("srt_id") or not db.get_setting("srt_password"):
            return False, "SRT 계정(아이디/비밀번호)을 먼저 저장하세요."
        return True, ""

    # ---- 메인 루프 ---------------------------------------------------------
    def _run(self, cfg: dict) -> None:
        try:
            srt_id = db.get_setting("srt_id", "")
            srt_pw = db.get_setting("srt_password", "")
            self._log("INFO", f"SRT 로그인 시도: {srt_id[:3]}***")
            adapter.login(srt_id, srt_pw)
            self._log("SUCCESS", "SRT 로그인 성공")
        except Exception as e:
            self._log("ERROR", f"SRT 로그인 실패: {e}")
            with self._state_lock:
                self.state.status = STATUS_ERROR
                self.state.last_error = str(e)
                self.state.running = False
            return

        while not self._stop_evt.is_set():
            # 사람처럼 보이는 사전 딜레이
            d = human_like_delay()
            if self._stop_evt.is_set():
                break
            self._log("INFO", f"조회 전 랜덤 딜레이 {d:.2f}s")

            with self._state_lock:
                self.state.status = STATUS_SEARCHING

            t0 = time.time()
            netfunnel_hit = False
            try:
                success, info = self._try_once(cfg)
                elapsed = time.time() - t0
            except NetFunnelError as e:
                elapsed = time.time() - t0
                success, info = False, {"message": f"NetFunnel 차단: {e}"}
                netfunnel_hit = True
                self._log("WARNING", f"🚦 NetFunnel 대기열 감지: {e}")
            except Exception as e:
                elapsed = time.time() - t0
                # SRT 라이브러리가 NetFunnel 을 일반 예외로 던지는 경우도 감지
                if is_netfunnel_error(e):
                    netfunnel_hit = True
                    self._log("WARNING", f"🚦 NetFunnel 대기열 감지(일반예외): {e}")
                    adapter.reset()
                else:
                    self._log("ERROR", f"조회 중 예외: {e}")
                success, info = False, {"message": f"예외: {e}"}

            with self._state_lock:
                self.state.total_checks += 1
                self.state.last_check_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # ---- NetFunnel 전용 처리 -----------------------------------------
            if netfunnel_hit:
                with self._state_lock:
                    self.state.netfunnel_count += 1
                    nf = self.state.netfunnel_count
                    self.state.last_error = info.get("message", "NetFunnel")
                db.add_history(
                    dep_station=cfg["dep_station"],
                    arr_station=cfg["arr_station"],
                    dep_date=cfg["dep_date"],
                    dep_time=None,
                    train_no=None,
                    status="차단",
                    message=info.get("message", "NetFunnel"),
                    elapsed=elapsed,
                )

                if nf >= 3:
                    long_wait = 300  # 5분
                    self._log(
                        "WARNING",
                        f"🚦 NetFunnel 차단 {nf}회 연속 → {long_wait//60}분 대기 후 세션 재초기화",
                    )
                    with self._state_lock:
                        self.state.status = STATUS_NETFUNNEL
                        self.state.next_check_at_ts = time.time() + long_wait
                    if self._interruptible_sleep(long_wait):
                        break
                    with self._state_lock:
                        self.state.netfunnel_count = 0
                    # 세션 재초기화 + 재로그인
                    self._relogin_safely()
                    continue

                wait = random.uniform(60.0, 120.0)
                self._log(
                    "WARNING",
                    f"🚦 대기열 진입 중... {wait:.0f}초 후 재시도 (누적 {nf}회)",
                )
                with self._state_lock:
                    self.state.status = STATUS_NETFUNNEL
                    self.state.next_check_at_ts = time.time() + wait
                if self._interruptible_sleep(wait):
                    break
                # 재시도 전 세션 완전 초기화 후 재로그인
                self._relogin_safely()
                continue
            else:
                # NetFunnel 이 아닌 일반 실패/성공 시에는 NetFunnel 카운터 리셋
                with self._state_lock:
                    self.state.netfunnel_count = 0

            if success:
                with self._state_lock:
                    self.state.status = STATUS_SUCCESS
                    self.state.running = False
                    self.state.last_success = info
                    self.state.next_check_at_ts = None
                self._log("SUCCESS", f"예약 성공! 열차 SRT {info.get('train_no')} {info.get('dep_time')}")
                db.add_history(
                    dep_station=cfg["dep_station"],
                    arr_station=cfg["arr_station"],
                    dep_date=cfg["dep_date"],
                    dep_time=info.get("dep_time"),
                    train_no=info.get("train_no"),
                    status="성공",
                    message=info.get("message", "예약 성공"),
                    elapsed=elapsed,
                )
                # 카카오톡 알림
                ok, msg = send_reservation_success(
                    train_no=info.get("train_no", ""),
                    dep_station=cfg["dep_station"],
                    dep_time=info.get("dep_time", ""),
                    arr_station=cfg["arr_station"],
                    arr_time=info.get("arr_time", ""),
                    seat_grade=self._seat_label(cfg["seat_type"]),
                    passengers=int(cfg["passengers"]),
                    now_str=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                )
                level = "SUCCESS" if ok else "WARNING"
                self._log(level, f"카카오 알림: {msg}")
                break

            # 실패 처리
            with self._state_lock:
                self.state.consecutive_failures += 1
                fails = self.state.consecutive_failures
            self._log("INFO", f"예약 가능 열차 없음/실패 ({fails}회 연속). {info.get('message','')}")
            db.add_history(
                dep_station=cfg["dep_station"],
                arr_station=cfg["arr_station"],
                dep_date=cfg["dep_date"],
                dep_time=None,
                train_no=None,
                status="실패",
                message=info.get("message", ""),
                elapsed=elapsed,
            )

            if fails >= 5:
                self._log("WARNING", "연속 실패 5회 → 3분 휴식")
                with self._state_lock:
                    self.state.status = STATUS_COOLDOWN
                    self.state.next_check_at_ts = time.time() + 180
                if self._interruptible_sleep(180):
                    break
                with self._state_lock:
                    self.state.consecutive_failures = 0
                continue

            interval = get_random_interval()
            with self._state_lock:
                self.state.status = STATUS_SEARCHING
                self.state.next_check_at_ts = time.time() + interval
            self._log("INFO", f"다음 조회까지 {interval:.1f}s 대기")
            if self._interruptible_sleep(interval):
                break

        with self._state_lock:
            if self.state.status != STATUS_SUCCESS:
                self.state.status = STATUS_IDLE
            self.state.running = False
            self.state.next_check_at_ts = None
        self._log("INFO", "엔진 루프 종료")

    def _interruptible_sleep(self, seconds: float) -> bool:
        """중간에 stop 이벤트가 오면 즉시 종료. True=중단됨."""
        deadline = time.time() + seconds
        while time.time() < deadline:
            if self._stop_evt.wait(timeout=0.5):
                return True
        return False

    def _relogin_safely(self) -> None:
        """세션 리셋 후 재로그인 시도 (실패해도 루프는 계속)."""
        try:
            adapter.reset()
            srt_id = db.get_setting("srt_id", "")
            srt_pw = db.get_setting("srt_password", "")
            self._log("INFO", "🔄 세션 초기화 후 재로그인 시도")
            adapter.login(srt_id, srt_pw)
            self._log("SUCCESS", "재로그인 완료")
        except Exception as e:
            self._log("ERROR", f"재로그인 실패: {e}")

    def _try_once(self, cfg: dict) -> tuple[bool, dict]:
        date_str = cfg["dep_date"].replace("-", "")  # YYYYMMDD
        time_from = cfg["time_from"].replace(":", "") + "00"  # HHMMSS
        time_to = cfg["time_to"].replace(":", "") + "59"
        seat_type = cfg["seat_type"]  # general / special / both
        passengers = int(cfg.get("passengers", 1))

        trains = adapter.search(
            cfg["dep_station"],
            cfg["arr_station"],
            date_str,
            time_from,
            available_only=False,
        )

        candidates = []
        for t in trains:
            # 시각 범위 필터
            if not (time_from <= (t.dep_time or "") <= time_to):
                continue
            # 좌석 필터
            if seat_type == "general" and not t.general_seat:
                continue
            if seat_type == "special" and not t.special_seat:
                continue
            if seat_type == "both" and not (t.general_seat or t.special_seat):
                continue
            candidates.append(t)

        if not candidates:
            self._log("INFO", f"조회 {len(trains)}건, 가능 열차 0건")
            return False, {"message": "가능 열차 없음"}

        # 예약 시도
        pick = candidates[0]
        st_for_lib = {
            "general": "GENERAL_ONLY",
            "special": "SPECIAL_ONLY",
            "both": "GENERAL_FIRST",
        }.get(seat_type, "GENERAL_FIRST")

        self._log("INFO", f"예약 시도: SRT {pick.train_no} {pick.dep_time}→{pick.arr_time}")
        try:
            adapter.reserve(pick, seat_type=st_for_lib)
        except Exception as e:
            return False, {"message": f"예약 시도 실패: {e}"}

        return True, {
            "train_no": pick.train_no,
            "dep_time": pick.dep_time,
            "arr_time": pick.arr_time,
            "message": "예약 성공",
        }

    # ---- 유틸 --------------------------------------------------------------
    @staticmethod
    def _seat_label(seat_type: str) -> str:
        return {"general": "일반실", "special": "특실", "both": "일반실/특실"}.get(
            seat_type, seat_type
        )

    def _log(self, level: str, message: str) -> None:
        logger.info("[%s] %s", level, message)
        self.log_bus.log(level, message)


engine = BookingEngine()
