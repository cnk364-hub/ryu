"""
SRT 어댑터 - SRT 라이브러리 래퍼
- 랜덤 User-Agent / 사람같은 딜레이
- 로그인 / 조회 / 예약
- KorailMobile 과 유사한 인터페이스로 엔진이 재사용 가능
"""
import random
import time
from dataclasses import dataclass
from typing import List, Optional

# SRT 라이브러리 (배포 시 git 에서 설치). 로컬 테스트용 방어 로직.
try:
    from SRT import SRT, SRTError, SRTLoginError, SRTNotLoggedInError
    try:
        from SRT import SeatType
    except ImportError:
        SeatType = None
    SRT_AVAILABLE = True
except ImportError:
    try:
        from srt import SRT, SRTError, SRTLoginError, SRTNotLoggedInError
        try:
            from srt import SeatType
        except ImportError:
            SeatType = None
        SRT_AVAILABLE = True
    except ImportError:
        try:
            from SRTrain import SRT, SRTError, SRTLoginError, SRTNotLoggedInError
            try:
                from SRTrain import SeatType
            except ImportError:
                SeatType = None
            SRT_AVAILABLE = True
        except ImportError:
            SRT_AVAILABLE = False

            class _Dummy:
                pass

            SRT = _Dummy  # type: ignore
            SeatType = None  # type: ignore

            class SRTError(Exception):
                pass

            class SRTLoginError(Exception):
                pass

            class SRTNotLoggedInError(Exception):
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

# SR 전체 역 목록 (수서고속철도)
SRT_STATIONS = [
    "수서", "동탄", "평택지제", "천안아산", "오송", "대전",
    "김천구미", "동대구", "경주", "울산", "부산",
    "공주", "익산", "정읍", "광주송정", "목포",
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


class SRTAdapter:
    """SRT 라이브러리 래퍼"""

    def __init__(self, srt_id: str, password: str):
        self.srt_id = srt_id
        self.password = password
        self._client: Optional[SRT] = None

    def _apply_random_ua(self):
        if self._client is None:
            return
        try:
            sess = getattr(self._client, "_session", None) or getattr(self._client, "session", None)
            if sess is not None:
                sess.headers.update({"User-Agent": pick_user_agent()})
        except Exception:
            pass

    def login(self) -> bool:
        if not SRT_AVAILABLE:
            raise RuntimeError("SRT 라이브러리가 설치되어 있지 않습니다.")
        try:
            self._client = SRT(self.srt_id, self.password, verbose=False)
        except SRTLoginError as e:
            raise RuntimeError(f"SRT 로그인 거부: {e!s}") from e
        except Exception as e:
            raise RuntimeError(f"SRT 로그인 오류: {type(e).__name__}: {e}") from e
        self._apply_random_ua()
        return True

    def ensure_logged_in(self):
        if self._client is None:
            self.login()

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
        if self._client is None:
            self.login()
        self._apply_random_ua()
        human_like_delay()

        t = time_from.replace(":", "")
        if len(t) == 4:
            t = t + "00"

        try:
            trains = self._client.search_train(
                dep=dep,
                arr=arr,
                date=date,
                time=t,
                available_only=False,
            )
        except SRTNotLoggedInError:
            self.relogin()
            trains = self._client.search_train(
                dep=dep, arr=arr, date=date, time=t, available_only=False,
            )
        except Exception as e:
            raise

        results: List[TrainCandidate] = []
        for tr in trains:
            train_no = getattr(tr, "train_number", "") or getattr(tr, "train_no", "")
            train_name = getattr(tr, "train_name", "SRT") or "SRT"
            dep_time = getattr(tr, "dep_time", "")
            arr_time = getattr(tr, "arr_time", "")

            has_general = False
            has_special = False
            try:
                if hasattr(tr, "general_seat_available"):
                    has_general = bool(tr.general_seat_available())
                if hasattr(tr, "special_seat_available"):
                    has_special = bool(tr.special_seat_available())
            except Exception:
                pass
            if not has_general and not has_special:
                try:
                    if hasattr(tr, "seat_available"):
                        avail = bool(tr.seat_available())
                        has_general = avail
                except Exception:
                    pass

            results.append(TrainCandidate(
                train_no=train_no,
                train_name=train_name,
                dep_station=getattr(tr, "dep_station_name", dep),
                arr_station=getattr(tr, "arr_station_name", arr),
                dep_time=dep_time,
                arr_time=arr_time,
                has_general=has_general,
                has_special=has_special,
                raw=tr,
            ))
        return results

    def reserve(self, train_candidate: TrainCandidate, seat_class: str = "ANY",
                passengers: int = 1):
        if self._client is None:
            self.login()

        sp = None
        if SeatType is not None:
            try:
                if seat_class == "GENERAL":
                    sp = SeatType.GENERAL_ONLY
                elif seat_class == "SPECIAL":
                    sp = SeatType.SPECIAL_ONLY
                else:
                    sp = SeatType.GENERAL_FIRST
            except Exception:
                sp = None

        kwargs = {}
        if sp is not None:
            kwargs["special_seat"] = sp

        try:
            from SRT import Adult  # type: ignore
            kwargs["passengers"] = [Adult(passengers)]
        except Exception:
            pass

        return self._client.reserve(train_candidate.raw, **kwargs)

    @staticmethod
    def within_time_range(dep_time: str, time_from: str, time_to: str) -> bool:
        def norm(v: str) -> str:
            v = (v or "").replace(":", "")
            if len(v) == 4:
                v += "00"
            return v[:6].ljust(6, "0")

        d = norm(dep_time)
        f = norm(time_from)
        t = norm(time_to)
        return f <= d <= t
