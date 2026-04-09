/* ============================================================
   app.js - Livestock Disease Early Warning AI Agent Demo SPA
   ============================================================ */

// ---------------------------------------------------------------------------
// App State
// ---------------------------------------------------------------------------

const state = {
  activeTab: 'dashboard',
  riskLevel: 'normal',
  feedingData: [],
  anomalyScores: [],
  environmentData: {},
  pipeline: {
    isRunning: false,
    currentAgent: null,
    completedAgents: [],
    results: [],
    scenario: null,
  },
  logs: [],
  recommendation: '',
  metrics: {
    feedingChangeRate: 0,
    anomalyDays: 0,
    estimatedRiskHours: 0,
  },
  agentPerformances: {},
  selectedScenario: null,
  scenarioSteps: [],
};

let clockInterval = null;

// ---------------------------------------------------------------------------
// Metric calculation helpers
// ---------------------------------------------------------------------------

function calcMetrics(feedingData, anomalyScores, scenarioId) {
  if (!feedingData || feedingData.length === 0) return;

  const last = feedingData[feedingData.length - 1];
  const recent7 = feedingData.slice(-7);
  const avg7 = recent7.reduce(function (s, d) { return s + d.consumption_kg; }, 0) / recent7.length;
  var changeRate = avg7 === 0 ? 0 : ((last.consumption_kg - avg7) / avg7) * 100;
  state.metrics.feedingChangeRate = Math.round(changeRate * 10) / 10;

  if (anomalyScores && anomalyScores.length > 0) {
    state.metrics.anomalyDays = anomalyScores.filter(function (a) { return a.isAnomaly; }).length;
  }

  if (scenarioId === 'disease_asf') {
    state.metrics.estimatedRiskHours = 48;
  } else if (scenarioId === 'environment_heat') {
    state.metrics.estimatedRiskHours = 72;
  } else {
    state.metrics.estimatedRiskHours = 0;
  }
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderHeader() {
  var headerLeft = h('div', { className: 'header-left' },
    h('span', { className: 'logo' }, 'MANSA System'),
    h('span', { className: 'subtitle' }, '축산 AI 에이전트 데모')
  );

  var riskLabel = RISK_LABELS[state.riskLevel] || '정상';
  var riskColor = RISK_COLORS[state.riskLevel] || RISK_COLORS.normal;
  var badge = h('span', { className: 'risk-badge ' + state.riskLevel },
    h('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: riskColor } }),
    riskLabel
  );

  var headerCenter = h('div', { className: 'flex items-center gap-4' },
    h('span', { style: { fontSize: '14px', fontWeight: '600' } }, '제일축산영농조합법인 1호동'),
    badge
  );

  var clockEl = h('span', { id: 'clock' }, formatTime(new Date().toISOString()));
  var statusDot = h('span', { className: 'status-dot' });
  var headerRight = h('div', { className: 'header-right' },
    clockEl,
    h('span', { className: 'flex items-center' },
      statusDot,
      '에이전트 7개 가동 중'
    )
  );

  return h('div', { className: 'header' }, headerLeft, headerCenter, headerRight);
}

function renderTabs() {
  var tabs = [
    { id: 'dashboard', label: '실시간 모니터링' },
    { id: 'scenarios', label: '시나리오 실행' },
    { id: 'agents', label: '에이전트 상세' },
  ];

  var tabBtns = tabs.map(function (t) {
    return h('button', {
      className: 'tab-btn' + (state.activeTab === t.id ? ' active' : ''),
      onClick: function () {
        state.activeTab = t.id;
        render();
      },
    }, t.label);
  });

  return h('div', { className: 'tabs' }, tabBtns);
}

function renderDashboard() {
  // Left column
  var chartCard = h('div', { className: 'card mb-4' },
    h('div', { className: 'card-title' }, '급이 패턴 분석 (30일)'),
    h('div', { className: 'chart-container', id: 'feeding-chart' })
  );

  // Anomaly slider
  var sliderLabel = h('span', { className: 'text-sm', style: { minWidth: '140px' } }, '이상 시나리오 주입');
  var sliderValue = h('span', { className: 'text-sm', id: 'slider-value', style: { minWidth: '40px', textAlign: 'right' } }, '0%');
  var slider = h('input', {
    type: 'range',
    min: '0',
    max: '100',
    value: '0',
    className: 'anomaly-slider',
    onInput: function (e) {
      var val = parseInt(e.target.value, 10);
      var sv = document.getElementById('slider-value');
      if (sv) sv.textContent = val + '%';
      applyAnomalySlider(val);
    },
  });
  var sliderContainer = h('div', { className: 'anomaly-slider-container' }, sliderLabel, slider, sliderValue);

  // Log timeline
  var logEntries = state.logs.map(function (log) {
    var agent = getAgentById(log.agentId);
    var borderColor = agent ? agent.color : 'var(--border)';
    var agentLabel = agent ? agent.name + ' (' + agent.nameKo + ')' : log.agentName || 'System';
    var isRunning = log.status === 'running';

    return h('div', {
      className: 'log-entry' + (isRunning ? ' running' : ''),
      style: { borderLeftColor: borderColor },
    },
      h('span', { className: 'log-agent', style: { color: borderColor } }, agentLabel),
      h('span', { className: 'log-content' }, log.content),
      h('span', { className: 'log-time' }, formatTime(log.timestamp)),
      h('span', { className: 'log-duration' }, log.duration_ms ? formatDuration(log.duration_ms) : '')
    );
  });

  var logTimeline = h('div', { className: 'card' },
    h('div', { className: 'card-title' }, '에이전트 실행 로그'),
    h('div', { className: 'log-timeline' },
      logEntries.length > 0
        ? logEntries
        : h('div', { className: 'empty-state' }, '시나리오를 실행하면 에이전트 로그가 여기에 표시됩니다.')
    )
  );

  var leftCol = h('div', null, chartCard, sliderContainer, logTimeline);

  // Right column
  var rateColor = state.metrics.feedingChangeRate < 0 ? 'var(--red)' : 'var(--green)';
  var metricCards = h('div', { className: 'metrics-row' },
    h('div', { className: 'card metric-card' },
      h('div', { className: 'metric-value', style: { color: rateColor } }, state.metrics.feedingChangeRate + '%'),
      h('div', { className: 'metric-label' }, '급이량 변화율')
    ),
    h('div', { className: 'card metric-card' },
      h('div', { className: 'metric-value' }, state.metrics.anomalyDays + ''),
      h('div', { className: 'metric-label' }, '이상 지속일수'),
      h('div', { className: 'metric-sub' }, '일')
    ),
    h('div', { className: 'card metric-card' },
      h('div', { className: 'metric-value' }, state.metrics.estimatedRiskHours + ''),
      h('div', { className: 'metric-label' }, '위험 전환 시간'),
      h('div', { className: 'metric-sub' }, '시간')
    )
  );

  // Recommendation box
  var recClass = 'recommendation-box';
  if (state.riskLevel === 'emergency' || state.riskLevel === 'danger' || state.riskLevel === 'caution') {
    recClass += ' ' + state.riskLevel;
  }
  var recBox = h('div', { className: 'card mb-4' },
    h('div', { className: 'card-title' }, 'AI 권고사항'),
    h('div', { className: recClass },
      state.recommendation
        ? state.recommendation
        : h('div', { className: 'empty-state', style: { padding: '20px' } }, '시나리오 실행 후 AI 권고사항이 표시됩니다.')
    )
  );

  // Agentic loop visualization
  var loopCard = h('div', { className: 'card' },
    h('div', { className: 'card-title' }, 'Agentic Loop'),
    h('div', { className: 'loop-container', id: 'agent-loop' })
  );

  var rightCol = h('div', null, metricCards, recBox, loopCard);

  return h('div', { className: 'dashboard-grid' }, leftCol, rightCol);
}
function renderScenarios() {
  var scenarioCards = SCENARIOS.map(function (sc) {
    var isSelected = state.selectedScenario === sc.id;
    var isRunning = state.pipeline.isRunning && state.pipeline.scenario === sc.id;
    var cls = 'card scenario-card';
    if (isSelected) cls += ' selected';
    if (isRunning) cls += ' running';

    var details = h('ul', { className: 'scenario-details' },
      sc.details.map(function (d) {
        return h('li', null, d);
      })
    );

    return h('div', {
      className: cls,
      onClick: function () {
        if (state.pipeline.isRunning) return;
        if (state.selectedScenario === sc.id) {
          runScenario(sc.id);
        } else {
          state.selectedScenario = sc.id;
          render();
        }
      },
    },
      h('div', { className: 'scenario-icon', style: { background: sc.iconBg }, innerHTML: sc.icon }),
      h('h3', null, sc.title),
      h('p', null, sc.description),
      details
    );
  });

  var scenarioGrid = h('div', { className: 'scenarios-grid' }, scenarioCards);

  var runBtn = h('button', {
    className: 'btn btn-primary mb-4',
    disabled: !state.selectedScenario || state.pipeline.isRunning,
    onClick: function () {
      if (state.selectedScenario && !state.pipeline.isRunning) {
        runScenario(state.selectedScenario);
      }
    },
  }, state.pipeline.isRunning ? '실행 중...' : '시나리오 실행');

  // Stepper
  var stepNames = ['데이터 수집'].concat(AGENTS.map(function (a) { return a.nameKo; }));
  var stepElements = [];

  for (var i = 0; i < stepNames.length; i++) {
    var stepState = state.scenarioSteps[i] || { status: 'pending', duration: null };
    var stepCls = 'step';
    if (stepState.status === 'completed') stepCls += ' completed';
    if (stepState.status === 'active') stepCls += ' active';

    var circleContent = stepState.status === 'completed' ? '✓' : String(i + 1);
    var circle = h('div', { className: 'step-circle' }, circleContent);
    var label = h('div', { className: 'step-label' }, stepNames[i]);
    var duration = h('div', { className: 'step-duration' }, stepState.duration ? formatDuration(stepState.duration) : '');

    var step = h('div', { className: stepCls }, circle, label, duration);
    stepElements.push(step);

    if (i < stepNames.length - 1) {
      var lineCls = 'step-line';
      if (stepState.status === 'completed') lineCls += ' completed';
      stepElements.push(h('div', { className: lineCls }));
    }
  }

  var stepper = h('div', { className: 'stepper' }, stepElements);

  return h('div', null, scenarioGrid, runBtn, stepper);
}
function renderAgents() {
  var agentCards = AGENTS.map(function (agent) {
    var perf = state.agentPerformances[agent.id] || { executionCount: 0, avgResponseTime: 0, lastDecision: '' };

    var iconCircle = h('div', {
      className: 'agent-icon',
      style: { background: agent.color },
    }, agent.icon);

    var nameBlock = h('div', null,
      h('div', { className: 'agent-name' }, agent.name),
      h('div', { className: 'agent-name-ko' }, agent.nameKo),
      h('div', { className: 'agent-tech' }, agent.tech)
    );

    var header = h('div', { className: 'agent-header' }, iconCircle, nameBlock);

    var stats = h('div', { className: 'agent-stats' },
      h('div', { className: 'agent-stat' },
        h('div', { className: 'agent-stat-value' }, String(perf.executionCount)),
        h('div', { className: 'agent-stat-label' }, '실행 횟수')
      ),
      h('div', { className: 'agent-stat' },
        h('div', { className: 'agent-stat-value' }, perf.avgResponseTime ? formatDuration(perf.avgResponseTime) : '-'),
        h('div', { className: 'agent-stat-label' }, '평균 응답시간')
      )
    );

    var decisionText = perf.lastDecision || '아직 실행 기록이 없습니다.';
    var decision = h('div', { className: 'agent-decision' }, decisionText);

    return h('div', { className: 'card agent-detail-card' }, header, stats, decision);
  });

  var agentGrid = h('div', { className: 'agents-grid' }, agentCards);

  // System performance metrics
  var perfTitle = h('div', { className: 'card-title', style: { marginTop: '24px', marginBottom: '12px' } }, '시스템 성능 지표');

  var perfCards = h('div', { className: 'perf-grid' },
    h('div', { className: 'card' },
      h('div', { className: 'progress-bar-container', id: 'perf-accuracy' })
    ),
    h('div', { className: 'card' },
      h('div', { className: 'progress-bar-container', id: 'perf-consistency' })
    ),
    h('div', { className: 'card' },
      h('div', { className: 'progress-bar-container', id: 'perf-hallucination' })
    )
  );

  return h('div', null, agentGrid, perfTitle, perfCards);
}
// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

function render() {
  var app = document.getElementById('app');
  app.innerHTML = '';

  // Set risk class on app container
  app.className = '';
  if (state.riskLevel !== 'normal') {
    app.className = 'risk-' + state.riskLevel;
  }

  app.appendChild(renderHeader());
  app.appendChild(renderTabs());

  // Dashboard tab
  var dashboardContent = h('div', {
    className: 'tab-content' + (state.activeTab === 'dashboard' ? ' active' : ''),
  });
  dashboardContent.appendChild(renderDashboard());
  app.appendChild(dashboardContent);

  // Scenarios tab
  var scenariosContent = h('div', {
    className: 'tab-content' + (state.activeTab === 'scenarios' ? ' active' : ''),
  });
  scenariosContent.appendChild(renderScenarios());
  app.appendChild(scenariosContent);

  // Agents tab
  var agentsContent = h('div', {
    className: 'tab-content' + (state.activeTab === 'agents' ? ' active' : ''),
  });
  agentsContent.appendChild(renderAgents());
  app.appendChild(agentsContent);

  // Post-render: populate chart, agent loop, and performance bars
  requestAnimationFrame(function () {
    var chartContainer = document.getElementById('feeding-chart');
    if (chartContainer) {
      renderFeedingChart(chartContainer, state.feedingData, state.anomalyScores);
    }

    var loopContainer = document.getElementById('agent-loop');
    if (loopContainer) {
      renderAgentLoop(loopContainer, state.pipeline.currentAgent, state.pipeline.completedAgents);
    }

    var perfAccuracy = document.getElementById('perf-accuracy');
    if (perfAccuracy) {
      renderProgressBar(perfAccuracy, '응답 정확도', 87, 85, '#22c55e');
    }

    var perfConsistency = document.getElementById('perf-consistency');
    if (perfConsistency) {
      renderProgressBar(perfConsistency, '응답 일관성', 91, 90, '#3b82f6');
    }

    var perfHallucination = document.getElementById('perf-hallucination');
    if (perfHallucination) {
      // Hallucination rate: lower is better, invert for display
      // 3.2% with target below 5% => shown as (5 - 3.2)/5 * 100 = 36% fill inverted
      // We show the actual value but color green if below 5%
      var hallRate = 3.2;
      var target = 5;
      var pct = Math.min(100, (hallRate / target) * 100);
      var isGood = hallRate < target;
      perfHallucination.innerHTML =
        '<div class="progress-bar-label">' +
          '<span>환각 발생률</span>' +
          '<span style="color: ' + (isGood ? '#22c55e' : '#ef4444') + '">' + hallRate + '% / ' + target + '%</span>' +
        '</div>' +
        '<div class="progress-bar">' +
          '<div class="progress-bar-fill" style="width: ' + pct + '%; background: ' + (isGood ? '#22c55e' : '#ef4444') + ';"></div>' +
        '</div>';
    }
  });
}
// ---------------------------------------------------------------------------
// Anomaly slider
// ---------------------------------------------------------------------------

function applyAnomalySlider(val) {
  if (!state._originalFeedingData) {
    state._originalFeedingData = state.feedingData.map(function (d) {
      return Object.assign({}, d);
    });
  }

  var original = state._originalFeedingData;
  var n = Math.max(1, Math.round((val / 100) * original.length));
  var modified = original.map(function (d) { return Object.assign({}, d); });

  if (val > 0) {
    for (var i = original.length - n; i < original.length; i++) {
      var factor = 1 - (val / 100) * ((i - (original.length - n)) / n);
      modified[i].consumption_kg = Math.round(original[i].consumption_kg * factor * 10) / 10;
      var baseline = modified[i].normal_baseline;
      modified[i].deviation_pct = baseline === 0 ? 0 : Math.round(((modified[i].consumption_kg - baseline) / baseline) * 100 * 10) / 10;
    }
  }

  state.feedingData = modified;

  // Recalculate anomaly scores
  var devs = modified.map(function (d) { return d.deviation_pct; });
  var gm = devs.reduce(function (s, v) { return s + v; }, 0) / devs.length;
  var gs = Math.sqrt(devs.reduce(function (s, v) { return s + (v - gm) * (v - gm); }, 0) / devs.length) || 1;

  state.anomalyScores = modified.map(function (p, i) {
    var zDev = -(p.deviation_pct - gm) / gs;
    var slopeFactor = -(p.slope || 0) / 5;
    var volFactor = (p.volatility || 0) / 0.1;
    var raw = 0.60 * zDev + 0.25 * slopeFactor + 0.15 * volFactor;
    var score = Math.round((1 / (1 + Math.exp(-(1.8 * raw - 1.0)))) * 1000) / 1000;
    score = Math.max(0, Math.min(1, score));
    return { index: i, score: score, isAnomaly: score > 0.6 };
  });

  // Re-render chart only
  var chartContainer = document.getElementById('feeding-chart');
  if (chartContainer) {
    renderFeedingChart(chartContainer, state.feedingData, state.anomalyScores);
  }
}

// ---------------------------------------------------------------------------
// SSE pipeline runner
// ---------------------------------------------------------------------------

function runScenario(scenarioId) {
  if (state.pipeline.isRunning) return;

  // Initialize pipeline state
  state.pipeline.isRunning = true;
  state.pipeline.currentAgent = null;
  state.pipeline.completedAgents = [];
  state.pipeline.results = [];
  state.pipeline.scenario = scenarioId;
  state.logs = [];
  state.recommendation = '';

  // Initialize stepper: step 0 = data collection, steps 1-7 = agents
  state.scenarioSteps = [];
  for (var i = 0; i < 8; i++) {
    state.scenarioSteps.push({ status: 'pending', duration: null });
  }

  // Set data collection step to active
  state.scenarioSteps[0] = { status: 'active', duration: null };
  render();

  // Fetch simulation data
  var dataStartTime = Date.now();
  fetch('/api/simulator?scenario=' + scenarioId)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      state.feedingData = data.feedingData;
      state.environmentData = data.environmentData;
      state.anomalyScores = data.anomalyScores;
      state._originalFeedingData = data.feedingData.map(function (d) { return Object.assign({}, d); });

      calcMetrics(data.feedingData, data.anomalyScores, scenarioId);

      // Mark data collection as completed
      state.scenarioSteps[0] = { status: 'completed', duration: Date.now() - dataStartTime };
      render();

      // Start SSE agent pipeline
      startAgentPipeline(scenarioId, data.feedingData, data.environmentData);
    })
    .catch(function (err) {
      console.error('Failed to fetch simulation data:', err);
      state.pipeline.isRunning = false;
      state.scenarioSteps[0] = { status: 'completed', duration: Date.now() - dataStartTime };
      render();
    });
}
function startAgentPipeline(scenarioId, feedingData, environmentData) {
  fetch('/api/agents/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenario: scenarioId,
      feedingData: feedingData,
      environmentData: environmentData,
    }),
  })
    .then(function (response) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        reader.read().then(function (result) {
          if (result.done) {
            // Process any remaining buffer
            if (buffer.trim()) {
              processSSEBuffer(buffer);
            }
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });

          // Split on double newlines (SSE event boundary)
          var parts = buffer.split('\n\n');
          // Keep the last part as it may be incomplete
          buffer = parts.pop() || '';

          parts.forEach(function (part) {
            if (part.trim()) {
              processSSEEvent(part.trim());
            }
          });

          read();
        }).catch(function (err) {
          console.error('SSE read error:', err);
          state.pipeline.isRunning = false;
          render();
        });
      }

      read();
    })
    .catch(function (err) {
      console.error('Failed to start agent pipeline:', err);
      state.pipeline.isRunning = false;
      render();
    });
}

