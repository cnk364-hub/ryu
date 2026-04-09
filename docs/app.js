// ===== Main App (GitHub Pages - no server) =====
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
          h('h2', { className: 'text-sm font-semibold text-gray-300' }, '\uAE09\uC774\uD328\uD134 \uC2E4\uC2DC\uAC04 \uBAA8\uB2C8\uD130\uB9C1'),
          h('span', { className: 'text-xs text-gray-500' }, '\uCD5C\uADFC ' + feedingData.length + '\uC77C \uB370\uC774\uD130')
        ),
        h(FeedingPatternChart, { data: feedingData, anomalyIndices: anomalyIndices })
      ),
      h(AgentLogTimeline, { logs: logs, maxHeight: '350px' })
    ),
    h('div', { className: 'space-y-4', style: { flex: 1 } },
      h('div', { className: 'space-y-3' },
        h(MetricCard, { title: '\uAE09\uC774\uB7C9 \uBCC0\uD654\uC728', value: metrics.feedingChangeRate, unit: '%', description: '\uC624\uB298 vs 7\uC77C \uD3C9\uADE0', trend: metrics.feedingChangeRate < -10 ? 'down' : metrics.feedingChangeRate > 5 ? 'up' : 'stable', alert: metrics.feedingChangeRate < -20 }),
        h(MetricCard, { title: '\uC774\uC0C1 \uC9C0\uC18D\uC77C\uC218', value: metrics.anomalyDays, unit: '\uC77C', description: '\uC5F0\uC18D \uC774\uC0C1 \uD0D0\uC9C0 \uC77C\uC218', alert: metrics.anomalyDays > 2 }),
        h(MetricCard, { title: '\uC704\uD5D8 \uC804\uD658 \uC608\uC0C1', value: metrics.estimatedRiskHours > 100 ? '\u221E' : metrics.estimatedRiskHours, unit: metrics.estimatedRiskHours > 100 ? '' : '\uC2DC\uAC04', description: 'HMM \uBAA8\uB378 \uCD94\uC815', alert: metrics.estimatedRiskHours < 24 })
      ),
      h(RecommendationBox, { text: recommendation, riskLevel: riskLevel }),
      h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/30 p-4' },
        h('h3', { className: 'mb-2 text-center text-sm font-semibold text-gray-300' }, 'Agentic Loop \uC0C1\uD0DC'),
        h(AgentLoopVisual, { currentAgent: pipeline.currentAgent, completedAgents: pipeline.completedAgents })
      )
    )
  );
}

