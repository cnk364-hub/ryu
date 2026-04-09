/* ============================================================
   app.js - Main application for Livestock AI Agent Demo
   ============================================================ */

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------

const state = {
  activeTab: 'dashboard',
  riskLevel: 'normal',
  feedingData: [],
  originalFeedingData: [],
  anomalyScores: [],
  environmentData: null,
  pipeline: {
    isRunning: false,
    currentAgent: null,
    completedAgents: [],
    results: [],
    scenario: null,
    startedAt: null,
  },
  logs: [],
  recommendation: '',
  metrics: { feedingChangeRate: 0, anomalyDays: 0, estimatedRiskHours: 72 },
  agentPerformances: {},
  selectedScenario: null,
  scenarioSteps: [],
  sliderValue: 0,
};

// Initialize agent performances
AGENTS.forEach(a => {
  state.agentPerformances[a.id] = { executionCount: 0, avgResponseTime: 0, lastDecision: '대기 중' };
});

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    el.textContent = new Date().toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
}
setInterval(updateClock, 1000);

// ---------------------------------------------------------------------------
// Metrics calculation
// ---------------------------------------------------------------------------

function calculateMetrics(feedingData, anomalyScores, scenario) {
  if (!feedingData || feedingData.length === 0) return;
  const last = feedingData[feedingData.length - 1];
  const recent7 = feedingData.slice(-7);
  const avg7 = recent7.reduce((s, d) => s + d.consumption_kg, 0) / recent7.length;
  const changeRate = ((last.consumption_kg - avg7) / avg7 * 100).toFixed(1);

  const anomalyDays = anomalyScores ? anomalyScores.filter(a => a.isAnomaly).length : 0;

  let riskHours = 72;
  if (scenario === 'disease_asf') riskHours = 12;
  else if (scenario === 'environment_heat') riskHours = 48;
  else if (scenario === 'shipment_optimization') riskHours = 84;

  state.metrics = {
    feedingChangeRate: parseFloat(changeRate),
    anomalyDays: anomalyDays,
    estimatedRiskHours: riskHours,
  };
}

// ---------------------------------------------------------------------------
// Anomaly slider logic
// ---------------------------------------------------------------------------

function applyAnomalySlider(value) {
  state.sliderValue = value;
  if (!state.originalFeedingData.length) return;

  const data = JSON.parse(JSON.stringify(state.originalFeedingData));
  if (value > 0) {
    const affectedDays = Math.max(1, Math.floor(value / 10));
    const startIdx = Math.max(0, data.length - affectedDays);
    for (let i = startIdx; i < data.length; i++) {
      const factor = 1 - (value / 100) * ((i - startIdx + 1) / affectedDays) * 0.5;
      data[i].consumption_kg = Math.round(data[i].consumption_kg * factor * 10) / 10;
      const baseline = data[i].normal_baseline;
      data[i].deviation_pct = baseline === 0 ? 0 : Math.round(((data[i].consumption_kg - baseline) / baseline) * 100 * 10) / 10;
      if (data[i].deviation_pct < -30) data[i].status = 'emergency';
      else if (data[i].deviation_pct < -20) data[i].status = 'danger';
      else if (data[i].deviation_pct < -10) data[i].status = 'caution';
      else data[i].status = 'normal';
    }
  }

  state.feedingData = data;
  // Recalculate anomaly scores
  state.anomalyScores = eifDetect(data);
  calculateMetrics(data, state.anomalyScores, state.pipeline.scenario);

  // Update only the chart and metrics
  const chartEl = document.getElementById('feeding-chart');
  if (chartEl) renderFeedingChart(chartEl, state.feedingData, state.anomalyScores);
  renderMetricsOnly();
}