function processSSEBuffer(buffer) {
  var lines = buffer.split('\n');
  lines.forEach(function (line) {
    if (line.trim()) {
      processSSEEvent(line.trim());
    }
  });
}

function processSSEEvent(rawEvent) {
  // Extract data from SSE format
  var dataLine = null;
  var lines = rawEvent.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.startsWith('data: ')) {
      dataLine = line.slice(6);
      break;
    }
  }

  if (!dataLine) return;

  var evt;
  try {
    evt = JSON.parse(dataLine);
  } catch (e) {
    console.error('Failed to parse SSE data:', dataLine);
    return;
  }

  var type = evt.type;
  var data = evt.data;

  if (type === 'agent_start') {
    handleAgentStart(data);
  } else if (type === 'agent_complete') {
    handleAgentComplete(data);
  } else if (type === 'agent_error') {
    handleAgentError(data);
  } else if (type === 'pipeline_complete') {
    handlePipelineComplete(data);
  }
}

function getAgentStepIndex(agentId) {
  for (var i = 0; i < AGENTS.length; i++) {
    if (AGENTS[i].id === agentId) return i + 1; // +1 because step 0 is data collection
  }
  return -1;
}
function handleAgentStart(data) {
  var agentId = data.agentId;
  var stepIdx = getAgentStepIndex(agentId);

  state.pipeline.currentAgent = agentId;

  // Update stepper
  if (stepIdx >= 0 && stepIdx < state.scenarioSteps.length) {
    state.scenarioSteps[stepIdx] = { status: 'active', duration: null };
  }

  // Add running log entry
  var logEntry = {
    id: 'log-' + Date.now() + '-' + agentId,
    agentId: agentId,
    agentName: data.agentName,
    content: '분석 중...',
    timestamp: data.timestamp,
    duration_ms: null,
    status: 'running',
  };
  state.logs.unshift(logEntry);

  render();
}

