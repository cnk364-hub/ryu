"""FastAPI 서버 + WebSocket 실시간 로그."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import threading
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import database as db
from engine import LOG_FILE, engine
from notifier import send_kakao
from srt_adapter import SRT_STATIONS, adapter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    # 엔진 로그버스를 메인 이벤트루프에 바인딩 (스레드 → asyncio 큐 전달용)
    engine.log_bus.bind_loop(asyncio.get_running_loop())
    logger.info("앱 시작 완료")
    yield
    logger.info("앱 종료")


app = FastAPI(title="SRT 자동예약", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
# Python 3.14 + Jinja2 3.1.x LRUCache 호환성 이슈 우회: 캐시 비활성화
try:
    templates.env.cache = None
except Exception:  # pragma: no cover - 환경에 따라 속성 접근 실패 가능
    pass


# ---- 페이지 ------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # starlette 신/구 시그니처 호환
    try:
        return templates.TemplateResponse(
            request, "index.html", {"stations": SRT_STATIONS}
        )
    except TypeError:
        return templates.TemplateResponse(
            "index.html", {"request": request, "stations": SRT_STATIONS}
        )


# ---- 상태/제어 ----------------------------------------------------------------
@app.get("/api/state")
async def api_state():
    return engine.state.to_dict()


@app.post("/api/start")
async def api_start():
    ok, msg = engine.start()
    return {"ok": ok, "message": msg, "state": engine.state.to_dict()}


@app.post("/api/stop")
async def api_stop():
    ok, msg = engine.stop()
    return {"ok": ok, "message": msg, "state": engine.state.to_dict()}


# ---- 설정 --------------------------------------------------------------------
@app.get("/api/settings")
async def api_settings():
    s = db.get_all_settings(mask_sensitive=True)
    # 예약 설정은 JSON 파싱
    cfg_raw = s.get("reservation_cfg", "")
    cfg: dict = {}
    if cfg_raw:
        try:
            cfg = json.loads(cfg_raw)
        except json.JSONDecodeError:
            cfg = {}
    return {
        "srt_id": s.get("srt_id", ""),
        "srt_password_saved": bool(db.get_setting("srt_password", "")),
        "srt_password_masked": s.get("srt_password", ""),
        "kakao_access_token_saved": bool(db.get_setting("kakao_access_token", "")),
        "kakao_refresh_token_saved": bool(db.get_setting("kakao_refresh_token", "")),
        "kakao_rest_api_key": s.get("kakao_rest_api_key", ""),
        "reservation_cfg": cfg,
        "stations": SRT_STATIONS,
    }


@app.post("/api/settings/account")
async def api_save_account(payload: dict):
    if "srt_id" in payload:
        db.set_setting("srt_id", payload["srt_id"] or "")
    if payload.get("srt_password"):
        db.set_setting("srt_password", payload["srt_password"])
    if "kakao_access_token" in payload and payload["kakao_access_token"]:
        db.set_setting("kakao_access_token", payload["kakao_access_token"])
    if "kakao_refresh_token" in payload and payload["kakao_refresh_token"]:
        db.set_setting("kakao_refresh_token", payload["kakao_refresh_token"])
    if "kakao_rest_api_key" in payload:
        db.set_setting("kakao_rest_api_key", payload["kakao_rest_api_key"] or "")
    return {"ok": True, "message": "저장되었습니다."}


@app.post("/api/settings/reservation")
async def api_save_reservation(payload: dict):
    required = [
        "dep_station",
        "arr_station",
        "dep_date",
        "time_from",
        "time_to",
        "seat_type",
        "passengers",
    ]
    for k in required:
        if payload.get(k) in (None, ""):
            raise HTTPException(status_code=400, detail=f"필수값 누락: {k}")
    if payload["dep_station"] == payload["arr_station"]:
        raise HTTPException(status_code=400, detail="출발역과 도착역이 같습니다.")
    try:
        passengers = int(payload["passengers"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="인원수가 올바르지 않습니다.")
    if not 1 <= passengers <= 4:
        raise HTTPException(status_code=400, detail="인원수는 1~4명입니다.")

    cfg = {
        "dep_station": payload["dep_station"],
        "arr_station": payload["arr_station"],
        "dep_date": payload["dep_date"],
        "time_from": payload["time_from"],
        "time_to": payload["time_to"],
        "seat_type": payload["seat_type"],
        "passengers": passengers,
    }
    db.set_setting("reservation_cfg", json.dumps(cfg, ensure_ascii=False))
    return {"ok": True, "message": "예약 설정 저장 완료", "cfg": cfg}


# ---- 테스트 ------------------------------------------------------------------
@app.post("/api/test/srt-login")
async def api_test_srt_login():
    srt_id = db.get_setting("srt_id", "")
    srt_pw = db.get_setting("srt_password", "")
    if not srt_id or not srt_pw:
        return {"ok": False, "message": "아이디/비밀번호가 저장되어 있지 않습니다."}
    try:
        await asyncio.to_thread(adapter.login, srt_id, srt_pw)
    except Exception as e:
        return {"ok": False, "message": f"로그인 실패: {e}"}
    return {"ok": True, "message": "SRT 로그인 성공"}


@app.post("/api/test/kakao")
async def api_test_kakao():
    ok, msg = await asyncio.to_thread(
        send_kakao, "✅ SRT 자동예약 앱 카카오톡 테스트 메시지입니다."
    )
    return {"ok": ok, "message": msg}


# ---- 이력 --------------------------------------------------------------------
@app.get("/api/history")
async def api_history():
    return {"items": db.list_history(limit=50)}


@app.delete("/api/history")
async def api_history_clear():
    db.clear_history()
    return {"ok": True, "message": "이력이 초기화되었습니다."}


# ---- 로그 --------------------------------------------------------------------
@app.get("/api/logs")
async def api_logs():
    return {"items": list(engine.log_bus.buffer)}


@app.delete("/api/logs")
async def api_logs_clear():
    engine.log_bus.clear()
    return {"ok": True, "message": "로그가 초기화되었습니다."}


@app.get("/api/logs/download")
async def api_logs_download():
    if not LOG_FILE.exists():
        # 빈 파일 생성
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOG_FILE.touch()
    return FileResponse(LOG_FILE, filename="srt.log", media_type="text/plain")


# ---- WebSocket (실시간 로그) --------------------------------------------------
@app.websocket("/ws/logs")
async def ws_logs(ws: WebSocket):
    await ws.accept()
    q = engine.log_bus.subscribe()
    try:
        while True:
            item = await q.get()
            await ws.send_json(item)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WS 에러: %s", e)
    finally:
        engine.log_bus.unsubscribe(q)


# ---- 로컬 IP 안내 ------------------------------------------------------------
@app.get("/api/netinfo")
async def api_netinfo():
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except OSError:
        pass
    return {"local_ip": ip, "port": int(os.environ.get("PORT", 8000))}


def _open_browser_later(url: str) -> None:
    def _open():
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Timer(1.5, _open).start()


def main():
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    if os.environ.get("OPEN_BROWSER", "1") == "1":
        _open_browser_later(f"http://localhost:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