// Simple EIF anomaly detection (mirrors mock-data/simulator.js)
function eifDetect(data) {
  if (!data.length) return [];
  const devs = data.map(d => d.deviation_pct);
  const gm = devs.reduce((s, v) => s + v, 0) / devs.length;
  const variance = devs.reduce((s, v) => s + (v - gm) ** 2, 0) / devs.length;
  const gs = Math.sqrt(variance) || 1;

  return data.map((p, i) => {
    const zDev = -(p.deviation_pct - gm) / gs;
    const slopeFactor = -p.slope / 5;
    const volFactor = p.volatility / 0.1;
    const raw = 0.60 * zDev + 0.25 * slopeFactor + 0.15 * volFactor;
    const score = Math.round((1 / (1 + Math.exp(-(1.8 * raw - 1.0)))) * 1000) / 1000;
    return { index: i, score: Math.max(0, Math.min(1, score)), isAnomaly: score > 0.6 };
  });
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderMetricsOnly() {
  const m = state.metrics;
  const el1 = document.getElementById('metric-change-rate');
  const el2 = document.getElementById('metric-anomaly-days');
  const el3 = document.getElementById('metric-risk-hours');
  if (el1) {
    const color = m.feedingChangeRate < -10 ? '#ef4444' : m.feedingChangeRate < 0 ? '#f97316' : '#22c55e';
    el1.innerHTML = `<div class="metric-value" style="color:${color}">${m.feedingChangeRate > 0 ? '+' : ''}${m.feedingChangeRate}%</div>
      <div class="metric-label">급이량 변화율</div>
      <div class="metric-sub">오늘 vs 7일 평균</div>`;
  }
  if (el2) {
    const color = m.anomalyDays > 3 ? '#ef4444' : m.anomalyDays > 0 ? '#f97316' : '#22c55e';
    el2.innerHTML = `<div class="metric-value" style="color:${color}">${m.anomalyDays}<span style="font-size:16px">일</span></div>
      <div class="metric-label">이상 지속일수</div>
      <div class="metric-sub">EIF 이상탐지 기준</div>`;
  }
  if (el3) {
    const color = m.estimatedRiskHours < 24 ? '#ef4444' : m.estimatedRiskHours < 48 ? '#f97316' : '#22c55e';
    el3.innerHTML = `<div class="metric-value" style="color:${color}">${m.estimatedRiskHours}<span style="font-size:16px">시간</span></div>
      <div class="metric-label">위험 전환 시간</div>
      <div class="metric-sub">HMM 모델 추정</div>`;
  }
}

function buildLogEntry(log) {
  const agent = getAgentById(log.agentId);
  const color = agent ? agent.color : '#6b7280';
  const div = h('div', {
    className: `log-entry${log.status === 'running' ? ' running' : ''}`,
    style: { borderLeftColor: color }
  },
    h('span', { className: 'log-agent', style: { color: color } },
      agent ? `${agent.name} (${agent.nameKo})` : log.agentName
    ),
    h('span', { className: 'log-content' }, log.content),
    h('span', { className: 'log-time' }, formatTime(log.timestamp)),
    log.duration_ms ? h('span', { className: 'log-duration' }, formatDuration(log.duration_ms)) : null
  );
  return div;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  // Risk border class
  app.className = state.riskLevel !== 'normal' ? `risk-${state.riskLevel}` : '';

  // ---- Header ----
  const riskBadge = h('span', { className: `risk-badge ${state.riskLevel}` },
    h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: RISK_COLORS[state.riskLevel], display: 'inline-block' } }),
    RISK_LABELS[state.riskLevel]
  );

  const header = h('div', { className: 'header' },
    h('div', { className: 'header-left' },
      h('span', { className: 'logo' }, 'MANSA System'),
      h('span', { className: 'subtitle' }, '축산 AI 에이전트 데모'),
    ),
    h('div', { className: 'flex items-center gap-4' },
      h('span', { style: { fontSize: '14px', fontWeight: '500' } }, '제일축산영농조합법인 1호동'),
      riskBadge,
    ),
    h('div', { className: 'header-right' },
      h('span', { id: 'clock' }),
      h('span', null,
        h('span', { className: 'status-dot' }),
        state.pipeline.isRunning ? '에이전트 실행 중...' : '에이전트 7개 가동 중'
      ),
    ),
  );
  app.appendChild(header);

  // ---- Tabs ----
  const tabs = h('div', { className: 'tabs' },
    h('button', {
      className: `tab-btn${state.activeTab === 'dashboard' ? ' active' : ''}`,
      onClick: () => { state.activeTab = 'dashboard'; render(); }
    }, '실시간 모니터링'),
    h('button', {
      className: `tab-btn${state.activeTab === 'scenarios' ? ' active' : ''}`,
      onClick: () => { state.activeTab = 'scenarios'; render(); }
    }, '시나리오 실행'),
    h('button', {
      className: `tab-btn${state.activeTab === 'agents' ? ' active' : ''}`,
      onClick: () => { state.activeTab = 'agents'; render(); }
    }, '에이전트 상세'),
  );
  app.appendChild(tabs);

  // ---- Tab Content ----
  if (state.activeTab === 'dashboard') renderDashboard(app);
  else if (state.activeTab === 'scenarios') renderScenarios(app);
  else if (state.activeTab === 'agents') renderAgentsTab(app);

  updateClock();
}

