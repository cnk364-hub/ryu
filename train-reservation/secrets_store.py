"""OS 키체인(keyring) 기반 자격정보 저장소.

Windows : 자격 증명 관리자(Credential Manager)
macOS   : Keychain
Linux   : Secret Service (gnome-keyring / KWallet)

저장되는 키:
    - "{train_type}_user_id"   : SRT_user_id, KTX_user_id
    - "{train_type}_user_pw"   : SRT_user_pw, KTX_user_pw
    - "kakao_access_token"
    - "kakao_refresh_token"
    - "kakao_rest_api_key"
"""
from __future__ import annotations

from typing import Dict, Optional

try:
    import keyring  # type: ignore
    _AVAILABLE = True
except ImportError:  # pragma: no cover
    _AVAILABLE = False

from logger import get_logger

SERVICE = "train-reservation"

logger = get_logger("secrets_store")


def available() -> bool:
    return _AVAILABLE


def save(key: str, value: Optional[str]) -> bool:
    if not _AVAILABLE:
        logger.warning("keyring 미설치 - 저장 불가 (%s)", key)
        return False
    if value is None or value == "":
        return delete(key)
    try:
        keyring.set_password(SERVICE, key, value)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.exception("keyring 저장 실패 %s: %s", key, exc)
        return False


def load(key: str) -> str:
    if not _AVAILABLE:
        return ""
    try:
        return keyring.get_password(SERVICE, key) or ""
    except Exception as exc:  # noqa: BLE001
        logger.exception("keyring 조회 실패 %s: %s", key, exc)
        return ""


def delete(key: str) -> bool:
    if not _AVAILABLE:
        return False
    try:
        keyring.delete_password(SERVICE, key)
        return True
    except keyring.errors.PasswordDeleteError:  # type: ignore[attr-defined]
        return True  # 원래 없는 경우도 성공으로 간주
    except Exception as exc:  # noqa: BLE001
        logger.exception("keyring 삭제 실패 %s: %s", key, exc)
        return False


# ---------------- 도메인 편의 함수 ----------------
def save_credentials(train_type: str, user_id: str, user_pw: str) -> None:
    save(f"{train_type}_user_id", user_id)
    save(f"{train_type}_user_pw", user_pw)


def load_credentials(train_type: str) -> Dict[str, str]:
    return {
        "user_id": load(f"{train_type}_user_id"),
        "user_pw": load(f"{train_type}_user_pw"),
    }


def clear_credentials(train_type: str) -> None:
    delete(f"{train_type}_user_id")
    delete(f"{train_type}_user_pw")


def save_kakao(access_token: str, refresh_token: str, rest_api_key: str) -> None:
    save("kakao_access_token", access_token)
    save("kakao_refresh_token", refresh_token)
    save("kakao_rest_api_key", rest_api_key)


def load_kakao() -> Dict[str, str]:
    return {
        "access_token": load("kakao_access_token"),
        "refresh_token": load("kakao_refresh_token"),
        "rest_api_key": load("kakao_rest_api_key"),
    }


def clear_kakao() -> None:
    delete("kakao_access_token")
    delete("kakao_refresh_token")
    delete("kakao_rest_api_key")
