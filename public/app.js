// ===== Main App =====
var h = React.createElement;

// ----- Dashboard Tab -----
function DashboardTab() {
  var ctx = useAppState(), state = ctx.state, actions = ctx.actions;
  var feedingData = state.feedingData, metrics = state.metrics, riskLevel = state.riskLevel, pipeline = state.pipeline, logs = state.logs, recommendation = state.recommendation;

  React.useEffect(function () {
    if (feedingData.length === 0) {
      var data = generateFeedingData('disease_asf');
      var normalData = data.slice(0, 25);
      actions.update({
        feedingData: normalData,
        metrics: { feedingChangeRate: -2.1, anomalyDays: 0, estimatedRiskHours: 999, riskLevel: 'normal' }
      });
    }
  }, [feedingData.length]);

  var anomalyResults = detectAnomalies(feedingData);
  var anomalyIndices = anomalyResults.filter(function (r) { return r.isAnomaly; }).map(function (r) { return r.index; });

  return h('div', { className: 'flex flex-col lg:flex-row gap-4' },
    h('div', { className: 'flex-1 space-y-4', style: { flex: 2 } },
      h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/30 p-4' },
        h('div', { className: 'mb-2 flex items-center justify-between' },
          h('h2', { className: 'text-sm font-semibold text-gray-300' }, '급이패턴 실시간 모니터링'),
          h('span', { className: 'text-xs text-gray-500' }, '최근 ' + feedingData.length + '일 데이터')
        ),
        h(FeedingPatternChart, { data: feedingData, anomalyIndices: anomalyIndices })
      ),
      h(AgentLogTimeline, { logs: logs, maxHeight: '350px' })
    ),
    h('div', { className: 'space-y-4', style: { flex: 1 } },
      h('div', { className: 'space-y-3' },
        h(MetricCard, { title: '급이량 변화율', value: metrics.feedingChangeRate, unit: '%', description: '오늘 vs 7일 평균', trend: metrics.feedingChangeRate < -10 ? 'down' : metrics.feedingChangeRate > 5 ? 'up' : 'stable', alert: metrics.feedingChangeRate < -20 }),
        h(MetricCard, { title: '이상 지속일수', value: metrics.anomalyDays, unit: '일', description: '연속 이상 탐지 일수', alert: metrics.anomalyDays > 2 }),
        h(MetricCard, { title: '위험 전환 예상', value: metrics.estimatedRiskHours > 100 ? '\u221E' : metrics.estimatedRiskHours, unit: metrics.estimatedRiskHours > 100 ? '' : '시간', description: 'HMM 모델 추정', alert: metrics.estimatedRiskHours < 24 })
      ),
      h(RecommendationBox, { text: recommendation, riskLevel: riskLevel }),
      h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/30 p-4' },
        h('h3', { className: 'mb-2 text-center text-sm font-semibold text-gray-300' }, 'Agentic Loop 상태'),
        h(AgentLoopVisual, { currentAgent: pipeline.currentAgent, completedAgents: pipeline.completedAgents })
      )
    )
  );
}