// ---------------------------------------------------------------------------
// Tab 1: Dashboard
// ---------------------------------------------------------------------------

function renderDashboard(app) {
  const content = h('div', { className: 'tab-content active' });

  const grid = h('div', { className: 'dashboard-grid' });

  // ---- Left Column ----
  const leftCol = h('div');

  // Chart card
  const chartCard = h('div', { className: 'card mb-4' },
    h('div', { className: 'card-title' }, '급이패턴 실시간 차트 (최근 30일)'),
    h('div', { id: 'feeding-chart', className: 'chart-container' }),
    h('div', { className: 'anomaly-slider-container' },
      h('span', { className: 'text-sm text-muted' }, '이상 시나리오 주입'),
      h('input', {
        type: 'range', min: '0', max: '100', value: String(state.sliderValue),
        className: 'anomaly-slider',
        onInput: (e) => applyAnomalySlider(parseInt(e.target.value))
      }),
      h('span', { className: 'text-sm', style: { minWidth: '40px' } }, state.sliderValue + '%'),
    )
  );
  leftCol.appendChild(chartCard);

  // Log timeline card
  const logCard = h('div', { className: 'card' },
    h('div', { className: 'card-title' }, `에이전트 실행 로그 (${state.logs.length})`),
    h('div', { className: 'log-timeline', id: 'log-timeline' },
      state.logs.length === 0
        ? h('div', { className: 'empty-state' }, '시나리오를 실행하면 에이전트 로그가 여기에 표시됩니다.')
        : state.logs.map(l => buildLogEntry(l))
    )
  );
  leftCol.appendChild(logCard);
  grid.appendChild(leftCol);

  // ---- Right Column ----
  const rightCol = h('div');

  // Metrics
  const metricsRow = h('div', { className: 'metrics-row' },
    h('div', { className: 'card metric-card', id: 'metric-change-rate' }),
    h('div', { className: 'card metric-card', id: 'metric-anomaly-days' }),
    h('div', { className: 'card metric-card', id: 'metric-risk-hours' }),
  );
  rightCol.appendChild(metricsRow);

  // Recommendation
  const recClass = state.riskLevel !== 'normal' ? ` ${state.riskLevel}` : '';
  const recCard = h('div', { className: `card recommendation-box${recClass}`, style: { marginBottom: '16px' } },
    h('div', { className: 'card-title' }, 'AI 조치 권고안'),
    state.recommendation
      ? h('p', { style: { lineHeight: '1.6' } }, state.recommendation)
      : h('p', { className: 'text-muted' }, '시나리오 실행 후 AI 권고안이 여기에 표시됩니다.')
  );
  rightCol.appendChild(recCard);

  // Agentic Loop
  const loopCard = h('div', { className: 'card' },
    h('div', { className: 'card-title' }, 'Agentic Loop 상태'),
    h('div', { className: 'loop-container', id: 'agent-loop' })
  );
  rightCol.appendChild(loopCard);

  grid.appendChild(rightCol);
  content.appendChild(grid);
  app.appendChild(content);

  // Post-render: draw chart and loop
  setTimeout(() => {
    const chartEl = document.getElementById('feeding-chart');
    if (chartEl) renderFeedingChart(chartEl, state.feedingData, state.anomalyScores);

    const loopEl = document.getElementById('agent-loop');
    if (loopEl) renderAgentLoop(loopEl, state.pipeline.currentAgent, state.pipeline.completedAgents);

    renderMetricsOnly();
  }, 0);
}