function handleAgentComplete(data) {
  var agentId = data.agentId;
  var stepIdx = getAgentStepIndex(agentId);
  var duration = data.duration_ms;

  // Mark agent as completed
  state.pipeline.completedAgents.push(agentId);
  state.pipeline.results.push({
    agentId: agentId,
    response: data.response,
    duration_ms: duration,
  });

  // Update stepper
  if (stepIdx >= 0 && stepIdx < state.scenarioSteps.length) {
    state.scenarioSteps[stepIdx] = { status: 'completed', duration: duration };
  }

  // Build summary from response
  var summary = buildResponseSummary(agentId, data.response);

  // Update log entry (find the running one for this agent)
  var found = false;
  for (var i = 0; i < state.logs.length; i++) {
    if (state.logs[i].agentId === agentId && state.logs[i].status === 'running') {
      state.logs[i].content = summary;
      state.logs[i].duration_ms = duration;
      state.logs[i].status = 'completed';
      state.logs[i].timestamp = data.timestamp;
      found = true;
      break;
    }
  }

  if (!found) {
    state.logs.unshift({
      id: 'log-' + Date.now() + '-' + agentId,
      agentId: agentId,
      agentName: data.agentName,
      content: summary,
      timestamp: data.timestamp,
      duration_ms: duration,
      status: 'completed',
    });
  }

  // Update agent performance
  var perf = state.agentPerformances[agentId] || { executionCount: 0, avgResponseTime: 0, lastDecision: '' };
  perf.executionCount += 1;
  perf.avgResponseTime = perf.executionCount === 1
    ? duration
    : Math.round((perf.avgResponseTime * (perf.executionCount - 1) + duration) / perf.executionCount);
  perf.lastDecision = summary;
  state.agentPerformances[agentId] = perf;

  render();
}

