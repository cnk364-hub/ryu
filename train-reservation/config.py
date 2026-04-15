"""예약 설정 데이터 클래스."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class ReserveConfig:
    """열차 자동 예약을 위한 설정값.

    카카오 토큰 및 계정정보는 키체인(keyring)에 저장되고 GUI/CLI 에서 로드해
    이 객체에 주입한다. 소스/Git 에 토큰을 하드코딩하지 않는다.

    Attributes:
        train_type: "SRT" 또는 "KTX"
        user_id: 로그인 아이디 (멤버십 번호 / 이메일 등)
        user_pw: 로그인 비밀번호
        dep: 출발역 (예: "수서", "서울")
        arr: 도착역 (예: "부산")
        date: 출발일 YYYYMMDD (예: "20260501")
        time: 출발 기준 시각 HHMMSS (예: "080000")
        seat_type: 좌석 종류 ("일반실", "특실")
        train_no_filter: 특정 열차 번호만 노릴 때 (없으면 전체)
        check_interval: 조회 간격(초)
        kakao_access_token: 카카오 '나에게 보내기' 액세스 토큰
        kakao_refresh_token: 만료 시 재발급용 리프레시 토큰
        kakao_rest_api_key: 카카오 앱의 REST API 키
        persist_kakao_tokens: True 이면 refresh 갱신 시 keyring 에 새 토큰 저장
    """

    train_type: str
    user_id: str
    user_pw: str
    dep: str
    arr: str
    date: str
    time: str
    seat_type: str = "일반실"
    train_no_filter: List[str] = field(default_factory=list)
    check_interval: int = 30

    # 카카오 인증 정보 (기본값 없음 — keyring 또는 GUI 입력으로 주입)
    kakao_access_token: str = ""
    kakao_refresh_token: str = ""
    kakao_rest_api_key: str = ""
    persist_kakao_tokens: bool = False
