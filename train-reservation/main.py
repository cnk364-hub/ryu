"""SRT/KTX 자동 예약 CLI 진입점.

사용 예시:
    python main.py

GUI 로 실행하려면:
    python gui.py

자격정보(ID/PW) 및 카카오 토큰은 keyring(OS 키체인)에서 자동 로드된다.
최초 1회는 GUI 에서 '이 기기에 저장'으로 등록해두는 것을 권장한다.
"""
from __future__ import annotations

import threading
from typing import List

import secrets_store
from adapters import KTXAdapter, SRTAdapter, TrainAdapter
from config import ReserveConfig
from logger import get_logger

logger = get_logger("main")


def build_adapter(config: ReserveConfig) -> TrainAdapter:
    if config.train_type.upper() == "SRT":
        return SRTAdapter(config)
    if config.train_type.upper() == "KTX":
        return KTXAdapter(config)
    raise ValueError(f"지원하지 않는 열차 종류: {config.train_type}")


def _with_secrets(c: ReserveConfig) -> ReserveConfig:
    """ReserveConfig에 keyring 값을 채워 넣는다 (이미 값이 있으면 유지)."""
    if not c.user_id or not c.user_pw:
        creds = secrets_store.load_credentials(c.train_type)
        if not c.user_id:
            c.user_id = creds["user_id"]
        if not c.user_pw:
            c.user_pw = creds["user_pw"]

    kakao = secrets_store.load_kakao()
    if not c.kakao_access_token:
        c.kakao_access_token = kakao["access_token"]
    if not c.kakao_refresh_token:
        c.kakao_refresh_token = kakao["refresh_token"]
    if not c.kakao_rest_api_key:
        c.kakao_rest_api_key = kakao["rest_api_key"]
    c.persist_kakao_tokens = bool(kakao["access_token"])
    return c


def run_all(configs: List[ReserveConfig]) -> None:
    """여러 ReserveConfig 를 동시에 스레드로 실행."""
    configs = [_with_secrets(c) for c in configs]

    missing = [c for c in configs if not c.user_id or not c.user_pw]
    if missing:
        logger.error(
            "%d개 config 의 아이디/비밀번호가 비어 있습니다. "
            "gui.py 에서 먼저 계정을 저장해 주세요.",
            len(missing),
        )
        return

    adapters = [build_adapter(c) for c in configs]
    threads: List[threading.Thread] = []

    for adapter in adapters:
        t = threading.Thread(
            target=adapter.run,
            name=f"{adapter.config.train_type}-{adapter.config.dep}->{adapter.config.arr}",
            daemon=True,
        )
        threads.append(t)
        t.start()

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt: 모든 스레드 중단")
        for adapter in adapters:
            adapter.stop()
        for t in threads:
            t.join(timeout=5)


if __name__ == "__main__":
    # user_id/user_pw 를 비워두면 keyring 에 저장된 값을 사용
    # 카카오 토큰 3종도 keyring 에서 자동 로드됨
    configs: List[ReserveConfig] = [
        ReserveConfig(
            train_type="SRT",
            user_id="",   # keyring 사용
            user_pw="",   # keyring 사용
            dep="수서",
            arr="부산",
            date="20260501",
            time="080000",
            seat_type="일반실",
            check_interval=30,
        ),
    ]

    run_all(configs)
