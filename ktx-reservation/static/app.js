// KTX 자동예약 - 프론트엔드 JS
(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    const api = async (method, url, body) => {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const r = await fetch(url, opts);
        if (!r.ok) {
            let msg = `${r.status}`;
            try { msg = (await r.json()).detail || msg; } catch (e) {}
            throw new Error(msg);
        }
        if (r.status === 204) return null;
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('application/json')) return r.json();
        return r.text();
    };

    const toast = (message, type = 'info') => {
        const container = $('#toast-container');
        const bg = { success: 'bg-success', error: 'bg-danger', info: 'bg-primary', warning: 'bg-warning text-dark' }[type] || 'bg-secondary';
        const el = document.createElement('div');
        el.className = `toast align-items-center text-white ${bg} border-0`;
        el.setAttribute('role', 'alert');
        el.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>`;
        container.appendChild(el);
        const t = new bootstrap.Toast(el, { delay: 3500 });
        t.show();
        el.addEventListener('hidden.bs.toast', () => el.remove());
    };

    // ---------------- 탭 ----------------
    $$('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.nav-btn').forEach(b => b.classList.remove('active'));
            $$('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const target = `#tab-${btn.dataset.tab}`;
            const pane = $(target);
            if (pane) pane.classList.add('active');
            if (btn.dataset.tab === 'history') loadHistory();
            if (btn.dataset.tab === 'logs') loadLogs();
            if (btn.dataset.tab === 'account') loadProfiles();
            if (btn.dataset.tab === 'home') loadSummary();
        });
    });

    // ---------------- 역 드롭다운 ----------------
    const KTX_STATIONS = window.__STATIONS__ || [];
    const fillStations = (selectEl, selected) => {
        selectEl.innerHTML = '';
        KTX_STATIONS.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            if (s === selected) opt.selected = true;
            selectEl.appendChild(opt);
        });
    };

    // ---------------- 설정 ----------------
    async function loadSettings() {
        try {
            const s = await api('GET', '/api/settings');
            fillStations($('#dep_station'), s.dep_station || '서울');
            fillStations($('#arr_station'), s.arr_station || '부산');
            if (s.dep_date) $('#dep_date').value = s.dep_date;
            $('#time_from').value = s.time_from || '06:00';
            $('#time_to').value = s.time_to || '22:00';
            $('#seat_class').value = s.seat_class || 'ANY';
            $('#passengers').value = String(s.passengers || 1);

            // 오늘 이후만 선택
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            $('#dep_date').min = today.toISOString().slice(0, 10);
            return s;
        } catch (e) {
            toast('설정 로드 실패: ' + e.message, 'error');
        }
    }

    $('#settings-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const data = {
            dep_station: $('#dep_station').value,
            arr_station: $('#arr_station').value,
            dep_date: $('#dep_date').value,
            time_from: $('#time_from').value,
            time_to: $('#time_to').value,
            seat_class: $('#seat_class').value,
            passengers: parseInt($('#passengers').value, 10),
        };
        try {
            await api('POST', '/api/settings', data);
            toast('설정이 저장되었습니다', 'success');
            loadSummary();
        } catch (e) {
            toast('저장 실패: ' + e.message, 'error');
        }
    });

    // ---------------- 계정 ----------------
    async function loadProfiles() {
        try {
            const { profiles } = await api('GET', '/api/profiles');
            const container = $('#profiles-list');
            container.innerHTML = '';
            if (!profiles.length) {
                container.innerHTML = '<div class="text-muted text-center small py-3">등록된 프로필이 없습니다</div>';
            }
            profiles.forEach(p => {
                const el = document.createElement('div');
                el.className = 'profile-card' + (p.is_selected ? ' selected' : '');
                el.innerHTML = `
                    <div class="info">
                        <div class="name">${p.is_selected ? '<i class="bi bi-check-circle-fill text-info"></i> ' : ''}${escapeHtml(p.name)}</div>
                        <div class="korail-id">${escapeHtml(p.korail_id)}</div>
                    </div>
                    <div class="actions">
                        ${p.is_selected ? '' : `<button class="btn btn-sm btn-outline-info" data-act="select" data-id="${p.id}"><i class="bi bi-check2"></i></button>`}
                        <button class="btn btn-sm btn-outline-secondary" data-act="edit" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-kid="${escapeHtml(p.korail_id)}"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" data-act="delete" data-id="${p.id}"><i class="bi bi-trash"></i></button>
                    </div>`;
                container.appendChild(el);
            });

            container.querySelectorAll('button').forEach(b => {
                b.addEventListener('click', async () => {
                    const act = b.dataset.act;
                    const id = b.dataset.id;
                    try {
                        if (act === 'select') {
                            await api('POST', `/api/profiles/${id}/select`);
                            toast('프로필이 선택되었습니다', 'success');
                            loadProfiles();
                            loadSummary();
                        } else if (act === 'delete') {
                            if (!confirm('프로필을 삭제하시겠습니까?')) return;
                            await api('DELETE', `/api/profiles/${id}`);
                            toast('삭제되었습니다', 'info');
                            loadProfiles();
                        } else if (act === 'edit') {
                            $('#profile_id').value = id;
                            $('#profile_name').value = b.dataset.name;
                            $('#korail_id').value = b.dataset.kid;
                            $('#korail_pw').value = '';
                            $('#profile-form-title').textContent = '프로필 수정';
                            $('#pw-hint').classList.remove('d-none');
                            $('#btn-cancel-edit').classList.remove('d-none');
                            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                        }
                    } catch (e) {
                        toast(e.message, 'error');
                    }
                });
            });
        } catch (e) {
            toast('프로필 로드 실패: ' + e.message, 'error');
        }
    }

    function resetProfileForm() {
        $('#profile_id').value = '';
        $('#profile_name').value = '';
        $('#korail_id').value = '';
        $('#korail_pw').value = '';
        $('#profile-form-title').textContent = '새 프로필 추가';
        $('#btn-cancel-edit').classList.add('d-none');
    }

    $('#btn-cancel-edit').addEventListener('click', resetProfileForm);

    $('#toggle-pw').addEventListener('click', () => {
        const i = $('#korail_pw');
        const icon = $('#toggle-pw i');
        if (i.type === 'password') {
            i.type = 'text';
            icon.className = 'bi bi-eye-slash';
        } else {
            i.type = 'password';
            icon.className = 'bi bi-eye';
        }
    });

    $('#profile-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = $('#profile_id').value;
        const name = $('#profile_name').value.trim();
        const kid = $('#korail_id').value.trim();
        const pw = $('#korail_pw').value;
        try {
            if (id) {
                await api('PUT', `/api/profiles/${id}`, { name, korail_id: kid, password: pw || null });
                toast('프로필이 수정되었습니다', 'success');
            } else {
                if (!pw) {
                    toast('비밀번호를 입력하세요', 'warning');
                    return;
                }
                await api('POST', '/api/profiles', { name, korail_id: kid, password: pw });
                toast('프로필이 추가되었습니다', 'success');
            }
            resetProfileForm();
            loadProfiles();
            loadSummary();
        } catch (e) {
            toast('저장 실패: ' + e.message, 'error');
        }
    });

    $('#btn-login-test').addEventListener('click', async () => {
        const kid = $('#korail_id').value.trim();
        const pw = $('#korail_pw').value;
        if (!kid || !pw) {
            toast('아이디와 비밀번호를 모두 입력하세요', 'warning');
            return;
        }
        const btn = $('#btn-login-test');
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-inline"></span> 확인 중...';
        try {
            const r = await api('POST', '/api/login-test', { korail_id: kid, password: pw });
            toast(r.message || '로그인 성공', 'success');
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    });

    // ---------------- 이력 ----------------
    async function loadHistory() {
        try {
            const { items } = await api('GET', '/api/history');
            const container = $('#history-list');
            container.innerHTML = '';
            if (!items.length) {
                container.innerHTML = '<div class="text-muted text-center py-4">이력이 없습니다</div>';
                return;
            }
            items.forEach(it => {
                const el = document.createElement('div');
                const statusClass = it.status === 'SUCCESS' ? 'success'
                    : it.status === 'SOLD_OUT' ? 'sold_out'
                    : it.status === 'ERROR' ? 'error' : '';
                el.className = `history-item ${statusClass}`;
                el.innerHTML = `
                    <div class="row1">
                        <span>${escapeHtml(it.section || '-')} ${it.train_no ? '· ' + escapeHtml(it.train_no) : ''}</span>
                        <span>${statusBadge(it.status)}</span>
                    </div>
                    <div class="row2">${escapeHtml(it.ts)} · ${it.duration_ms}ms ${it.message ? '· ' + escapeHtml(it.message) : ''}</div>`;
                container.appendChild(el);
            });
        } catch (e) {
            toast('이력 로드 실패: ' + e.message, 'error');
        }
    }

    function statusBadge(status) {
        const labels = { SUCCESS: '✅ 성공', SOLD_OUT: '🔶 매진', NO_SEAT: '빈좌석 없음', ERROR: '❌ 오류' };
        return labels[status] || status || '-';
    }

    $('#btn-clear-history').addEventListener('click', async () => {
        if (!confirm('이력을 모두 삭제하시겠습니까?')) return;
        await api('DELETE', '/api/history');
        loadHistory();
    });

    // ---------------- 로그 ----------------
    let ws = null;
    let wsState = null;
    const logContainer = () => $('#log-container');

    function appendLog(entry) {
        const line = document.createElement('div');
        line.className = `log-line ${String(entry.level || 'info').toLowerCase()}`;
        line.innerHTML = `<span class="ts">${escapeHtml(entry.ts)}</span><span class="lvl">[${escapeHtml(entry.level)}]</span> ${escapeHtml(entry.message)}`;
        const c = logContainer();
        c.appendChild(line);
        // 최대 500줄
        while (c.children.length > 500) c.removeChild(c.firstChild);
        if ($('#auto-scroll').checked) c.scrollTop = c.scrollHeight;
    }

    async function loadLogs() {
        try {
            const { items } = await api('GET', '/api/logs');
            logContainer().innerHTML = '';
            items.forEach(appendLog);
        } catch (e) { /* ignore */ }
    }

    $('#btn-clear-logs').addEventListener('click', async () => {
        await api('DELETE', '/api/logs');
        logContainer().innerHTML = '';
    });

    $('#btn-download-logs').addEventListener('click', () => {
        window.open('/api/logs/download', '_blank');
    });

    function connectWS() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws/logs`);
        ws.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data.type === 'log') appendLog(data);
            } catch (e) { /* ignore */ }
        });
        ws.addEventListener('close', () => setTimeout(connectWS, 2000));
        ws.addEventListener('error', () => { try { ws.close(); } catch (e) {} });
    }

    function connectStateWS() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        wsState = new WebSocket(`${proto}://${location.host}/ws/state`);
        wsState.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data.type === 'state') applyState(data);
            } catch (e) { /* ignore */ }
        });
        wsState.addEventListener('close', () => setTimeout(connectStateWS, 2000));
        wsState.addEventListener('error', () => { try { wsState.close(); } catch (e) {} });
    }

    // ---------------- 상태 ----------------
    let countdownInterval = null;
    let prevSuccessShown = false;

    function applyState(s) {
        const statusMap = {
            IDLE: { text: '대기중', cls: 'idle', badge: 'bg-secondary' },
            SEARCHING: { text: '조회중', cls: 'searching', badge: 'bg-searching' },
            WAITING: { text: '대기중 (다음 조회)', cls: 'waiting', badge: 'bg-waiting' },
            SUCCESS: { text: '예약 성공!', cls: 'success', badge: 'bg-success-strong' },
            ERROR: { text: '오류', cls: 'error', badge: 'bg-error' },
        };
        const cfg = statusMap[s.status] || statusMap.IDLE;
        $('#status-text').textContent = cfg.text;
        const ind = $('#status-indicator');
        ind.className = 'status-indicator ' + cfg.cls;
        const header = $('#header-status');
        header.className = 'badge ' + cfg.badge;
        header.textContent = cfg.text;

        $('#total-queries').textContent = s.total_queries || 0;
        $('#last-query').textContent = s.last_query_at || '-';

        if (s.running) {
            $('#btn-start').classList.add('d-none');
            $('#btn-stop').classList.remove('d-none');
        } else {
            $('#btn-start').classList.remove('d-none');
            $('#btn-stop').classList.add('d-none');
        }

        // 카운트다운
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        if (s.next_query_at && s.status === 'WAITING') {
            const tick = () => {
                const remain = Math.max(0, s.next_query_at - Date.now() / 1000);
                $('#countdown').textContent = remain >= 60
                    ? `${Math.floor(remain / 60)}분 ${Math.floor(remain % 60)}초`
                    : `${Math.ceil(remain)}초`;
                if (remain <= 0 && countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            };
            tick();
            countdownInterval = setInterval(tick, 500);
        } else {
            $('#countdown').textContent = s.status === 'SEARCHING' ? '조회중...' : '-';
        }

        // 성공 감지
        if (s.status === 'SUCCESS' && s.success_info && !prevSuccessShown) {
            prevSuccessShown = true;
            showSuccess(s.success_info);
        }
        if (s.status !== 'SUCCESS') prevSuccessShown = false;
    }

    function showSuccess(info) {
        document.title = '🎉 예약 성공! - KTX 예약기';
        const body = $('#success-detail');
        body.innerHTML = `
            <div class="h4 mb-2">${escapeHtml(info.section || '')}</div>
            <div>${escapeHtml(info.train_name || 'KTX')} ${escapeHtml(info.train_no || '')}</div>
            <div class="mt-2">${escapeHtml(info.dep_time || '')} → ${escapeHtml(info.arr_time || '')}</div>
            <div class="small mt-3">${escapeHtml(info.reserved_at || '')}</div>
            <div class="small mt-3"><strong>코레일 앱에서 10분 내에 결제해주세요!</strong></div>`;
        const modal = new bootstrap.Modal('#successModal');
        modal.show();

        // 푸시 알림
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification('🎉 KTX 예약 성공!', {
                    body: `${info.section} ${info.dep_time} → ${info.arr_time}`,
                });
            }
        }
        // 알림음
        try { $('#success-audio').play().catch(() => {}); } catch (e) {}
        try {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
        } catch (e) {}
    }

    // ---------------- 홈 요약 ----------------
    async function loadSummary() {
        try {
            const s = await api('GET', '/api/settings');
            $('#summary-section').textContent = `${s.dep_station || '-'} → ${s.arr_station || '-'}`;
            $('#summary-date').textContent = s.dep_date || '-';
            $('#summary-time').textContent = `${s.time_from || '-'} ~ ${s.time_to || '-'}`;
            const seatMap = { GENERAL: '일반실', SPECIAL: '특실', ANY: '일반실 + 특실' };
            $('#summary-seat').textContent = `${seatMap[s.seat_class] || s.seat_class} · ${s.passengers || 1}명`;
        } catch (e) { /* ignore */ }

        try {
            const { profiles } = await api('GET', '/api/profiles');
            const sel = profiles.find(p => p.is_selected);
            $('#summary-profile').textContent = sel ? `${sel.name} (${sel.korail_id})` : '(없음)';
        } catch (e) { /* ignore */ }
    }

    // ---------------- 엔진 제어 ----------------
    $('#btn-start').addEventListener('click', async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            try { await Notification.requestPermission(); } catch (e) {}
        }
        try {
            await api('POST', '/api/engine/start');
            toast('자동예약을 시작합니다', 'success');
        } catch (e) {
            toast('시작 실패: ' + e.message, 'error');
        }
    });

    $('#btn-stop').addEventListener('click', async () => {
        if (!confirm('자동예약을 중지하시겠습니까?')) return;
        try {
            await api('POST', '/api/engine/stop');
            toast('중지되었습니다', 'info');
        } catch (e) {
            toast(e.message, 'error');
        }
    });

    // 탭 이동 (웰컴 모달에서)
    $('#goto-account').addEventListener('click', () => {
        const btn = document.querySelector('.nav-btn[data-tab="account"]');
        if (btn) btn.click();
    });

    // 유틸
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ---------------- 초기화 ----------------
    async function init() {
        // 역 목록 주입 (템플릿에서)
        try {
            const { stations } = await api('GET', '/api/stations');
            window.__STATIONS__ = stations;
            KTX_STATIONS.length = 0;
            stations.forEach(s => KTX_STATIONS.push(s));
        } catch (e) {}

        await loadSettings();
        await loadSummary();

        // 초기 상태
        try {
            const s = await api('GET', '/api/state');
            applyState(s);
        } catch (e) {}

        connectWS();
        connectStateWS();

        // 첫 실행 (프로필 없으면 웰컴 모달)
        try {
            const { profiles } = await api('GET', '/api/profiles');
            if (!profiles.length) {
                const m = new bootstrap.Modal('#welcomeModal');
                m.show();
            }
        } catch (e) {}

        // 상태 폴링 백업 (WebSocket 미작동 시)
        setInterval(async () => {
            try {
                const s = await api('GET', '/api/state');
                applyState(s);
            } catch (e) {}
        }, 5000);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
