"""카카오톡 '나에게 보내기' 알림 모듈.

- 예약 성공 시 send_kakao(...) 호출
- access_token 만료(401) 시 refresh_token으로 자동 재발급 후 재전송
"""
from __future__ import annotations

import json

import requests

import secrets_store
from config import ReserveConfig
from logger import get_logger

logger = get_logger("notifier")

KAKAO_MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"


def refresh_access_token(config: ReserveConfig) -> bool:
    """refresh_token으로 새 access_token을 발급받아 config를 갱신.

    Returns:
        성공 여부. 성공 시 config.kakao_access_token 이 새 토큰으로 교체됨.
    """
    if not config.kakao_refresh_token or not config.kakao_rest_api_key:
        logger.error("kakao_refresh_token / kakao_rest_api_key가 없어 토큰 갱신 불가")
        return False

    data = {
        "grant_type": "refresh_token",
        "client_id": config.kakao_rest_api_key,
        "refresh_token": config.kakao_refresh_token,
    }

    try:
        resp = requests.post(KAKAO_TOKEN_URL, data=data, timeout=10)
    except requests.RequestException as exc:
        logger.exception("토큰 갱신 요청 예외: %s", exc)
        return False

    if resp.status_code != 200:
        logger.error(
            "토큰 갱신 실패: status=%s body=%s", resp.status_code, resp.text
        )
        return False

    body = resp.json()
    new_access = body.get("access_token")
    if not new_access:
        logger.error("응답에 access_token 없음: %s", body)
        return False

    config.kakao_access_token = new_access
    # refresh_token도 함께 내려올 수 있음 (남은 유효기간이 짧을 때)
    if body.get("refresh_token"):
        config.kakao_refresh_token = body["refresh_token"]

    # keyring에서 불러와 사용 중이었다면 새 토큰도 keyring에 영구 저장
    if config.persist_kakao_tokens:
        secrets_store.save("kakao_access_token", config.kakao_access_token)
        if body.get("refresh_token"):
            secrets_store.save("kakao_refresh_token", config.kakao_refresh_token)

    logger.info("카카오 access_token 갱신 성공")
    return True


def _post_memo(access_token: str, template_object: dict) -> requests.Response:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {"template_object": json.dumps(template_object, ensure_ascii=False)}
    return requests.post(KAKAO_MEMO_URL, headers=headers, data=data, timeout=10)


def send_kakao(
    config: ReserveConfig,
    train_no: str,
    dep_time: str,
    arr_time: str,
) -> bool:
    """카카오톡 '나에게 보내기' 알림 전송.

    401(토큰 만료) 응답이 오면 refresh_access_token()으로 갱신 후 1회 재시도.

    Returns:
        전송 성공 여부
    """
    if not config.kakao_access_token:
        logger.warning("kakao_access_token이 비어 있어 알림을 건너뜁니다.")
        return False

    text = (
        f"[{config.train_type}] 예약 성공!\n"
        f"열차번호: {train_no}\n"
        f"{config.dep}({dep_time}) → {config.arr}({arr_time})\n"
        f"좌석: {config.seat_type}"
    )
    template_object = {
        "object_type": "text",
        "text": text,
        "link": {
            "web_url": "https://www.kakao.com",
            "mobile_web_url": "https://www.kakao.com",
        },
        "button_title": "확인",
    }

    try:
        resp = _post_memo(config.kakao_access_token, template_object)
    except requests.RequestException as exc:
        logger.exception("카카오 알림 전송 예외: %s", exc)
        return False

    if resp.status_code == 401:
        logger.warning("access_token 만료(401) 감지 → refresh_token으로 갱신 시도")
        if not refresh_access_token(config):
            return False
        try:
            resp = _post_memo(config.kakao_access_token, template_object)
        except requests.RequestException as exc:
            logger.exception("갱신 후 재전송 예외: %s", exc)
            return False

    if resp.status_code == 200:
        logger.info("카카오톡 알림 전송 성공")
        return True

    logger.error(
        "카카오톡 알림 실패: status=%s body=%s", resp.status_code, resp.text
    )
    return False