// ----- Scenarios Tab (client-side simulation) -----
function ScenariosTab() {
  var ctx = useAppState(), state = ctx.state, actions = ctx.actions;
  var pipeline = state.pipeline;

  var AGENT_ORDER = [
    { id: 'context', name: 'Context Agent (\uC0C1\uD669\uC778\uC2DD)' },
    { id: 'risk_trajectory', name: 'Risk Trajectory Agent (\uC704\uD5D8\uADA4\uC801\uBD84\uC11D)' },
    { id: 'planning', name: 'Planning Agent (\uB300\uC751\uACC4\uD68D)' },
    { id: 'execution', name: 'Execution Agent (\uC870\uCE58\uC2E4\uD589)' },
    { id: 'monitoring', name: 'Monitoring Agent (\uAD00\uCC30)' },
    { id: 'recovery', name: 'Recovery Agent (\uC218\uC815\uBCF5\uAD6C)' },
    { id: 'orchestration', name: 'Orchestration Agent (\uD611\uC5C5\uC624\uCF00\uC2A4\uD2B8\uB808\uC774\uC158)' },
  ];

  function summarizeResult(agentId, response) {
    if (!response) return '';
    if (agentId === 'context') return response.situation_summary || '';
    if (agentId === 'risk_trajectory') return '\uD604\uC7AC \uC0C1\uD0DC: ' + (response.current_state || '') + ', \uC2EC\uAC01\uB3C4: ' + (response.severity_score || '');
    if (agentId === 'planning') return (response.action_plan && response.action_plan.immediate) ? response.action_plan.immediate.join(', ') : '';
    if (agentId === 'execution') return response.alert_message || '';
    if (agentId === 'monitoring') return (response.monitoring_metrics || []).slice(0, 2).join(', ');
    if (agentId === 'recovery') return '\uD6A8\uACFC \uC810\uC218: ' + (response.effectiveness_score || '') + ', \uC5D0\uC2A4\uCEEC\uB808\uC774\uC158: ' + (response.escalation_required ? '\uD544\uC694' : '\uBD88\uD544\uC694');
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

    // Client-side simulation (no server needed)
    var responses = MOCK_RESPONSES[scenarioId];
    if (!responses) { actions.completePipeline(); return; }

    var index = 0;
    function processNext() {
      if (index >= AGENT_ORDER.length) {
        actions.completePipeline();
        return;
      }
      var agent = AGENT_ORDER[index];
      var response = responses[agent.id] || {};

      // Agent start
      actions.setCurrentAgent(agent.id);
      actions.addLog({
        id: 'start-' + agent.id + '-' + Date.now(),
        agentId: agent.id, agentName: agent.name,
        content: agent.name + ' \uBD84\uC11D \uC2DC\uC791...',
        timestamp: new Date().toISOString(), duration_ms: 0, status: 'running'
      });

      // Simulate processing delay
      var delay = 1200 + Math.random() * 1300;
      setTimeout(function () {
        var duration_ms = Math.round(delay);
        var summary = summarizeResult(agent.id, response);

        actions.completeAgent(agent.id, {
          agentId: agent.id, response: response,
          rawText: JSON.stringify(response),
          timestamp: new Date().toISOString(), duration_ms: duration_ms
        });
        actions.addLog({
          id: 'complete-' + agent.id + '-' + Date.now(),
          agentId: agent.id, agentName: agent.name,
          content: summary, timestamp: new Date().toISOString(),
          duration_ms: duration_ms, status: 'completed'
        });
        actions.updateAgentPerf({
          agentId: agent.id, executionCount: 1,
          avgResponseTime: duration_ms, lastDecision: summary
        });
        if (agent.id === 'orchestration' && response.farmer_message) {
          actions.update({ recommendation: response.farmer_message });
        }
        index++;
        processNext();
      }, delay);
    }
    processNext();
  }

  var durations = {};
  pipeline.results.forEach(function (r) { durations[r.agentId] = r.duration_ms; });

  return h('div', { className: 'space-y-6' },
    h('div', null,
      h('h2', { className: 'mb-4 text-lg font-bold text-white' }, '\uC2DC\uB098\uB9AC\uC624 \uC120\uD0DD'),
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
    { label: '\uC751\uB2F5 \uC815\uD655\uB3C4', target: 85, current: 87.3, unit: '%' },
    { label: '\uC751\uB2F5 \uC77C\uAD00\uC131', target: 90, current: 91.2, unit: '%' },
    { label: '\uD658\uAC01 \uBC1C\uC0DD\uB960', target: 5, current: 3.2, unit: '%', inverse: true },
  ];
  return h('div', { className: 'space-y-6' },
    h('div', null,
      h('h2', { className: 'mb-4 text-lg font-bold text-white' }, '\uC5D0\uC774\uC804\uD2B8 \uC0C1\uC138 \uC815\uBCF4'),
      h('div', { className: 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' },
        AGENT_DEFINITIONS.map(function (agent) {
          var perf = state.agentPerformances.find(function (p) { return p.agentId === agent.id; });
          return h(AgentCard, { key: agent.id, agent: agent, performance: perf });
        })
      )
    ),
    h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/30 p-6' },
      h('h2', { className: 'mb-4 text-lg font-bold text-white' }, '\uC2DC\uC2A4\uD15C \uC131\uACFC \uC9C0\uD45C'),
      h('div', { className: 'space-y-4' },
        PERF_TARGETS.map(function (metric) {
          var isGood = metric.inverse ? metric.current <= metric.target : metric.current >= metric.target;
          var pct = metric.inverse ? Math.max(0, 100 - (metric.current / metric.target) * 100 + 100) : (metric.current / 100) * 100;
          return h('div', { key: metric.label },
            h('div', { className: 'mb-1 flex items-center justify-between' },
              h('span', { className: 'text-sm text-gray-400' }, metric.label),
              h('div', { className: 'flex items-center gap-2' },
                h('span', { className: 'text-xs text-gray-500' }, '\uBAA9\uD45C: ' + metric.target + metric.unit + (metric.inverse ? ' \uC774\uD558' : ' \uC774\uC0C1')),
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
    { id: 'dashboard', label: '\uC2E4\uC2DC\uAC04 \uBAA8\uB2C8\uD130\uB9C1' },
    { id: 'scenarios', label: '\uC2DC\uB098\uB9AC\uC624 \uC2E4\uD589' },
    { id: 'agents', label: '\uC5D0\uC774\uC804\uD2B8 \uC0C1\uC138' },
  ];

  return h('div', { className: 'min-h-screen' },
    h('header', { className: 'border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm' },
      h('div', { className: 'mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3' },
        h('div', { className: 'flex items-center gap-4' },
          h('div', null,
            h('h1', { className: 'text-lg font-bold text-white' },
              h('span', { className: 'text-blue-400' }, 'MANSA'), ' \uCD95\uC0B0 AI \uC5D0\uC774\uC804\uD2B8 \uB370\uBAA8'),
            h('p', { className: 'text-xs text-gray-500' }, '\uC81C\uC77C\uCD95\uC0B0\uC601\uB18D\uC870\uD569\uBC95\uC778 1\uD638\uB3D9')
          ),
          h(RiskBadge, { level: riskLevel, size: 'lg' })
        ),
        h('div', { className: 'flex items-center gap-4' },
          h('div', { className: 'flex items-center gap-2 text-xs text-gray-400' },
            h('span', { className: 'inline-block h-2 w-2 rounded-full ' + (pipeline.isRunning ? 'animate-pulse bg-yellow-400' : 'bg-green-400') }),
            '\uC5D0\uC774\uC804\uD2B8 ' + runningCount + '/7 \uAC00\uB3D9 \uC911'
          ),
          h('div', { className: 'text-xs tabular-nums text-gray-500' }, timeRef.current)
        )
      )
    ),
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
  document.getElementById('root').innerHTML = '<div style="color:red;padding:20px"><h2>Error</h2><pre>' + e.message + '</pre></div>';
}