// ---------------------------------------------------------------------------
// Tab 2: Scenarios
// ---------------------------------------------------------------------------

function renderScenarios(app) {
  const content = h('div', { className: 'tab-content active' });

  content.appendChild(h('h2', { style: { fontSize: '20px', fontWeight: '600', marginBottom: '4px' } }, '시나리오 선택 & 실행'));
  content.appendChild(h('p', { className: 'text-sm text-muted', style: { marginBottom: '20px' } }, '시나리오를 선택한 후 실행 버튼을 클릭하면 7개 AI 에이전트가 순차적으로 분석을 수행합니다.'));

  // Scenario cards
  const grid = h('div', { className: 'scenarios-grid' });
  SCENARIOS.forEach(sc => {
    const isSelected = state.selectedScenario === sc.id;
    const isRunning = state.pipeline.isRunning && state.pipeline.scenario === sc.id;

    const card = h('div', {
      className: `card scenario-card${isSelected ? ' selected' : ''}${isRunning ? ' running' : ''}`,
      onClick: () => {
        if (state.pipeline.isRunning) return;
        if (state.selectedScenario === sc.id) {
          runScenario(sc.id);
        } else {
          state.selectedScenario = sc.id;
          render();
        }
      }
    },
      h('div', { className: 'scenario-icon', innerHTML: sc.icon, style: { background: sc.iconBg, fontSize: '28px' } }),
      h('h3', null, sc.title),
      h('p', null, sc.description),
      h('ul', { className: 'scenario-details' },
        sc.details.map(d => h('li', null, d))
      ),
      isSelected ? h('div', { style: { marginTop: '12px', fontSize: '12px', color: '#3b82f6' } }, '다시 클릭하면 실행됩니다') : null,
    );
    grid.appendChild(card);
  });
  content.appendChild(grid);

  // Run button
  const btnRow = h('div', { style: { textAlign: 'center', marginBottom: '20px' } },
    h('button', {
      className: 'btn btn-primary',
      disabled: !state.selectedScenario || state.pipeline.isRunning,
      onClick: () => { if (state.selectedScenario) runScenario(state.selectedScenario); }
    },
      state.pipeline.isRunning ? '실행 중...' : '시나리오 실행'
    )
  );
  content.appendChild(btnRow);

  // Execution Stepper
  if (state.scenarioSteps.length > 0) {
    const stepperCard = h('div', { className: 'card' },
      h('div', { className: 'card-title' }, '에이전트 실행 진행 상황'),
      buildStepper()
    );
    content.appendChild(stepperCard);
  }

  app.appendChild(content);
}

function buildStepper() {
  const stepper = h('div', { className: 'stepper' });
  state.scenarioSteps.forEach((step, i) => {
    if (i > 0) {
      const line = h('div', {
        className: `step-line${state.scenarioSteps[i - 1].status === 'completed' ? ' completed' : ''}`
      });
      stepper.appendChild(line);
    }

    const stepDiv = h('div', { className: `step ${step.status}` },
      h('div', { className: 'step-circle' },
        step.status === 'completed' ? '\u2713' : String(i + 1)
      ),
      h('div', { className: 'step-label' }, step.label),
      step.duration ? h('div', { className: 'step-duration' }, formatDuration(step.duration)) : null
    );
    stepper.appendChild(stepDiv);
  });
  return stepper;
}

