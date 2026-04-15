// SRT 자동예약 프론트엔드
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const toastEl = $("#appToast");
  const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  const successModal = new bootstrap.Modal($("#successModal"));

  function showToast(msg, variant = "dark") {
    $("#appToastBody").textContent = msg;
    toastEl.className = `toast align-items-center text-bg-${variant} border-0`;
    toast.show();
  }
  function showSpinner(on) {
    $("#spinner").classList.toggle("d-none", !on);
  }
  function haptic() {
    if (navigator.vibrate) navigator.vibrate(8);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }

  // ---- 탭 전환 ------------------------------------------------------------
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic();
      const tab = btn.dataset.tab;
      $$(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab-page").forEach((p) =>
        p.classList.toggle("d-none", p.id !== `page-${tab}`)
      );
      if (tab === "history") loadHistory();
      if (tab === "logs") scrollLogsToBottom();
    });
  });

  // ---- 초기 데이터 --------------------------------------------------------
  const STATIONS = JSON.parse($("#stationsData").textContent);

  function fillStationSelects(cfg) {
    const depSel = document.querySelector('select[name="dep_station"]');
    const arrSel = document.querySelector('select[name="arr_station"]');
    depSel.innerHTML = "";
    arrSel.innerHTML = "";
    STATIONS.forEach((s) => {
      depSel.appendChild(new Option(s, s));
      arrSel.appendChild(new Option(s, s));
    });
    depSel.value = cfg?.dep_station || "수서";
    arrSel.value = cfg?.arr_station || "부산";
  }

  function setDateDefault(cfg) {
    const input = document.querySelector('input[name="dep_date"]');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    input.min = `${yyyy}-${mm}-${dd}`;
    input.value = cfg?.dep_date || `${yyyy}-${mm}-${dd}`;
  }

  // ---- 설정 로드 ----------------------------------------------------------
  async function loadSettings() {
    const s = await api("/api/settings");
    fillStationSelects(s.reservation_cfg);
    setDateDefault(s.reservation_cfg);

    const cfg = s.reservation_cfg || {};
    if (cfg.time_from) document.querySelector('[name="time_from"]').value = cfg.time_from;
    if (cfg.time_to) document.querySelector('[name="time_to"]').value = cfg.time_to;
    if (cfg.seat_type) {
      const r = document.querySelector(`[name="seat_type"][value="${cfg.seat_type}"]`);
      if (r) r.checked = true;
    }
    if (cfg.passengers) {
      document.getElementById("paxRange").value = cfg.passengers;
      document.getElementById("paxLabel").textContent = cfg.passengers;
    }

    // 계정
    document.querySelector('[name="srt_id"]').value = s.srt_id || "";
    document.querySelector('[name="kakao_rest_api_key"]').value = s.kakao_rest_api_key || "";
    $("#srtPwHint").textContent = s.srt_password_saved
      ? "저장됨: " + (s.srt_password_masked || "****")
      : "저장된 비밀번호가 없습니다.";
    $("#kakaoAtHint").textContent = s.kakao_access_token_saved
      ? "저장됨 (변경하려면 새로 입력)"
      : "저장된 값이 없습니다.";
    $("#kakaoRtHint").textContent = s.kakao_refresh_token_saved
      ? "저장됨 (변경하려면 새로 입력)"
      : "저장된 값이 없습니다.";

    renderCurrentCfg(cfg);
  }

  function renderCurrentCfg(cfg) {
    const el = $("#currentCfg");
    if (!cfg || !cfg.dep_station) {
      el.textContent = "설정되지 않음";
      return;
    }
    const seat = { general: "일반실", special: "특실", both: "일반실/특실" }[cfg.seat_type] || cfg.seat_type;
    el.innerHTML = `
      <div><b>${cfg.dep_station} → ${cfg.arr_station}</b></div>
      <div>${cfg.dep_date} (${cfg.time_from} ~ ${cfg.time_to})</div>
      <div>${seat} · ${cfg.passengers}명</div>
    `;
  }

  // ---- 인원 슬라이더 ------------------------------------------------------
  document.getElementById("paxRange").addEventListener("input", (e) => {
    $("#paxLabel").textContent = e.target.value;
  });

  // ---- 비밀번호 토글 ------------------------------------------------------
  document.getElementById("togglePw").addEventListener("click", () => {
    const inp = document.getElementById("srtPw");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  // ---- 예약 설정 저장 -----------------------------------------------------
  document.getElementById("formReservation").addEventListener("submit", async (e) => {
    e.preventDefault();
    haptic();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (payload.dep_station === payload.arr_station) {
      showToast("출발역과 도착역이 같습니다.", "danger");
      return;
    }
    if (payload.time_from >= payload.time_to) {
      showToast("시작 시각이 종료 시각보다 빨라야 합니다.", "danger");
      return;
    }
    showSpinner(true);
    try {
      const r = await api("/api/settings/reservation", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast(r.message || "저장됨", "success");
      renderCurrentCfg(r.cfg);
    } catch (err) {
      showToast("저장 실패: " + err.message, "danger");
    } finally {
      showSpinner(false);
    }
  });

  // ---- 계정 저장 ----------------------------------------------------------
  document.getElementById("formAccount").addEventListener("submit", async (e) => {
    e.preventDefault();
    haptic();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    showSpinner(true);
    try {
      const r = await api("/api/settings/account", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast(r.message || "저장됨", "success");
      // 입력한 비번 등은 비우고 힌트 업데이트
      document.getElementById("srtPw").value = "";
      document.querySelector('[name="kakao_access_token"]').value = "";
      document.querySelector('[name="kakao_refresh_token"]').value = "";
      await loadSettings();
    } catch (err) {
      showToast("저장 실패: " + err.message, "danger");
    } finally {
      showSpinner(false);
    }
  });

  // ---- 부분 저장 --------------------------------------------------------
  async function saveAccountFields(keys) {
    const form = document.getElementById("formAccount");
    const fd = new FormData(form);
    const payload = {};
    keys.forEach((k) => {
      const v = fd.get(k);
      if (v !== null) payload[k] = v;
    });
    return api("/api/settings/account", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  document.getElementById("btnSaveSrt").addEventListener("click", async () => {
    haptic();
    showSpinner(true);
    try {
      const r = await saveAccountFields(["srt_id", "srt_password"]);
      showToast(r.message || "SRT 계정 저장됨", "success");
      document.getElementById("srtPw").value = "";
      await loadSettings();
    } catch (err) {
      showToast("저장 실패: " + err.message, "danger");
    } finally {
      showSpinner(false);
    }
  });

  document.getElementById("btnSaveKakao").addEventListener("click", async () => {
    haptic();
    showSpinner(true);
    try {
      const r = await saveAccountFields([
        "kakao_rest_api_key",
        "kakao_access_token",
        "kakao_refresh_token",
      ]);
      showToast(r.message || "카카오 설정 저장됨", "success");
      document.querySelector('[name="kakao_access_token"]').value = "";
      document.querySelector('[name="kakao_refresh_token"]').value = "";
      await loadSettings();
    } catch (err) {
      showToast("저장 실패: " + err.message, "danger");
    } finally {
      showSpinner(false);
    }
  });

  // ---- 테스트 버튼 (저장 후 실행) ------------------------------------------
  document.getElementById("btnTestLogin").addEventListener("click", async () => {
    haptic();
    showSpinner(true);
    try {
      // 현재 폼의 값이 있으면 먼저 저장
      await saveAccountFields(["srt_id", "srt_password"]);
      document.getElementById("srtPw").value = "";
      const r = await api("/api/test/srt-login", { method: "POST" });
      showToast(r.message, r.ok ? "success" : "danger");
      await loadSettings();
    } catch (err) {
      showToast("요청 실패: " + err.message, "danger");
    } finally {
      showSpinner(false);
    }
  });
  document.getElementById("btnTestKakao").addEventListener("click", async () => {
    haptic();
    showSpinner(true);
    try {
      await saveAccountFields([
        "kakao_rest_api_key",
        "kakao_access_token",
        "kakao_refresh_token",
      ]);
      document.querySelector('[name="kakao_access_token"]').value = "";
      document.querySelector('[name="kakao_refresh_token"]').value = "";
      const r = await api("/api/test/kakao", { method: "POST" });
      showToast(r.message, r.ok ? "success" : "danger");
      await loadSettings();
    } catch (err) {
      showToast("요청 실패: " + err.message, "danger");
    } finally {
      showSpinner(false);
    }
  });

  // ---- 시작/중지 ---------------------------------------------------------
  $("#btnStart").addEventListener("click", async () => {
    haptic();
    try {
      const r = await api("/api/start", { method: "POST" });
      showToast(r.message, r.ok ? "success" : "warning");
    } catch (err) {
      showToast("시작 실패: " + err.message, "danger");
    }
  });
  $("#btnStop").addEventListener("click", async () => {
    haptic();
    try {
      const r = await api("/api/stop", { method: "POST" });
      showToast(r.message, "warning");
    } catch (err) {
      showToast("중지 실패: " + err.message, "danger");
    }
  });

  // ---- 상태 폴링 ---------------------------------------------------------
  let lastSuccessSeen = null;
  async function pollState() {
    try {
      const s = await api("/api/state");
      $("#statusText").textContent = s.status;
      const badge = $("#statusBadge");
      badge.textContent = s.status;
      badge.className = `badge rounded-pill status-${s.status}`;
      $("#totalChecks").textContent = s.total_checks;
      $("#lastCheck").textContent = s.last_check_at || "-";
      $("#btnStart").disabled = !!s.running;
      $("#btnStop").disabled = !s.running;

      // 카운트다운
      if (s.next_check_at_ts) {
        const remain = Math.max(0, s.next_check_at_ts - s.now_ts);
        $("#countdown").textContent = `${remain.toFixed(0)}s`;
      } else {
        $("#countdown").textContent = "--";
      }

      // 성공 팝업 (최초 1회만)
      if (s.last_success && JSON.stringify(s.last_success) !== lastSuccessSeen) {
        lastSuccessSeen = JSON.stringify(s.last_success);
        $("#successDetail").innerHTML = `SRT ${s.last_success.train_no}<br>${s.last_success.dep_time} → ${s.last_success.arr_time}`;
        successModal.show();
        if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 200]);
      }
    } catch (e) {
      // 조용히 무시
    }
  }
  setInterval(pollState, 1000);
  pollState();

  // ---- 이력 --------------------------------------------------------------
  async function loadHistory() {
    try {
      const r = await api("/api/history");
      const list = $("#historyList");
      list.innerHTML = "";
      if (!r.items || r.items.length === 0) {
        list.innerHTML = '<div class="text-muted text-center py-4">이력이 없습니다.</div>';
        return;
      }
      r.items.forEach((h) => {
        const ok = h.status === "성공";
        const el = document.createElement("div");
        el.className = "hist-item";
        el.innerHTML = `
          <div class="d-flex justify-content-between">
            <div class="small text-muted">${h.created_at}</div>
            <div class="${ok ? "tag-ok" : "tag-fail"}">${h.status}</div>
          </div>
          <div class="mt-1">${h.dep_station || ""} → ${h.arr_station || ""} ${h.train_no ? "· SRT " + h.train_no : ""}</div>
          <div class="small text-muted">${h.dep_date || ""} ${h.dep_time || ""}${h.elapsed != null ? ` · ${h.elapsed.toFixed(2)}s` : ""}</div>
          ${h.message ? `<div class="small mt-1">${escapeHtml(h.message)}</div>` : ""}
        `;
        list.appendChild(el);
      });
    } catch (e) {
      showToast("이력 조회 실패", "danger");
    }
  }
  $("#btnClearHistory").addEventListener("click", async () => {
    if (!confirm("모든 이력을 삭제할까요?")) return;
    await api("/api/history", { method: "DELETE" });
    loadHistory();
  });

  // ---- 로그 WebSocket ----------------------------------------------------
  const logView = $("#logView");
  function appendLog(item) {
    const el = document.createElement("span");
    el.className = "log-line";
    el.innerHTML = `<span class="log-ts">${item.ts}</span><span class="lvl-${item.level}">[${item.level}] ${escapeHtml(item.message)}</span>`;
    logView.appendChild(el);
    // 최대 1000줄
    while (logView.childElementCount > 1000) logView.removeChild(logView.firstChild);
    scrollLogsToBottom();
  }
  function scrollLogsToBottom() {
    logView.scrollTop = logView.scrollHeight;
  }
  $("#btnClearLogs").addEventListener("click", async () => {
    await api("/api/logs", { method: "DELETE" });
    logView.innerHTML = "";
  });

  // 초기 과거 로그
  (async () => {
    try {
      const r = await api("/api/logs");
      (r.items || []).forEach(appendLog);
    } catch {}
    connectWS();
  })();

  function connectWS() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/logs`);
    ws.onmessage = (e) => {
      try {
        const item = JSON.parse(e.data);
        appendLog(item);
        if (item.level === "SUCCESS" && item.message.includes("예약 성공")) {
          // 축하 모달은 상태 폴링에서 처리
        }
      } catch {}
    };
    ws.onclose = () => setTimeout(connectWS, 3000);
    ws.onerror = () => ws.close();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- 초기화 ------------------------------------------------------------
  loadSettings();
})();
