"""SRT 어댑터 - SRT 라이브러리 사용."""
from __future__ import annotations

from typing import Any, List

from SRT import SRT, SeatType

from .base import TrainAdapter


class SRTAdapter(TrainAdapter):
    """SRT 자동 예약 어댑터."""

    def login(self) -> None:
        self._client = SRT(self.config.user_id, self.config.user_pw)
        self.logger.info("SRT 로그인 성공")

    def _seat_type_enum(self) -> SeatType:
        if self.config.seat_type == "특실":
            return SeatType.FIRST_CLASS_FIRST
        if self.config.seat_type == "일반실":
            return SeatType.GENERAL_FIRST
        return SeatType.GENERAL_FIRST

    def search_trains(self, include_sold_out: bool = True) -> List[Any]:
        return self._client.search_train(
            dep=self.config.dep,
            arr=self.config.arr,
            date=self.config.date,
            time=self.config.time,
            available_only=not include_sold_out,
        )

    def has_available_seat(self, train: Any) -> bool:
        if self.config.seat_type == "특실":
            return bool(getattr(train, "special_seat_available", lambda: False)())
        if self.config.seat_type == "일반실":
            return bool(getattr(train, "general_seat_available", lambda: False)())
        return bool(getattr(train, "seat_available", lambda: False)())

    def reserve(self, train: Any) -> Any:
        return self._client.reserve(train, special_seat=self._seat_type_enum())

    def get_train_info(self, train: Any) -> dict:
        return {
            "train_no": getattr(train, "train_number", ""),
            "dep": getattr(train, "dep_station_name", self.config.dep),
            "arr": getattr(train, "arr_station_name", self.config.arr),
            "dep_time": getattr(train, "dep_time", ""),
            "arr_time": getattr(train, "arr_time", ""),
        }
