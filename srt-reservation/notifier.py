"""카카오톡 나에게 보내기. 401 시 refresh_token 으로 자동 갱신."""
from __future__ import annotations

import json
import logging
from typing import Optional

import requests

from database import get_setting, set_setting

logger = logging.getLogger(__name__)

KAKAO_SEND_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"


def _refresh_access_token() -> Optional[str]:
    """리프레시 토큰으로 액세스 토큰 갱신."""
    refresh = get_setting("kakao_refresh_token", "")
    rest_api_key = get_setting("kakao_rest_api_key", "")
    if not refresh or not rest_api_key:
        return None

    resp = requests.post(
        KAKAO_TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "client_id": rest_api_key,
            "refresh_token": refresh,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        logger.error("카카오 토큰 갱신 실패: %s %s", resp.status_code, resp.text)
        return None

    data = resp.json()
    new_access = data.get("access_token")
    new_refresh = data.get("refresh_token")
    if new_access:
        set_setting("kakao_access_token", new_access)
    if new_refresh:
        set_setting("kakao_refresh_token", new_refresh)
    return new_access


def _send_text(access_token: str, text: str, link_url: str = "https://etk.srail.kr") -> requests.Response:
    template = {
        "object_type": "text",
        "text": text,
        "link": {"web_url": link_url, "mobile_web_url": link_url},
        "button_title": "SRT 확인",
    }
    return requests.post(
        KAKAO_SEND_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        data={"template_object": json.dumps(template, ensure_ascii=False)},
        timeout=10,
    )


def send_kakao(text: str) -> tuple[bool, str]:
    """카카오톡 나에게 메시지 전송. (성공여부, 메시지)"""
    access = get_setting("kakao_access_token", "")
    if not access:
        return False, "카카오 액세스 토큰이 설정되지 않았습니다."

    try:
        resp = _send_text(access, text)
    except requests.RequestException as e:
        return False, f"네트워크 오류: {e}"

    if resp.status_code == 200:
        return True, "카카오톡 전송 성공"

    if resp.status_code == 401:
        # 토큰 만료 → 갱신 후 재시도
        new_access = _refresh_access_token()
        if not new_access:
            return False, f"토큰 만료 후 갱신 실패: {resp.text}"
        try:
            resp2 = _send_text(new_access, text)
        except requests.RequestException as e:
            return False, f"재전송 중 네트워크 오류: {e}"
        if resp2.status_code == 200:
            return True, "토큰 갱신 후 전송 성공"
        return False, f"재전송 실패: {resp2.status_code} {resp2.text}"

    return False, f"전송 실패: {resp.status_code} {resp.text}"


def send_reservation_success(
    train_no: str,
    dep_station: str,
    dep_time: str,
    arr_station: str,
    arr_time: str,
    seat_grade: str,
    passengers: int,
    now_str: str,
) -> tuple[bool, str]:
    text = (
        f"🎉 SRT 예약 성공!\n"
        f"열차: SRT {train_no}\n"
        f"구간: {dep_station} {dep_time} → {arr_station} {arr_time}\n"
        f"좌석: {seat_grade} {passengers}명\n"
        f"예약시각: {now_str}"
    )
    return send_kakao(text)
