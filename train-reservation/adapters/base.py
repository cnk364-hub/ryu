"""TrainAdapter 추상 클래스."""
from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from typing import Any, List, Optional

from config import ReserveConfig
from logger import get_logger
from notifier import send_kakao


class TrainAdapter(ABC):
    """SRT/KTX 공용 추상 어댑터."""

    def __init__(self, config: ReserveConfig) -> None:
        self.config = config
        self.logger = get_logger(f"{self.__class__.__name__}")
        self._stop_event = threading.Event()
        self._client: Any = None

    # ---------------- 추상 메서드 ----------------
    @abstractmethod
    def login(self) -> None:
        """라이브러리 클라이언트 로그인."""

    @abstractmethod
    def search_trains(self, include_sold_out: bool = True) -> List[Any]:
        """조건에 맞는 열차 목록 조회 (반환표 포함)."""

    @abstractmethod
    def has_available_seat(self, train: Any) -> bool:
        """좌석 또는 반환표가 잡히는지 확인."""

    @abstractmethod
    def reserve(self, train: Any) -> Any:
        """좌석 예약 시도."""

    @abstractmethod
    def get_train_info(self, train: Any) -> dict:
        """알림에 사용할 열차 정보 dict 반환.

        키: train_no, dep, arr, dep_time, arr_time
        """

    # ---------------- 공통 로직 ----------------
    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> Optional[Any]:
        """check_interval 간격으로 좌석 발생 시 자동 예약 후 알림."""
        self.logger.info(
            "%s 자동예약 시작 - %s→%s %s %s",
            self.config.train_type,
            self.config.dep,
            self.config.arr,
            self.config.date,
            self.config.time,
        )
        try:
            self.login()
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("로그인 실패: %s", exc)
            return None

        attempt = 0
        while not self._stop_event.is_set():
            attempt += 1
            try:
                trains = self.search_trains(include_sold_out=True)
                self.logger.info("[시도 %d] 검색된 열차 수: %d", attempt, len(trains))

                for train in trains:
                    info = self.get_train_info(train)
                    if (
                        self.config.train_no_filter
                        and info.get("train_no") not in self.config.train_no_filter
                    ):
                        continue

                    if not self.has_available_seat(train):
                        continue

                    self.logger.info(
                        "좌석 발견! 열차 %s %s→%s 예약 시도",
                        info.get("train_no"),
                        info.get("dep_time"),
                        info.get("arr_time"),
                    )
                    try:
                        result = self.reserve(train)
                        self.logger.info("예약 성공: %s", result)
                        send_kakao(
                            config=self.config,
                            train_no=info.get("train_no", ""),
                            dep_time=info.get("dep_time", ""),
                            arr_time=info.get("arr_time", ""),
                        )
                        return result
                    except Exception as exc:  # noqa: BLE001
                        self.logger.warning("예약 실패, 계속 조회: %s", exc)
                        continue
            except Exception as exc:  # noqa: BLE001
                self.logger.exception("조회 중 예외: %s", exc)

            self._stop_event.wait(self.config.check_interval)

        self.logger.info("자동예약 중지 요청으로 종료")
        return None