function handleAgentError(data) {
  var agentId = data.agentId;
  var stepIdx = getAgentStepIndex(agentId);

  state.pipeline.completedAgents.push(agentId);

  if (stepIdx >= 0 && stepIdx < state.scenarioSteps.length) {
    state.scenarioSteps[stepIdx] = { status: 'completed', duration: null };
  }

  // Update log entry
  for (var i = 0; i < state.logs.length; i++) {
    if (state.logs[i].agentId === agentId && state.logs[i].status === 'running') {
      state.logs[i].content = '오류: ' + (data.error || '알 수 없는 오류');
      state.logs[i].status = 'error';
      state.logs[i].timestamp = data.timestamp;
      break;
    }
  }

  render();
}
function handlePipelineComplete(data) {
  state.pipeline.isRunning = false;
  state.pipeline.currentAgent = null;

  // Extract risk level and recommendation from orchestration agent
  var orchestrationResult = null;
  for (var i = 0; i < state.pipeline.results.length; i++) {
    if (state.pipeline.results[i].agentId === 'orchestration') {
      orchestrationResult = state.pipeline.results[i].response;
      break;
    }
  }

  if (orchestrationResult) {
    if (orchestrationResult.alert_level) {
      state.riskLevel = orchestrationResult.alert_level;
    }
    if (orchestrationResult.farmer_message) {
      state.recommendation = orchestrationResult.farmer_message;
    }
  }

  // Update metrics based on scenario
  var scenarioId = state.pipeline.scenario;
  if (scenarioId === 'disease_asf') {
    state.metrics.estimatedRiskHours = 12;
  } else if (scenarioId === 'environment_heat') {
    state.metrics.estimatedRiskHours = 48;
  }
  calcMetrics(state.feedingData, state.anomalyScores, scenarioId);

  // Switch to dashboard tab
  state.activeTab = 'dashboard';
  render();
}

