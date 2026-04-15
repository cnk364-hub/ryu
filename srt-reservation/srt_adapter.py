"""SRT 라이브러리 래퍼. 로그인/조회/예약 + User-Agent 랜덤 교체.

외부 의존성(SRTrain)이 설치되지 않았거나 네트워크가 없는 환경에서도 서버가
시작되도록 import를 지연 처리한다.
"""
from __future__ import annotations

import random
import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

USER_AGENTS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/124.0 Firefox/124.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
]

# SRT 전체역 목록 (수서→부산 본선 기준)
SRT_STATIONS = [
    "수서",
    "동탄",
    "평택지제",
    "천안아산",
    "오송",
    "대전",
    "김천구미",
    "동대구",
    "경주",
    "울산(통도사)",
    "부산",
    # 호남선
    "공주",
    "익산",
    "정읍",
    "광주송정",
    "나주",
    "목포",
    # 기타
    "서대구",
    "포항",
    "진주",
    "여수엑스포",
    "순천",
]


def random_user_agent() -> str:
    return random.choice(USER_AGENTS)


@dataclass
class TrainInfo:
    train_no: str
    dep_station: str
    arr_station: str
    dep_time: str
    arr_time: str
    general_seat: bool
    special_seat: bool
    raw: Any = None


class SRTAdapter:
    """SRT 세션 관리 + 조회/예약 래퍼."""

    def __init__(self):
        self._srt = None
        self._id: Optional[str] = None
        self._pw: Optional[str] = None
        self._lock = threading.RLock()

    # ---- 로그인 ------------------------------------------------------------
    def login(self, srt_id: str, srt_pw: str) -> None:
        """SRT 로그인. 실패 시 예외 발생."""
        from SRT import SRT  # 지연 import

        with self._lock:
            self._id, self._pw = srt_id, srt_pw
            self._apply_user_agent()
            self._srt = SRT(srt_id, srt_pw, verbose=False)

    def ensure_login(self) -> None:
        """세션이 없거나 만료된 경우 재로그인."""
        if self._srt is None:
            if not (self._id and self._pw):
                raise RuntimeError("SRT 계정 정보가 없습니다. 계정 탭에서 설정하세요.")
            self.login(self._id, self._pw)

    def _apply_user_agent(self) -> None:
        """SRT 내부 세션에 랜덤 User-Agent 주입."""
        try:
            from SRT.srt import SRTSession  # type: ignore

            ua = random_user_agent()
            SRTSession.headers["User-Agent"] = ua
        except Exception:
            # 라이브러리 내부 구조 변경 시 조용히 무시 (조회는 그대로 동작)
            pass

    # ---- 조회 --------------------------------------------------------------
    def search(
        self,
        dep: str,
        arr: str,
        date_yyyymmdd: str,
        time_hhmmss: str = "000000",
        available_only: bool = False,
    ) -> list[TrainInfo]:
        self.ensure_login()
        self._apply_user_agent()
        assert self._srt is not None
        with self._lock:
            try:
                if available_only and hasattr(self._srt, "search_train_allday"):
                    trains = self._srt.search_train_allday(
                        dep, arr, date_yyyymmdd, time_hhmmss, available_only=True
                    )
                else:
                    fn = getattr(self._srt, "search_train", None) or getattr(
                        self._srt, "search_train_allday"
                    )
                    trains = fn(dep, arr, date_yyyymmdd, time_hhmmss)
            except Exception as e:  # 세션 만료 추정 시 재로그인 후 1회 재시도
                if self._looks_like_session_error(e):
                    self._srt = None
                    self.ensure_login()
                    fn = getattr(self._srt, "search_train", None) or getattr(
                        self._srt, "search_train_allday"
                    )
                    trains = fn(dep, arr, date_yyyymmdd, time_hhmmss)
                else:
                    raise

        return [self._to_info(t) for t in trains]

    def reserve(self, train: TrainInfo, seat_type: str = "GENERAL_FIRST"):
        """예약. seat_type: GENERAL_ONLY / SPECIAL_ONLY / GENERAL_FIRST / SPECIAL_FIRST"""
        self.ensure_login()
        assert self._srt is not None

        # SRT 라이브러리 SeatType enum 매핑 시도
        try:
            from SRT import SeatType  # type: ignore

            mapping = {
                "GENERAL_ONLY": getattr(SeatType, "GENERAL_ONLY", None),
                "SPECIAL_ONLY": getattr(SeatType, "SPECIAL_ONLY", None),
                "GENERAL_FIRST": getattr(SeatType, "GENERAL_FIRST", None),
                "SPECIAL_FIRST": getattr(SeatType, "SPECIAL_FIRST", None),
            }
            st = mapping.get(seat_type) or getattr(SeatType, "GENERAL_FIRST")
        except Exception:
            st = seat_type

        with self._lock:
            return self._srt.reserve(train.raw, special_seat=st)

    # ---- 내부 유틸 ---------------------------------------------------------
    @staticmethod
    def _looks_like_session_error(e: Exception) -> bool:
        msg = str(e).lower()
        return any(
            k in msg
            for k in (
                "로그인",
                "세션",
                "login",
                "session",
                "authent",
                "토큰",
                "token",
            )
        )

    @staticmethod
    def _to_info(t: Any) -> TrainInfo:
        def g(*names, default=""):
            for n in names:
                v = getattr(t, n, None)
                if v:
                    return v
            return default

        def seat_avail(flag_name: str) -> bool:
            v = getattr(t, flag_name, None)
            if v is None:
                return False
            if isinstance(v, bool):
                return v
            # 문자열/코드 비교 (예매가능 / 매진 등)
            return "예약" in str(v) or "가능" in str(v) or str(v).upper() == "Y"

        return TrainInfo(
            train_no=g("train_number", "train_no"),
            dep_station=g("dep_station_name", "dep"),
            arr_station=g("arr_station_name", "arr"),
            dep_time=g("dep_time"),
            arr_time=g("arr_time"),
            general_seat=seat_avail("general_seat_state")
            or seat_avail("general_seat_available")
            or seat_avail("general_seat"),
            special_seat=seat_avail("special_seat_state")
            or seat_avail("special_seat_available")
            or seat_avail("special_seat"),
            raw=t,
        )


# 전역 어댑터 (싱글톤)
adapter = SRTAdapter()