// ---------------------------------------------------------------------------
// Tab 3: Agent Details
// ---------------------------------------------------------------------------

function renderAgentsTab(app) {
  const content = h('div', { className: 'tab-content active' });

  content.appendChild(h('h2', { style: { fontSize: '20px', fontWeight: '600', marginBottom: '4px' } }, '에이전트 상세 정보'));
  content.appendChild(h('p', { className: 'text-sm text-muted', style: { marginBottom: '20px' } }, '7개 AI 에이전트 각각의 역할, 기술, 성능 및 최근 판단 내용을 확인합니다.'));

  const grid = h('div', { className: 'agents-grid' });
  AGENTS.forEach(agent => {
    const perf = state.agentPerformances[agent.id];
    const card = h('div', { className: 'card agent-detail-card' },
      h('div', { className: 'agent-header' },
        h('div', { className: 'agent-icon', style: { background: agent.color } }, agent.icon),
        h('div', null,
          h('div', { className: 'agent-name' }, agent.name),
          h('div', { className: 'agent-name-ko' }, agent.nameKo),
          h('div', { className: 'agent-tech' }, agent.tech),
        ),
      ),
      h('div', { className: 'agent-stats' },
        h('div', { className: 'agent-stat' },
          h('div', { className: 'agent-stat-value', style: { color: agent.color } }, String(perf.executionCount)),
          h('div', { className: 'agent-stat-label' }, '실행 횟수'),
        ),
        h('div', { className: 'agent-stat' },
          h('div', { className: 'agent-stat-value', style: { color: agent.color } }, perf.avgResponseTime ? formatDuration(perf.avgResponseTime) : '-'),
          h('div', { className: 'agent-stat-label' }, '평균 응답시간'),
        ),
      ),
      h('div', { className: 'agent-decision' }, perf.lastDecision),
    );
    grid.appendChild(card);
  });
  content.appendChild(grid);

  // Performance metrics section
  const perfSection = h('div', { style: { marginTop: '24px' } },
    h('h3', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '16px' } }, '시스템 성능 지표'),
    h('div', { className: 'perf-grid' },
      buildPerfCard('응답 정확도', 87, 85, '#22c55e'),
      buildPerfCard('응답 일관성', 91, 90, '#3b82f6'),
      buildPerfCard('환각 발생률', 3.2, 5, '#ef4444', true),
    )
  );
  content.appendChild(perfSection);

  app.appendChild(content);
}

function buildPerfCard(label, value, target, color, isInverse) {
  const card = h('div', { className: 'card' });
  const pct = isInverse ? Math.min(100, (1 - value / (target * 2)) * 100) : Math.min(100, (value / target) * 100);
  const isGood = isInverse ? value <= target : value >= target;
  const displayColor = isGood ? '#22c55e' : '#f97316';

  card.innerHTML = `
    <div class="progress-bar-label">
      <span style="font-size:14px">${label}</span>
      <span style="color:${displayColor}; font-weight:600">
        ${value}%${isInverse ? ' (목표 ' + target + '% 이하)' : ' / 목표 ' + target + '%'}
        ${isGood ? ' &#10003;' : ''}
      </span>
    </div>
    <div class="progress-bar" style="margin-top:8px">
      <div class="progress-bar-fill" style="width:${isInverse ? (100 - value / target * 100) : pct}%; background:${displayColor}; min-width:4px;"></div>
    </div>
    <div style="font-size:11px; color:#6b7280; margin-top:6px;">
      ${isGood ? '목표 달성' : '목표 미달'} | ${isInverse ? '낮을수록 우수' : '높을수록 우수'}
    </div>
  `;
  return card;
}

// ---------------------------------------------------------------------------
// Scenario Execution (SSE via POST fetch + ReadableStream)
// ---------------------------------------------------------------------------

