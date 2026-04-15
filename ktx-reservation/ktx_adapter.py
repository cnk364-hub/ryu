"""
KTX 어댑터 - korail2 라이브러리 래퍼
- 랜덤 User-Agent 적용
- 로그인/세션 관리
- 열차 조회 및 예약
"""
import random
import time
from dataclasses import dataclass
from typing import List, Optional

# korail2는 배포 환경에서만 설치되므로 try/except로 방어
try:
    from korail2 import Korail, TrainType, ReserveOption, AdultPassenger
    from korail2 import NeedToLoginError, SoldOutError, NoResultsError
    KORAIL_AVAILABLE = True
except Exception:  # pragma: no cover
    KORAIL_AVAILABLE = False

    class _Dummy:
        pass

    Korail = _Dummy  # type: ignore
    TrainType = _Dummy  # type: ignore
    ReserveOption = _Dummy  # type: ignore
    AdultPassenger = _Dummy  # type: ignore

    class NeedToLoginError(Exception):
        pass

    class SoldOutError(Exception):
        pass

    class NoResultsError(Exception):
        pass


USER_AGENTS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/118.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
]


# KTX 전체 역 목록
KTX_STATIONS = [
    "서울", "용산", "영등포", "광명", "수원", "평택", "천안",
    "천안아산", "오송", "대전", "김천구미", "동대구", "경주",
    "울산", "부산", "익산", "정읍", "광주송정", "목포",
    "전주", "순천", "여수EXPO", "강릉", "동해", "포항",
]


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
    raw: object = None


class KTXAdapter:
    """korail2 래퍼. 로그인/조회/예약을 단일 인터페이스로 묶는다."""

    def __init__(self, korail_id: str, password: str):
        self.korail_id = korail_id
        self.password = password
        self._client: Optional[Korail] = None

    def _apply_random_ua(self):
        if self._client is None:
            return
        try:
            self._client.session.headers.update({"User-Agent": pick_user_agent()})
        except Exception:
            pass

    def login(self) -> bool:
        if not KORAIL_AVAILABLE:
            raise RuntimeError("korail2 라이브러리가 설치되어 있지 않습니다.")
        self._client = Korail(self.korail_id, self.password, auto_login=False)
        self._apply_random_ua()

        # korail2 내부 session의 응답을 캡처하기 위해 훅 설치
        captured = {"last_text": None, "last_status": None, "last_url": None}
        try:
            sess = getattr(self._client, "_session", None) or getattr(self._client, "session", None)
            if sess is not None:
                orig_post = sess.post

                def hooked_post(url, *a, **kw):
                    resp = orig_post(url, *a, **kw)
                    try:
                        captured["last_url"] = url
                        captured["last_status"] = resp.status_code
                        captured["last_text"] = (resp.text or "")[:800]
                    except Exception:
                        pass
                    return resp

                sess.post = hooked_post
        except Exception:
            pass

        try:
            ok = self._client.login()
        except Exception as e:
            # korail2가 예외를 던지는 경우 — 캡처된 응답도 함께
            snippet = captured.get("last_text") or ""
            raise RuntimeError(
                f"코레일 로그인 거부: {type(e).__name__}: {e!s} | 응답: {snippet[:400]}"
            ) from e

        if not ok:
            # False 반환 케이스 — 응답 본문 그대로 올려 원인 파악
            snippet = captured.get("last_text") or "<응답 캡처 실패>"
            raise RuntimeError(
                f"코레일 로그인 거부 (HTTP {captured.get('last_status')}, "
                f"url={captured.get('last_url')}) 응답본문: {snippet[:500]}"
            )
        return True

    def ensure_logged_in(self):
        """세션 만료 시 자동 재로그인"""
        if self._client is None:
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
            passenger_list = [AdultPassenger(passengers)] if passengers and passengers > 0 else None
            trains = self._client.search_train(
                dep=dep,
                arr=arr,
                date=date,
                time=t,
                train_type=TrainType.KTX,
                passengers=passenger_list,
                include_no_seats=False,
            )
        except NoResultsError:
            return []

        results: List[TrainCandidate] = []
        for tr in trains:
            results.append(
                TrainCandidate(
                    train_no=getattr(tr, "train_no", ""),
                    train_name=getattr(tr, "train_name", "KTX"),
                    dep_station=getattr(tr, "dep_name", dep),
                    arr_station=getattr(tr, "arr_name", arr),
                    dep_time=getattr(tr, "dep_time", ""),
                    arr_time=getattr(tr, "arr_time", ""),
                    has_general=bool(getattr(tr, "has_seat", lambda: False)())
                    if hasattr(tr, "has_seat") else True,
                    has_special=bool(getattr(tr, "has_special_seat", lambda: False)())
                    if hasattr(tr, "has_special_seat") else False,
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

        option = None
        try:
            if seat_class == "GENERAL":
                option = ReserveOption.GENERAL_FIRST
            elif seat_class == "SPECIAL":
                option = ReserveOption.SPECIAL_FIRST
            else:
                option = ReserveOption.GENERAL_FIRST
        except Exception:
            option = None

        passenger_list = [AdultPassenger(passengers)] if passengers and passengers > 0 else None

        kwargs = {}
        if option is not None:
            kwargs["option"] = option
        if passenger_list is not None:
            kwargs["passengers"] = passenger_list
        return self._client.reserve(train_candidate.raw, **kwargs)

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
