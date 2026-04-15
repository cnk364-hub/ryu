"""Tkinter GUI for SRT/KTX 자동 예약.

실행:
    python gui.py

자격정보·카카오 토큰은 OS 키체인(keyring)에 저장되며,
체크박스를 풀고 시작하면 메모리에만 유지된다(창 닫으면 사라짐).
"""
from __future__ import annotations

import logging
import queue
import threading
import tkinter as tk
from datetime import datetime
from tkinter import messagebox, ttk
from typing import List, Optional

import secrets_store
from adapters import KTXAdapter, SRTAdapter, TrainAdapter
from config import ReserveConfig
from logger import get_logger

logger = get_logger("gui")

TRAIN_TYPES = ["SRT", "KTX"]
SEAT_TYPES = ["일반실", "특실"]


class _TextHandler(logging.Handler):
    def __init__(self, log_queue: "queue.Queue[str]") -> None:
        super().__init__()
        self.log_queue = log_queue

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.log_queue.put_nowait(self.format(record))
        except queue.Full:
            pass


class KakaoDialog(tk.Toplevel):
    """카카오 토큰 3종 입력/저장 다이얼로그."""

    def __init__(self, parent: tk.Tk) -> None:
        super().__init__(parent)
        self.title("카카오 알림 설정")
        self.resizable(False, False)
        self.grab_set()

        existing = secrets_store.load_kakao()

        frm = ttk.Frame(self, padding=12)
        frm.pack(fill="both", expand=True)

        ttk.Label(frm, text="Access Token").grid(row=0, column=0, sticky="w", pady=4)
        self.access = tk.StringVar(value=existing["access_token"])
        ttk.Entry(frm, textvariable=self.access, width=55, show="*").grid(row=0, column=1)

        ttk.Label(frm, text="Refresh Token").grid(row=1, column=0, sticky="w", pady=4)
        self.refresh = tk.StringVar(value=existing["refresh_token"])
        ttk.Entry(frm, textvariable=self.refresh, width=55, show="*").grid(row=1, column=1)

        ttk.Label(frm, text="REST API Key").grid(row=2, column=0, sticky="w", pady=4)
        self.rest = tk.StringVar(value=existing["rest_api_key"])
        ttk.Entry(frm, textvariable=self.rest, width=55, show="*").grid(row=2, column=1)

        self.persist = tk.BooleanVar(value=bool(existing["access_token"]))
        ttk.Checkbutton(
            frm, text="이 기기 키체인(자격 증명 관리자)에 저장",
            variable=self.persist,
        ).grid(row=3, column=0, columnspan=2, sticky="w", pady=(8, 4))

        note = (
            "※ 저장 시 Windows 자격 증명 관리자에 암호화되어 보관되며\n"
            "   코드/Git 에는 절대 남지 않습니다.\n"
            "※ 체크 해제하면 저장된 값이 삭제됩니다."
        )
        ttk.Label(frm, text=note, foreground="#666").grid(
            row=4, column=0, columnspan=2, sticky="w", pady=(0, 8)
        )

        btns = ttk.Frame(frm)
        btns.grid(row=5, column=0, columnspan=2, sticky="e")
        ttk.Button(btns, text="저장", command=self._on_save).pack(side="right", padx=5)
        ttk.Button(btns, text="취소", command=self.destroy).pack(side="right")

    def _on_save(self) -> None:
        if self.persist.get():
            secrets_store.save_kakao(
                self.access.get().strip(),
                self.refresh.get().strip(),
                self.rest.get().strip(),
            )
            messagebox.showinfo("저장됨", "카카오 토큰을 이 기기 키체인에 저장했습니다.")
        else:
            secrets_store.clear_kakao()
            messagebox.showinfo("삭제됨", "키체인에서 카카오 토큰을 제거했습니다.")
        self.destroy()


class ReserveApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("기차표 자동예약 (SRT / KTX)")
        self.root.geometry("860x760")
        self.root.minsize(820, 680)

        self.adapters: List[TrainAdapter] = []
        self.threads: List[threading.Thread] = []
        self._configs: List[ReserveConfig] = []
        self.log_queue: "queue.Queue[str]" = queue.Queue(maxsize=2000)

        self._build_widgets()
        self._install_log_handler()
        self.root.after(100, self._poll_log_queue)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        # keyring 상태 로그
        if not secrets_store.available():
            logger.warning(
                "keyring 모듈을 불러올 수 없어 '이 기기에 저장' 기능이 비활성화됩니다. "
                "pip install keyring 후 재실행하세요."
            )

        # 초기 자격정보 자동 채움
        self._load_credentials_into_form()

    # ---------------- UI ----------------
    def _build_widgets(self) -> None:
        form = ttk.LabelFrame(self.root, text="예약 조건 입력", padding=10)
        form.pack(fill="x", padx=10, pady=(10, 5))

        # 열차종류 / 좌석
        ttk.Label(form, text="열차 종류").grid(row=0, column=0, sticky="w", pady=3)
        self.train_type = tk.StringVar(value="SRT")
        cb = ttk.Combobox(
            form, textvariable=self.train_type, values=TRAIN_TYPES,
            width=10, state="readonly",
        )
        cb.grid(row=0, column=1, sticky="w")
        cb.bind("<<ComboboxSelected>>", lambda _e: self._load_credentials_into_form())

        ttk.Label(form, text="좌석").grid(row=0, column=2, sticky="w", padx=(20, 0))
        self.seat_type = tk.StringVar(value="일반실")
        ttk.Combobox(
            form, textvariable=self.seat_type, values=SEAT_TYPES,
            width=10, state="readonly",
        ).grid(row=0, column=3, sticky="w")

        # 아이디 / 비번 + 저장 체크박스
        ttk.Label(form, text="아이디").grid(row=1, column=0, sticky="w", pady=3)
        self.user_id = tk.StringVar()
        ttk.Entry(form, textvariable=self.user_id, width=24).grid(row=1, column=1, sticky="w")

        ttk.Label(form, text="비밀번호").grid(row=1, column=2, sticky="w", padx=(20, 0))
        self.user_pw = tk.StringVar()
        ttk.Entry(form, textvariable=self.user_pw, width=24, show="*").grid(row=1, column=3, sticky="w")

        self.persist_credentials = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            form,
            text="아이디/비밀번호를 이 기기에 저장 (열차종류별 분리 보관)",
            variable=self.persist_credentials,
        ).grid(row=2, column=0, columnspan=4, sticky="w", pady=(2, 6))

        # 출발/도착
        ttk.Label(form, text="출발역").grid(row=3, column=0, sticky="w", pady=3)
        self.dep = tk.StringVar(value="수서")
        ttk.Entry(form, textvariable=self.dep, width=24).grid(row=3, column=1, sticky="w")

        ttk.Label(form, text="도착역").grid(row=3, column=2, sticky="w", padx=(20, 0))
        self.arr = tk.StringVar(value="부산")
        ttk.Entry(form, textvariable=self.arr, width=24).grid(row=3, column=3, sticky="w")

        # 날짜/시각
        ttk.Label(form, text="날짜 (YYYYMMDD)").grid(row=4, column=0, sticky="w", pady=3)
        self.date = tk.StringVar(value=datetime.now().strftime("%Y%m%d"))
        ttk.Entry(form, textvariable=self.date, width=24).grid(row=4, column=1, sticky="w")

        ttk.Label(form, text="시각 (HHMMSS)").grid(row=4, column=2, sticky="w", padx=(20, 0))
        self.time = tk.StringVar(value="080000")
        ttk.Entry(form, textvariable=self.time, width=24).grid(row=4, column=3, sticky="w")

        # 조회 간격
        ttk.Label(form, text="조회 간격(초)").grid(row=5, column=0, sticky="w", pady=3)
        self.interval = tk.IntVar(value=30)
        ttk.Spinbox(
            form, from_=10, to=600, textvariable=self.interval, width=10, increment=5,
        ).grid(row=5, column=1, sticky="w")

        # 조건 버튼
        btn_row = ttk.Frame(self.root)
        btn_row.pack(fill="x", padx=10, pady=(2, 5))
        ttk.Button(btn_row, text="＋ 조건 추가", command=self._add_config).pack(side="left")
        ttk.Button(btn_row, text="선택 삭제", command=self._remove_config).pack(side="left", padx=5)
        ttk.Button(btn_row, text="⚙ 카카오 설정", command=self._open_kakao_dialog).pack(side="left", padx=5)
        ttk.Button(btn_row, text="🗑 저장된 계정 지우기", command=self._clear_credentials).pack(side="left", padx=5)

        # 조건 목록
        list_frame = ttk.LabelFrame(self.root, text="동시 감시 목록", padding=5)
        list_frame.pack(fill="x", padx=10, pady=5)

        cols = ("type", "id", "dep", "arr", "date", "time", "seat", "interval")
        headers = {
            "type": "종류", "id": "아이디", "dep": "출발", "arr": "도착",
            "date": "날짜", "time": "시각", "seat": "좌석", "interval": "간격(초)",
        }
        widths = {
            "type": 60, "id": 140, "dep": 80, "arr": 80,
            "date": 90, "time": 80, "seat": 70, "interval": 70,
        }
        self.tree = ttk.Treeview(list_frame, columns=cols, show="headings", height=4)
        for c in cols:
            self.tree.heading(c, text=headers[c])
            self.tree.column(c, width=widths[c], anchor="center")
        self.tree.pack(fill="x")

        # 실행 버튼
        run_row = ttk.Frame(self.root)
        run_row.pack(fill="x", padx=10, pady=5)
        self.start_btn = ttk.Button(run_row, text="▶ 예약 시작", command=self._start)
        self.start_btn.pack(side="left")
        self.stop_btn = ttk.Button(run_row, text="■ 중지", command=self._stop, state="disabled")
        self.stop_btn.pack(side="left", padx=5)
        self.status = ttk.Label(run_row, text="● 대기 중", foreground="#555")
        self.status.pack(side="left", padx=15)

        # 로그
        log_frame = ttk.LabelFrame(self.root, text="실행 로그", padding=5)
        log_frame.pack(fill="both", expand=True, padx=10, pady=(5, 10))

        self.log_text = tk.Text(
            log_frame, height=15, wrap="none", state="disabled",
            bg="#1e1e1e", fg="#d4d4d4", insertbackground="#d4d4d4",
            font=("Consolas", 9),
        )
        yscroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=yscroll.set)
        self.log_text.pack(side="left", fill="both", expand=True)
        yscroll.pack(side="right", fill="y")

    # ---------------- keyring 연동 ----------------
    def _load_credentials_into_form(self) -> None:
        creds = secrets_store.load_credentials(self.train_type.get())
        self.user_id.set(creds["user_id"])
        self.user_pw.set(creds["user_pw"])

    def _clear_credentials(self) -> None:
        tt = self.train_type.get()
        if messagebox.askyesno("확인", f"{tt} 저장된 아이디/비밀번호를 키체인에서 삭제할까요?"):
            secrets_store.clear_credentials(tt)
            self.user_id.set("")
            self.user_pw.set("")
            messagebox.showinfo("삭제됨", f"{tt} 자격정보를 지웠습니다.")

    def _open_kakao_dialog(self) -> None:
        KakaoDialog(self.root)

    # ---------------- 로그 파이프라인 ----------------
    def _install_log_handler(self) -> None:
        handler = _TextHandler(self.log_queue)
        handler.setFormatter(
            logging.Formatter(
                "[%(asctime)s] [%(levelname)s] %(name)s - %(message)s",
                datefmt="%H:%M:%S",
            )
        )
        root_logger = logging.getLogger()
        root_logger.addHandler(handler)
        if root_logger.level > logging.INFO or root_logger.level == logging.NOTSET:
            root_logger.setLevel(logging.INFO)

    def _poll_log_queue(self) -> None:
        try:
            while True:
                msg = self.log_queue.get_nowait()
                self.log_text.configure(state="normal")
                self.log_text.insert("end", msg + "\n")
                self.log_text.see("end")
                self.log_text.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(100, self._poll_log_queue)

    # ---------------- config 핸들링 ----------------
    def _current_config(self) -> Optional[ReserveConfig]:
        uid = self.user_id.get().strip()
        upw = self.user_pw.get()
        if not uid or not upw:
            messagebox.showerror("입력 오류", "아이디/비밀번호를 입력하세요.")
            return None

        date = self.date.get().strip().replace("-", "")
        time_ = self.time.get().strip().replace(":", "")
        if len(time_) == 4:
            time_ += "00"
        if len(date) != 8 or not date.isdigit():
            messagebox.showerror("입력 오류", "날짜는 YYYYMMDD 형식 8자리여야 합니다.")
            return None
        if len(time_) != 6 or not time_.isdigit():
            messagebox.showerror("입력 오류", "시각은 HHMMSS(또는 HHMM) 형식이어야 합니다.")
            return None

        # 자격정보 저장 (체크 시)
        if self.persist_credentials.get():
            secrets_store.save_credentials(self.train_type.get(), uid, upw)

        # 카카오 토큰은 키체인에서 로드
        kakao = secrets_store.load_kakao()
        persist_kakao = bool(kakao["access_token"])

        try:
            return ReserveConfig(
                train_type=self.train_type.get(),
                user_id=uid,
                user_pw=upw,
                dep=self.dep.get().strip(),
                arr=self.arr.get().strip(),
                date=date,
                time=time_,
                seat_type=self.seat_type.get(),
                check_interval=int(self.interval.get()),
                kakao_access_token=kakao["access_token"],
                kakao_refresh_token=kakao["refresh_token"],
                kakao_rest_api_key=kakao["rest_api_key"],
                persist_kakao_tokens=persist_kakao,
            )
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("설정 오류", f"{exc}")
            return None

    def _add_config(self) -> None:
        c = self._current_config()
        if c is None:
            return
        self._configs.append(c)
        self.tree.insert(
            "", "end",
            values=(c.train_type, c.user_id, c.dep, c.arr, c.date, c.time, c.seat_type, c.check_interval),
        )
        logger.info("조건 추가: %s %s→%s %s %s", c.train_type, c.dep, c.arr, c.date, c.time)

    def _remove_config(self) -> None:
        for item in self.tree.selection():
            idx = self.tree.index(item)
            self.tree.delete(item)
            if 0 <= idx < len(self._configs):
                removed = self._configs.pop(idx)
                logger.info("조건 삭제: %s %s→%s", removed.train_type, removed.dep, removed.arr)

    # ---------------- 실행/중지 ----------------
    @staticmethod
    def _build_adapter(config: ReserveConfig) -> TrainAdapter:
        if config.train_type.upper() == "SRT":
            return SRTAdapter(config)
        if config.train_type.upper() == "KTX":
            return KTXAdapter(config)
        raise ValueError(f"지원하지 않는 열차 종류: {config.train_type}")

    def _start(self) -> None:
        targets = list(self._configs)
        if not targets:
            c = self._current_config()
            if c is None:
                return
            targets = [c]

        # 카카오 토큰 유무 경고 (계속 진행은 허용)
        if not targets[0].kakao_access_token:
            if not messagebox.askyesno(
                "카카오 토큰 없음",
                "카카오 토큰이 저장되어 있지 않아 예약 성공 시 카톡 알림이 가지 않습니다.\n"
                "그래도 실행할까요?",
            ):
                return

        try:
            self.adapters = [self._build_adapter(c) for c in targets]
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("실행 오류", str(exc))
            return

        self.threads = []
        for adp in self.adapters:
            t = threading.Thread(
                target=adp.run,
                name=f"{adp.config.train_type}-{adp.config.dep}->{adp.config.arr}",
                daemon=True,
            )
            t.start()
            self.threads.append(t)

        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.status.configure(text=f"● 실행 중 ({len(self.adapters)}개)", foreground="#2e7d32")

    def _stop(self) -> None:
        if not self.adapters:
            return
        for adp in self.adapters:
            adp.stop()
        self.status.configure(text="● 중지 요청됨...", foreground="#e65100")
        self._wait_for_stop()

    def _wait_for_stop(self) -> None:
        if any(t.is_alive() for t in self.threads):
            self.root.after(300, self._wait_for_stop)
            return
        self.adapters = []
        self.threads = []
        self.status.configure(text="● 대기 중", foreground="#555")
        self.start_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")

    def _on_close(self) -> None:
        if self.adapters:
            if not messagebox.askyesno("종료", "실행 중인 감시 작업이 있습니다. 정말 종료할까요?"):
                return
            for adp in self.adapters:
                adp.stop()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    try:
        ttk.Style().theme_use("vista")
    except tk.TclError:
        pass
    ReserveApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