async function runScenario(scenarioId) {
  if (state.pipeline.isRunning) return;

  // Reset state
  state.pipeline = {
    isRunning: true,
    currentAgent: null,
    completedAgents: [],
    results: [],
    scenario: scenarioId,
    startedAt: new Date().toISOString(),
  };
  state.logs = [];
  state.recommendation = '';
  state.riskLevel = 'normal';

  // Build stepper steps
  state.scenarioSteps = [
    { label: '데이터 수집', status: 'active', duration: null },
    ...AGENTS.map(a => ({ label: a.nameKo, status: 'pending', duration: null })),
  ];

  // Switch to scenarios tab to show stepper
  state.activeTab = 'scenarios';
  render();

  // 1. Fetch simulator data
  try {
    const simRes = await fetch(`/api/simulator?scenario=${scenarioId}`);
    const simData = await simRes.json();
    state.feedingData = simData.feedingData;
    state.originalFeedingData = JSON.parse(JSON.stringify(simData.feedingData));
    state.anomalyScores = simData.anomalyScores;
    state.environmentData = simData.environmentData;
    state.sliderValue = 0;
    calculateMetrics(simData.feedingData, simData.anomalyScores, scenarioId);

    // Mark data collection as complete
    state.scenarioSteps[0].status = 'completed';
    state.scenarioSteps[0].duration = 500;
    if (state.scenarioSteps.length > 1) state.scenarioSteps[1].status = 'active';
    render();
  } catch (err) {
    console.error('Simulator fetch failed:', err);
    state.pipeline.isRunning = false;
    state.scenarioSteps[0].status = 'completed';
    render();
    return;
  }

  // 2. Run agent pipeline via SSE (POST)
  try {
    const response = await fetch('/api/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: scenarioId,
        feedingData: state.feedingData,
        environmentData: state.environmentData,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6);
        try {
          const event = JSON.parse(jsonStr);
          handleSSEEvent(event);
        } catch (e) {
          console.warn('SSE parse error:', e);
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim().startsWith('data: ')) {
      try {
        const event = JSON.parse(buffer.trim().slice(6));
        handleSSEEvent(event);
      } catch (e) { /* ignore */ }
    }
  } catch (err) {
    console.error('Agent pipeline failed:', err);
    state.logs.unshift({
      id: 'err-' + Date.now(),
      agentId: 'orchestration',
      agentName: 'System',
      content: '에이전트 파이프라인 실행 중 오류가 발생했습니다: ' + err.message,
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      status: 'error',
    });
    state.pipeline.isRunning = false;
    render();
  }
}