// ----- Scenarios Tab -----
function ScenariosTab() {
  var ctx = useAppState(), state = ctx.state, actions = ctx.actions;
  var pipeline = state.pipeline;

  function summarizeResult(agentId, response) {
    if (!response) return '';
    if (agentId === 'context') return response.situation_summary || '';
    if (agentId === 'risk_trajectory') return '현재 상태: ' + (response.current_state || '') + ', 심각도: ' + (response.severity_score || '');
    if (agentId === 'planning') return (response.action_plan && response.action_plan.immediate) ? response.action_plan.immediate.join(', ') : '';
    if (agentId === 'execution') return response.alert_message || '';
    if (agentId === 'monitoring') return (response.monitoring_metrics || []).slice(0, 2).join(', ');
    if (agentId === 'recovery') return '효과 점수: ' + (response.effectiveness_score || '') + ', 에스컬레이션: ' + (response.escalation_required ? '필요' : '불필요');
    if (agentId === 'orchestration') return response.farmer_message || '';
    return JSON.stringify(response).slice(0, 100);
  }

  function runScenario(scenarioId) {
    actions.startPipeline(scenarioId);
    var feedingData = generateFeedingData(scenarioId);
    var updateData = { feedingData: feedingData };

    if (scenarioId === 'disease_asf') {
      updateData.metrics = { feedingChangeRate: -35.2, anomalyDays: 3, estimatedRiskHours: 12, riskLevel: 'emergency' };
      updateData.riskLevel = 'emergency';
    } else if (scenarioId === 'environment_heat') {
      updateData.metrics = { feedingChangeRate: -5.3, anomalyDays: 0, estimatedRiskHours: 48, riskLevel: 'caution' };
      updateData.riskLevel = 'caution';
    } else {
      updateData.metrics = { feedingChangeRate: 2.1, anomalyDays: 0, estimatedRiskHours: 999, riskLevel: 'normal' };
      updateData.riskLevel = 'normal';
    }
    actions.update(updateData);

    fetch('/api/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: scenarioId })
    }).then(function (response) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        reader.read().then(function (result) {
          if (result.done) return;
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';
          lines.forEach(function (line) {
            if (line.startsWith('data: ')) {
              try {
                var event = JSON.parse(line.slice(6));
                if (event.type === 'agent_start') {
                  actions.setCurrentAgent(event.data.agentId);
                  actions.addLog({
                    id: 'start-' + event.data.agentId + '-' + Date.now(),
                    agentId: event.data.agentId,
                    agentName: event.data.agentName,
                    content: event.data.agentName + ' 분석 시작...',
                    timestamp: event.data.timestamp,
                    duration_ms: 0,
                    status: 'running'
                  });
                } else if (event.type === 'agent_complete') {
                  var summary = summarizeResult(event.data.agentId, event.data.response);
                  actions.completeAgent(event.data.agentId, {
                    agentId: event.data.agentId,
                    response: event.data.response,
                    rawText: event.data.rawText,
                    timestamp: event.data.timestamp,
                    duration_ms: event.data.duration_ms
                  });
                  actions.addLog({
                    id: 'complete-' + event.data.agentId + '-' + Date.now(),
                    agentId: event.data.agentId,
                    agentName: event.data.agentName,
                    content: summary,
                    timestamp: event.data.timestamp,
                    duration_ms: event.data.duration_ms,
                    status: 'completed'
                  });
                  actions.updateAgentPerf({
                    agentId: event.data.agentId,
                    executionCount: 1,
                    avgResponseTime: event.data.duration_ms,
                    lastDecision: summary
                  });
                  if (event.data.agentId === 'orchestration' && event.data.response) {
                    actions.update({ recommendation: event.data.response.farmer_message || '' });
                  }
                } else if (event.type === 'pipeline_complete') {
                  actions.completePipeline();
                }
              } catch (e) { /* skip */ }
            }
          });
          read();
        });
      }
      read();
    }).catch(function (err) {
      console.error('Pipeline error:', err);
      actions.completePipeline();
    });
  }

  var durations = {};
  pipeline.results.forEach(function (r) { durations[r.agentId] = r.duration_ms; });

  return h('div', { className: 'space-y-6' },
    h('div', null,
      h('h2', { className: 'mb-4 text-lg font-bold text-white' }, '시나리오 선택'),
      h('div', { className: 'grid grid-cols-1 gap-4 md:grid-cols-3' },
        SCENARIOS.map(function (scenario) {
          return h(ScenarioCard, { key: scenario.id, scenario: scenario, isActive: pipeline.scenario === scenario.id, isRunning: pipeline.isRunning, onSelect: runScenario });
        })
      )
    ),
    (pipeline.isRunning || pipeline.completedAgents.length > 0) &&
      h(ExecutionStepper, { currentAgent: pipeline.currentAgent, completedAgents: pipeline.completedAgents, durations: durations })
  );
}

