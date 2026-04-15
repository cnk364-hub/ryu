"""
FastAPI 메인 애플리케이션
- 템플릿/정적 파일 서빙
- REST API: 프로필, 설정, 이력, 엔진 제어
- WebSocket: /ws/logs 실시간 로그 스트리밍
"""
import asyncio
import io
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

import database as db
from engine import ReservationEngine
from ktx_adapter import KTX_STATIONS, KTXAdapter

logger = logging.getLogger("ktx")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

# 메모리 로그 버퍼 (다운로드용)
LOG_BUFFER: List[dict] = []
LOG_BUFFER_MAX = 1000


# ---------- WebSocket 매니저 ----------

class WSManager:
    def __init__(self):
        self.active: List[WebSocket] = []
        self.lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.active.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self.lock:
            if ws in self.active:
                self.active.remove(ws)

    async def broadcast(self, data: dict):
        text = json.dumps(data, ensure_ascii=False)
        async with self.lock:
            dead: List[WebSocket] = []
            for ws in self.active:
                try:
                    await ws.send_text(text)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                if ws in self.active:
                    self.active.remove(ws)


log_manager = WSManager()
state_manager = WSManager()

_loop: Optional[asyncio.AbstractEventLoop] = None


def _emit_log(level: str, message: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = {"ts": ts, "level": level, "message": message}
    LOG_BUFFER.append(entry)
    if len(LOG_BUFFER) > LOG_BUFFER_MAX:
        del LOG_BUFFER[: len(LOG_BUFFER) - LOG_BUFFER_MAX]
    logger.log(
        logging.ERROR if level == "ERROR"
        else logging.WARNING if level == "WARNING"
        else logging.INFO,
        message,
    )
    if _loop is not None:
        try:
            asyncio.run_coroutine_threadsafe(
                log_manager.broadcast({"type": "log", **entry}), _loop
            )
        except Exception:
            pass


def _emit_state(state: dict):
    if _loop is not None:
        try:
            asyncio.run_coroutine_threadsafe(
                state_manager.broadcast({"type": "state", **state}), _loop
            )
        except Exception:
            pass


engine = ReservationEngine(log_callback=_emit_log, state_callback=_emit_state)


# ---------- 라이프사이클 ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_running_loop()
    db.init_db()
    _emit_log("INFO", "KTX 자동예약 서비스 시작")
    yield
    engine.stop("서버 종료")


app = FastAPI(title="KTX 자동예약", lifespan=lifespan)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)


# ---------- Pydantic 모델 ----------

class ProfileCreateReq(BaseModel):
    name: str = Field(..., min_length=1, max_length=20)
    korail_id: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class ProfileUpdateReq(BaseModel):
    name: str
    korail_id: str
    password: Optional[str] = None


class LoginTestReq(BaseModel):
    korail_id: str
    password: str


class SettingsReq(BaseModel):
    dep_station: str
    arr_station: str
    dep_date: str
    time_from: str = "06:00"
    time_to: str = "22:00"
    seat_class: str = "ANY"
    passengers: int = 1


# ---------- 화면 ----------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    # Starlette 0.30+ / Jinja2 최신 호환 시그니처 (request 를 첫 인자로)
    return templates.TemplateResponse(
        request, "index.html", {"stations": KTX_STATIONS}
    )


# ---------- 메타 ----------

@app.get("/api/stations")
async def get_stations():
    return {"stations": KTX_STATIONS}


@app.get("/api/state")
async def get_state():
    return engine.snapshot()


# ---------- 프로필 ----------

@app.get("/api/profiles")
async def list_profiles():
    return {"profiles": db.list_profiles()}


@app.post("/api/profiles")
async def create_profile(req: ProfileCreateReq):
    try:
        pid = db.create_profile(req.name, req.korail_id, req.password)
        return {"id": pid}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/profiles/{pid}")
async def update_profile(pid: int, req: ProfileUpdateReq):
    db.update_profile(pid, req.name, req.korail_id, req.password)
    return {"ok": True}


@app.delete("/api/profiles/{pid}")
async def delete_profile(pid: int):
    db.delete_profile(pid)
    return {"ok": True}


@app.post("/api/profiles/{pid}/select")
async def select_profile(pid: int):
    db.select_profile(pid)
    return {"ok": True}


@app.post("/api/login-test")
async def login_test(req: LoginTestReq):
    adapter = KTXAdapter(req.korail_id, req.password)
    try:
        ok = await asyncio.to_thread(adapter.login)
        if ok:
            _emit_log("SUCCESS", f"로그인 테스트 성공: {req.korail_id}")
            return {"ok": True, "message": "로그인 성공"}
        return JSONResponse({"ok": False, "message": "로그인 실패"}, status_code=400)
    except Exception as e:
        _emit_log("ERROR", f"로그인 테스트 실패: {e}")
        return JSONResponse({"ok": False, "message": f"로그인 실패: {e}"}, status_code=400)


# ---------- 설정 ----------

@app.get("/api/settings")
async def get_settings():
    return db.get_settings()


@app.post("/api/settings")
async def save_settings(req: SettingsReq):
    if req.dep_station == req.arr_station:
        raise HTTPException(status_code=400, detail="출발역과 도착역이 같습니다.")
    try:
        datetime.strptime(req.dep_date, "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail="날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).")
    db.save_settings(req.model_dump())
    _emit_log("INFO", f"설정 저장: {req.dep_station} → {req.arr_station} {req.dep_date} {req.time_from}~{req.time_to}")
    return {"ok": True}


# ---------- 이력 ----------

@app.get("/api/history")
async def get_history():
    return {"items": db.list_history(100)}


@app.delete("/api/history")
async def clear_history():
    db.clear_history()
    return {"ok": True}


# ---------- 엔진 제어 ----------

@app.post("/api/engine/start")
async def engine_start():
    ok = engine.start()
    if not ok and not engine.is_running():
        raise HTTPException(status_code=400, detail="엔진을 시작할 수 없습니다. 로그를 확인하세요.")
    return {"ok": True, "state": engine.snapshot()}


@app.post("/api/engine/stop")
async def engine_stop():
    engine.stop()
    return {"ok": True, "state": engine.snapshot()}


# ---------- 로그 ----------

@app.get("/api/logs")
async def get_logs():
    return {"items": LOG_BUFFER[-500:]}


@app.delete("/api/logs")
async def clear_logs():
    LOG_BUFFER.clear()
    return {"ok": True}


@app.get("/api/logs/download")
async def download_logs():
    buf = io.StringIO()
    for entry in LOG_BUFFER:
        buf.write(f"[{entry['ts']}] [{entry['level']}] {entry['message']}\n")
    data = buf.getvalue().encode("utf-8")
    filename = f"ktx-logs-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- WebSocket ----------

@app.websocket("/ws/logs")
async def ws_logs(ws: WebSocket):
    await log_manager.connect(ws)
    try:
        # 접속 즉시 최근 로그 50건 전송
        for entry in LOG_BUFFER[-50:]:
            await ws.send_text(json.dumps({"type": "log", **entry}, ensure_ascii=False))
        while True:
            # 클라이언트 ping 수신
            await ws.receive_text()
    except WebSocketDisconnect:
        await log_manager.disconnect(ws)
    except Exception:
        await log_manager.disconnect(ws)


@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    await state_manager.connect(ws)
    try:
        await ws.send_text(json.dumps({"type": "state", **engine.snapshot()}, ensure_ascii=False))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        await state_manager.disconnect(ws)
    except Exception:
        await state_manager.disconnect(ws)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), reload=False)
