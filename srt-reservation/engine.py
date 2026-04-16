"""
자동예약 엔진 (SRT 버전)
- 백그라운드 asyncio 태스크
- 30~60초 랜덤 주기 조회
- 연속 실패 5회 시 3분 휴식
- 예약 성공 시 자동 중지
- 세션 만료 자동 재로그인
"""
import asyncio
import time
import traceback
from datetime import datetime
from typing import Callable, Optional

import database as db
from srt_adapter import SRTAdapter, get_random_interval


class ReservationEngine:
    def __init__(self, log_callback: Optional[Callable[[str, str], None]] = None,
                 state_callback: Optional[Callable[[dict], None]] = None):
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
        self._log_cb = log_callback or (lambda level, msg: None)
        self._state_cb = state_callback or (lambda s: None)

        self.status = "IDLE"
        self.total_queries = 0
        self.last_query_at: Optional[str] = None
        self.next_query_at: Optional[float] = None
        self.consecutive_failures = 0
        self.success_info: Optional[dict] = None

    def snapshot(self) -> dict:
        return {
            "status": self.status,
            "total_queries": self.total_queries,
            "last_query_at": self.last_query_at,
            "next_query_at": self.next_query_at,
            "consecutive_failures": self.consecutive_failures,
            "running": self.is_running(),
            "success_info": self.success_info,
        }

    def _push_state(self):
        try:
            self._state_cb(self.snapshot())
        except Exception:
            pass

    def _log(self, level: str, msg: str):
        try:
            self._log_cb(level, msg)
        except Exception:
            pass

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self):
        if self.is_running():
            self._log("WARNING", "엔진이 이미 실행 중입니다.")
            return False

        settings = db.get_settings()
        profile = db.get_selected_profile_with_password()
        if not profile:
            self._log("ERROR", "선택된 프로필이 없습니다. 계정 탭에서 먼저 등록해주세요.")
            return False
        if not settings.get("dep_station") or not settings.get("arr_station") or not settings.get("dep_date"):
            self._log("ERROR", "예약 설정이 완료되지 않았습니다. 설정 탭에서 출발/도착/날짜를 지정하세요.")
            return False

        self._stop_event = asyncio.Event()
        self.status = "SEARCHING"
        self.consecutive_failures = 0
        self.success_info = None
        self._task = asyncio.create_task(self._run_loop(settings, profile))
        self._log("INFO", f"SRT 자동예약 시작: {settings['dep_station']} → {settings['arr_station']} ({settings['dep_date']})")
        self._push_state()
        return True

    def stop(self, reason: str = "사용자 중지"):
        if not self.is_running():
            self.status = "IDLE"
            self._push_state()
            return False
        self._stop_event.set()
        self._log("WARNING", f"엔진 중지 요청: {reason}")
        return True

    async def _sleep_interruptible(self, seconds: float):
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass

    async def _run_loop(self, settings: dict, profile: dict):
        adapter = SRTAdapter(profile["srt_id"], profile["password"])

        try:
            self._log("INFO", f"SRT 로그인 시도 ({profile['srt_id']})...")
            await asyncio.to_thread(adapter.login)
            self._log("SUCCESS", "로그인 성공")
        except Exception as e:
            self._log("ERROR", f"로그인 실패: {e}")
            self.status = "ERROR"
            self._push_state()
            return

        dep = settings["dep_station"]
        arr = settings["arr_station"]
        date = (settings.get("dep_date") or "").replace("-", "")
        time_from = settings.get("time_from") or "06:00"
        time_to = settings.get("time_to") or "22:00"
        seat_class = settings.get("seat_class") or "ANY"
        passengers = int(settings.get("passengers") or 1)

        section = f"{dep} → {arr}"

        while not self._stop_event.is_set():
            self.status = "SEARCHING"
            self._push_state()
            t0 = time.time()
            try:
                trains = await asyncio.to_thread(
                    adapter.search_trains, dep, arr, date, time_from.replace(":", "") + "00", passengers
                )
                self.total_queries += 1
                self.last_query_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                trains = [
                    tr for tr in trains
                    if SRTAdapter.within_time_range(tr.dep_time, time_from, time_to)
                ]

                def is_candidate(tr):
                    if seat_class == "GENERAL":
                        return tr.has_general
                    if seat_class == "SPECIAL":
                        return tr.has_special
                    return tr.has_general or tr.has_special

                candidates = [tr for tr in trains if is_candidate(tr)]

                if not candidates:
                    duration_ms = int((time.time() - t0) * 1000)
                    self._log("INFO", f"[{self.total_queries}회차] 가용 좌석 없음 ({len(trains)}편 조회, {duration_ms}ms)")
                    db.add_history(section, "", "NO_SEAT", duration_ms, f"{len(trains)}편 조회, 가용 없음")
                    self.consecutive_failures += 1
                else:
                    candidates.sort(key=lambda x: x.dep_time)
                    target = candidates[0]
                    self._log("INFO", f"예약 시도: {target.train_name} {target.train_no} {target.dep_time}")
                    try:
                        await asyncio.to_thread(adapter.reserve, target, seat_class, passengers)
                        duration_ms = int((time.time() - t0) * 1000)
                        msg = f"🎉 예약 성공! {target.train_no} {target.dep_time} → {target.arr_time}"
                        self._log("SUCCESS", msg)
                        db.add_history(section, target.train_no, "SUCCESS", duration_ms, msg)
                        self.success_info = {
                            "train_no": target.train_no,
                            "train_name": target.train_name,
                            "section": section,
                            "dep_time": target.dep_time,
                            "arr_time": target.arr_time,
                            "reserved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        }
                        self.status = "SUCCESS"
                        self._push_state()
                        return
                    except Exception as e:
                        duration_ms = int((time.time() - t0) * 1000)
                        emsg = f"{type(e).__name__}: {e}"
                        if "매진" in emsg or "잔여석" in emsg or "SoldOut" in emsg:
                            self._log("WARNING", f"매진: {emsg}")
                            db.add_history(section, target.train_no, "SOLD_OUT", duration_ms, emsg)
                        elif "Login" in emsg or "로그인" in emsg:
                            self._log("WARNING", f"세션 만료, 재로그인: {emsg}")
                            try:
                                await asyncio.to_thread(adapter.relogin)
                                self._log("SUCCESS", "재로그인 성공")
                            except Exception as re:
                                self._log("ERROR", f"재로그인 실패: {re}")
                        else:
                            self._log("ERROR", f"예약 오류: {emsg}")
                            db.add_history(section, target.train_no, "ERROR", duration_ms, emsg)
                        self.consecutive_failures += 1

            except Exception as e:
                self._log("ERROR", f"조회 오류: {e}")
                self._log("ERROR", traceback.format_exc())
                self.consecutive_failures += 1

            if self.success_info:
                break

            if self.consecutive_failures >= 5:
                self._log("WARNING", f"연속 실패 {self.consecutive_failures}회 — 3분간 휴식")
                self.status = "WAITING"
                self.next_query_at = time.time() + 180
                self._push_state()
                await self._sleep_interruptible(180)
                self.consecutive_failures = 0
                if self._stop_event.is_set():
                    break
                continue

            wait = get_random_interval()
            self.status = "WAITING"
            self.next_query_at = time.time() + wait
            self._log("INFO", f"다음 조회까지 {wait:.1f}초 대기")
            self._push_state()
            await self._sleep_interruptible(wait)

        if self.success_info:
            self.status = "SUCCESS"
        else:
            self.status = "IDLE"
        self.next_query_at = None
        self._push_state()
        self._log("INFO", "엔진 종료")