// ----- Agents Tab -----
function AgentsTab() {
  var ctx = useAppState(), state = ctx.state;
  var PERF_TARGETS = [
    { label: '응답 정확도', target: 85, current: 87.3, unit: '%' },
    { label: '응답 일관성', target: 90, current: 91.2, unit: '%' },
    { label: '환각 발생률', target: 5, current: 3.2, unit: '%', inverse: true },
  ];
  return h('div', { className: 'space-y-6' },
    h('div', null,
      h('h2', { className: 'mb-4 text-lg font-bold text-white' }, '에이전트 상세 정보'),
      h('div', { className: 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' },
        AGENT_DEFINITIONS.map(function (agent) {
          var perf = state.agentPerformances.find(function (p) { return p.agentId === agent.id; });
          return h(AgentCard, { key: agent.id, agent: agent, performance: perf });
        })
      )
    ),
    h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/30 p-6' },
      h('h2', { className: 'mb-4 text-lg font-bold text-white' }, '시스템 성과 지표'),
      h('div', { className: 'space-y-4' },
        PERF_TARGETS.map(function (metric) {
          var isGood = metric.inverse ? metric.current <= metric.target : metric.current >= metric.target;
          var pct = metric.inverse ? Math.max(0, 100 - (metric.current / metric.target) * 100 + 100) : (metric.current / 100) * 100;
          return h('div', { key: metric.label },
            h('div', { className: 'mb-1 flex items-center justify-between' },
              h('span', { className: 'text-sm text-gray-400' }, metric.label),
              h('div', { className: 'flex items-center gap-2' },
                h('span', { className: 'text-xs text-gray-500' }, '목표: ' + metric.target + metric.unit + (metric.inverse ? ' 이하' : ' 이상')),
                h('span', { className: 'text-sm font-bold ' + (isGood ? 'text-green-400' : 'text-red-400') }, metric.current + metric.unit)
              )
            ),
            h('div', { className: 'h-2.5 rounded-full bg-gray-700' },
              h('div', { className: 'h-2.5 rounded-full transition-all ' + (isGood ? 'bg-green-500' : 'bg-red-500'), style: { width: Math.min(pct, 100) + '%' } })
            )
          );
        })
      )
    )
  );
}

// ----- Main App -----
function App() {
  var ctx = useAppState(), state = ctx.state, actions = ctx.actions;
  var activeTab = state.activeTab, riskLevel = state.riskLevel, pipeline = state.pipeline;
  var timeRef = React.useRef('');
  var _ft = React.useState(0), forceUpdate = _ft[1];

  React.useEffect(function () {
    function update() {
      timeRef.current = new Date().toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      forceUpdate(function (n) { return n + 1; });
    }
    update();
    var interval = setInterval(update, 1000);
    return function () { clearInterval(interval); };
  }, []);

  var runningCount = pipeline.isRunning ? pipeline.completedAgents.length + 1 : 7;
  var TABS = [
    { id: 'dashboard', label: '실시간 모니터링' },
    { id: 'scenarios', label: '시나리오 실행' },
    { id: 'agents', label: '에이전트 상세' },
  ];

  return h('div', { className: 'min-h-screen' },
    // Header
    h('header', { className: 'border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm' },
      h('div', { className: 'mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3' },
        h('div', { className: 'flex items-center gap-4' },
          h('div', null,
            h('h1', { className: 'text-lg font-bold text-white' },
              h('span', { className: 'text-blue-400' }, 'MANSA'), ' 축산 AI 에이전트 데모'),
            h('p', { className: 'text-xs text-gray-500' }, '제일축산영농조합법인 1호동')
          ),
          h(RiskBadge, { level: riskLevel, size: 'lg' })
        ),
        h('div', { className: 'flex items-center gap-4' },
          h('div', { className: 'flex items-center gap-2 text-xs text-gray-400' },
            h('span', { className: 'inline-block h-2 w-2 rounded-full ' + (pipeline.isRunning ? 'animate-pulse bg-yellow-400' : 'bg-green-400') }),
            '에이전트 ' + runningCount + '/7 가동 중'
          ),
          h('div', { className: 'text-xs tabular-nums text-gray-500' }, timeRef.current)
        )
      )
    ),
    // Tab Nav
    h('nav', { className: 'border-b border-gray-800 bg-gray-900/50' },
      h('div', { className: 'mx-auto flex max-w-[1400px] px-4' },
        TABS.map(function (tab) {
          return h('button', {
            key: tab.id,
            onClick: function () { actions.setActiveTab(tab.id); },
            className: 'border-b-2 px-5 py-3 text-sm font-medium transition-all ' +
              (activeTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300')
          }, tab.label);
        })
      )
    ),
    // Content
    h('main', { className: 'mx-auto max-w-[1400px] p-4' },
      activeTab === 'dashboard' && h(DashboardTab),
      activeTab === 'scenarios' && h(ScenariosTab),
      activeTab === 'agents' && h(AgentsTab)
    )
  );
}

// ===== Mount =====
try {
  var rootEl = document.getElementById('root');
  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootEl).render(h(AppStateProvider, null, h(App)));
  } else {
    ReactDOM.render(h(AppStateProvider, null, h(App)), rootEl);
  }
} catch (e) {
  document.getElementById('root').innerHTML = '<div style="color:red;padding:20px"><h2>Mount Error</h2><pre>' + e.message + '</pre></div>';
}