function buildResponseSummary(agentId, response) {
  if (!response) return '응답 없음';

  switch (agentId) {
    case 'context':
      return response.situation_summary || JSON.stringify(response).slice(0, 200);
    case 'risk_trajectory':
      var stateLabel = response.current_state || '?';
      var severity = response.severity_score ? (response.severity_score * 100).toFixed(0) + '%' : '?';
      return '현재 상태: ' + stateLabel + ', 위험도: ' + severity + ', 전환 예상: ' + (response.risk_timeline_hours || '?') + '시간';
    case 'planning':
      var immediate = response.action_plan && response.action_plan.immediate ? response.action_plan.immediate.length : 0;
      var similar = response.similar_cases ? response.similar_cases.length : 0;
      return '즉각조치 ' + immediate + '건, 유사사례 ' + similar + '건 참조, 신뢰도 ' + ((response.confidence || 0) * 100).toFixed(0) + '%';
    case 'execution':
      var checklist = response.checklist ? response.checklist.length : 0;
      var vetReq = response.vet_required ? '수의사 호출 필요' : '';
      return '체크리스트 ' + checklist + '건' + (vetReq ? ', ' + vetReq : '');
    case 'monitoring':
      var metrics = response.monitoring_metrics ? response.monitoring_metrics.length : 0;
      var nextCheck = response.next_check_hours || '?';
      return '모니터링 지표 ' + metrics + '건, 다음 확인: ' + nextCheck + '시간 후';
    case 'recovery':
      var effScore = response.effectiveness_score ? (response.effectiveness_score * 100).toFixed(0) + '%' : '?';
      var adjustNeeded = response.plan_adjustment_needed ? '조정 필요' : '조정 불필요';
      return '효과성: ' + effScore + ', ' + adjustNeeded;
    case 'orchestration':
      return response.final_decision || response.farmer_message || JSON.stringify(response).slice(0, 200);
    default:
      return JSON.stringify(response).slice(0, 200);
  }
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

function updateClock() {
  var clockEl = document.getElementById('clock');
  if (clockEl) {
    clockEl.textContent = formatTime(new Date().toISOString());
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initApp() {
  // Initialize agent performances
  AGENTS.forEach(function (a) {
    state.agentPerformances[a.id] = { executionCount: 0, avgResponseTime: 0, lastDecision: '' };
  });

  // Fetch initial data for default view
  fetch('/api/simulator?scenario=disease_asf')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      state.feedingData = data.feedingData;
      state.environmentData = data.environmentData;
      state.anomalyScores = data.anomalyScores;
      state._originalFeedingData = data.feedingData.map(function (d) { return Object.assign({}, d); });

      calcMetrics(data.feedingData, data.anomalyScores, 'disease_asf');

      render();
    })
    .catch(function (err) {
      console.error('Failed to fetch initial data:', err);
      render();
    });

  // Start clock
  clockInterval = setInterval(updateClock, 1000);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', initApp);