function handleSSEEvent(event) {
  const { type, data } = event;

  if (type === 'agent_start') {
    const agentId = data.agentId;
    state.pipeline.currentAgent = agentId;

    // Update stepper
    const stepIdx = AGENTS.findIndex(a => a.id === agentId) + 1;
    if (stepIdx > 0 && stepIdx < state.scenarioSteps.length) {
      state.scenarioSteps[stepIdx].status = 'active';
    }

    // Add running log
    state.logs.unshift({
      id: 'start-' + agentId + '-' + Date.now(),
      agentId: agentId,
      agentName: data.agentName,
      content: '분석 시작...',
      timestamp: data.timestamp,
      duration_ms: 0,
      status: 'running',
    });

    render();
  }

  if (type === 'agent_complete') {
    const agentId = data.agentId;
    state.pipeline.completedAgents.push(agentId);
    state.pipeline.results.push({
      agentId: agentId,
      response: data.response,
      rawText: data.rawText,
      timestamp: data.timestamp,
      duration_ms: data.duration_ms,
    });

    // Update stepper
    const stepIdx = AGENTS.findIndex(a => a.id === agentId) + 1;
    if (stepIdx > 0 && stepIdx < state.scenarioSteps.length) {
      state.scenarioSteps[stepIdx].status = 'completed';
      state.scenarioSteps[stepIdx].duration = data.duration_ms;
      // Activate next step
      if (stepIdx + 1 < state.scenarioSteps.length) {
        state.scenarioSteps[stepIdx + 1].status = 'active';
      }
    }

    // Update running log to completed
    const runningIdx = state.logs.findIndex(l => l.agentId === agentId && l.status === 'running');
    if (runningIdx >= 0) {
      state.logs[runningIdx].status = 'completed';
      state.logs[runningIdx].duration_ms = data.duration_ms;
      state.logs[runningIdx].content = extractSummary(agentId, data.response);
    }

    // Update performance
    const perf = state.agentPerformances[agentId];
    perf.executionCount++;
    perf.avgResponseTime = perf.avgResponseTime
      ? Math.round((perf.avgResponseTime + data.duration_ms) / 2)
      : data.duration_ms;
    perf.lastDecision = extractSummary(agentId, data.response);

    render();
  }

  if (type === 'agent_error') {
    const agentId = data.agentId;
    state.logs.unshift({
      id: 'err-' + agentId + '-' + Date.now(),
      agentId: agentId,
      agentName: data.agentName,
      content: '오류 발생 - 재시도 중...',
      timestamp: data.timestamp,
      duration_ms: 0,
      status: 'error',
    });
    render();
  }

  if (type === 'pipeline_complete') {
    state.pipeline.isRunning = false;
    state.pipeline.currentAgent = null;

    // Extract final results from orchestration
    const orchResult = state.pipeline.results.find(r => r.agentId === 'orchestration');
    if (orchResult && orchResult.response) {
      const resp = orchResult.response;
      state.riskLevel = resp.alert_level || resp.final_assessment?.risk_level || 'normal';
      state.recommendation = resp.farmer_message || resp.executive_message || '';
    }

    // Update risk hours from risk_trajectory
    const riskResult = state.pipeline.results.find(r => r.agentId === 'risk_trajectory');
    if (riskResult && riskResult.response) {
      state.metrics.estimatedRiskHours = riskResult.response.risk_timeline_hours || state.metrics.estimatedRiskHours;
    }

    // Switch to dashboard
    state.activeTab = 'dashboard';
    render();
  }
}

function extractSummary(agentId, response) {
  if (!response) return '응답 없음';
  switch (agentId) {
    case 'context':
      return response.situation_summary || JSON.stringify(response).slice(0, 100);
    case 'risk_trajectory':
      return `현재 상태: ${response.current_state || '?'}, 심각도: ${response.severity_score || '?'}, ${response.risk_timeline_hours || '?'}시간 내 위험 전환 예측`;
    case 'planning':
      return response.plan_summary || (response.action_plan?.immediate?.join(', ') || JSON.stringify(response).slice(0, 100));
    case 'execution':
      return response.alert_message || response.execution_summary || JSON.stringify(response).slice(0, 100);
    case 'monitoring':
      return response.monitoring_summary || (response.monitoring_metrics?.join(', ') || JSON.stringify(response).slice(0, 100));
    case 'recovery':
      return response.recovery_summary || `효과 점수: ${response.effectiveness_score || '?'}, 대안 전략: ${response.alternative_strategies?.length || 0}개`;
    case 'orchestration':
      return response.farmer_message || response.executive_message || response.report_summary || JSON.stringify(response).slice(0, 100);
    default:
      return JSON.stringify(response).slice(0, 120);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initApp() {
  // Load default data (normal scenario - shipment for a calm initial state)
  try {
    const res = await fetch('/api/simulator?scenario=shipment_optimization');
    const data = await res.json();
    state.feedingData = data.feedingData;
    state.originalFeedingData = JSON.parse(JSON.stringify(data.feedingData));
    state.anomalyScores = data.anomalyScores;
    state.environmentData = data.environmentData;
    calculateMetrics(data.feedingData, data.anomalyScores, 'shipment_optimization');
  } catch (err) {
    console.warn('Failed to load initial data:', err);
  }

  render();
}

document.addEventListener('DOMContentLoaded', initApp);
