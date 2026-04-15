"""KTX 어댑터 - korail2 라이브러리 사용."""
from __future__ import annotations

from typing import Any, List

from korail2 import (
    Korail,
    NoResultsError,
    ReserveOption,
    SoldOutError,
    TrainType,
)

from .base import TrainAdapter


class KTXAdapter(TrainAdapter):
    """KTX 자동 예약 어댑터."""

    def login(self) -> None:
        self._client = Korail(self.config.user_id, self.config.user_pw)
        self.logger.info("KTX(Korail) 로그인 성공")

    def _reserve_option(self) -> ReserveOption:
        if self.config.seat_type == "특실":
            return ReserveOption.SPECIAL_FIRST
        if self.config.seat_type == "일반실":
            return ReserveOption.GENERAL_FIRST
        return ReserveOption.GENERAL_FIRST

    def search_trains(self, include_sold_out: bool = True) -> List[Any]:
        try:
            return self._client.search_train_allday(
                dep=self.config.dep,
                arr=self.config.arr,
                date=self.config.date,
                time=self.config.time,
                train_type=TrainType.KTX,
                include_no_seats=include_sold_out,
            )
        except NoResultsError:
            return []

    def has_available_seat(self, train: Any) -> bool:
        if self.config.seat_type == "특실":
            return bool(getattr(train, "has_special_seat", lambda: False)())
        if self.config.seat_type == "일반실":
            return bool(getattr(train, "has_general_seat", lambda: False)())
        return bool(getattr(train, "has_seat", lambda: False)())

    def reserve(self, train: Any) -> Any:
        try:
            return self._client.reserve(train, option=self._reserve_option())
        except SoldOutError as exc:
            raise RuntimeError(f"예약 시도 직전 매진: {exc}") from exc

    def get_train_info(self, train: Any) -> dict:
        return {
            "train_no": getattr(train, "train_no", ""),
            "dep": getattr(train, "dep_name", self.config.dep),
            "arr": getattr(train, "arr_name", self.config.arr),
            "dep_time": getattr(train, "dep_time", ""),
            "arr_time": getattr(train, "arr_time", ""),
        }
