"""
KTX 어댑터 - korail_client (자체 구현) 래퍼
- 랜덤 User-Agent 적용
- 로그인/세션 관리
- 열차 조회 및 예약
"""
import random
import time
from dataclasses import dataclass
from typing import List, Optional

from korail_client import (
    KorailMobile,
    Train,
    KorailError,
    LoginFailError,
    MacroDetectedError,
    NeedToLoginError,
    SoldOutError,
    NoResultsError,
    STATION_CODES,
)

KORAIL_AVAILABLE = True


USER_AGENTS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/118.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
]


# KTX 전체 역 목록 (UI 용)
KTX_STATIONS = list(STATION_CODES.keys())


def get_random_interval() -> float:
    """다음 조회까지 대기 시간 (30~60초)"""
    return random.uniform(30.0, 60.0)


def human_like_delay():
    """조회 전 사람처럼 0.5~2초 딜레이"""
    time.sleep(random.uniform(0.5, 2.0))


def pick_user_agent() -> str:
    return random.choice(USER_AGENTS)


@dataclass
class TrainCandidate:
    train_no: str
    train_name: str
    dep_station: str
    arr_station: str
    dep_time: str
    arr_time: str
    has_general: bool
    has_special: bool
    raw: Train = None


class KTXAdapter:
    """KorailMobile 래퍼. 로그인/조회/예약을 단일 인터페이스로 묶는다."""

    def __init__(self, korail_id: str, password: str):
        self.korail_id = korail_id
        self.password = password
        self._client: Optional[KorailMobile] = None

    def _apply_random_ua(self):
        if self._client is None:
            return
        try:
            self._client.session.headers.update({"User-Agent": pick_user_agent()})
        except Exception:
            pass

    def login(self) -> bool:
        self._client = KorailMobile(self.korail_id, self.password)
        self._apply_random_ua()
        # 실패 시 LoginFailError 가 바로 raise — 호출자가 받아서 메시지 사용
        return self._client.login()

    def ensure_logged_in(self):
        """세션 만료 시 자동 재로그인"""
        if self._client is None or not self._client.logined:
            self.login()
            return
        try:
            self._apply_random_ua()
        except Exception:
            pass

    def relogin(self):
        self._client = None
        return self.login()

    def search_trains(
        self,
        dep: str,
        arr: str,
        date: str,
        time_from: str,
        passengers: int = 1,
    ) -> List[TrainCandidate]:
        """
        KTX 열차 조회.
        date: YYYYMMDD
        time_from: HHMMSS 또는 HH:MM
        """
        if self._client is None:
            self.login()
        self._apply_random_ua()
        human_like_delay()

        # 시간 정규화
        t = time_from.replace(":", "")
        if len(t) == 4:
            t = t + "00"

        try:
            trains = self._client.search_train(
                dep=dep,
                arr=arr,
                date=date,
                time_=t,
                adult=passengers,
            )
        except NoResultsError:
            return []

        results: List[TrainCandidate] = []
        for tr in trains:
            results.append(
                TrainCandidate(
                    train_no=tr.train_no,
                    train_name=tr.train_type_name,
                    dep_station=tr.dep_name,
                    arr_station=tr.arr_name,
                    dep_time=tr.dep_time,
                    arr_time=tr.arr_time,
                    has_general=tr.has_general_seat,
                    has_special=tr.has_special_seat,
                    raw=tr,
                )
            )
        return results

    def reserve(self, train_candidate: TrainCandidate, seat_class: str = "ANY",
                passengers: int = 1):
        """
        좌석 예약 시도.
        seat_class: 'GENERAL', 'SPECIAL', 'ANY'
        """
        if self._client is None:
            self.login()

        return self._client.reserve(
            train_candidate.raw,
            seat_class=seat_class,
            adult=passengers,
        )

    @staticmethod
    def within_time_range(dep_time: str, time_from: str, time_to: str) -> bool:
        """열차 출발시각이 사용자 설정 범위 내인지 확인"""
        def norm(v: str) -> str:
            v = (v or "").replace(":", "")
            if len(v) == 4:
                v += "00"
            return v[:6].ljust(6, "0")

        d = norm(dep_time)
        f = norm(time_from)
        t = norm(time_to)
        return f <= d <= t
