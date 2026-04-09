// ===== Components =====
var h = React.createElement;
var LineChart = Recharts.LineChart, Line = Recharts.Line, XAxis = Recharts.XAxis, YAxis = Recharts.YAxis,
    CartesianGrid = Recharts.CartesianGrid, Tooltip = Recharts.Tooltip, ResponsiveContainer = Recharts.ResponsiveContainer,
    ReferenceLine = Recharts.ReferenceLine, Legend = Recharts.Legend;

// ----- RiskBadge -----
function RiskBadge(props) {
  var level = props.level, size = props.size || 'md';
  var color = getRiskColor(level), label = getRiskLabel(level);
  var cls = size === 'sm' ? 'px-2 py-0.5 text-xs' : size === 'lg' ? 'px-4 py-1.5 text-base font-semibold' : 'px-3 py-1 text-sm';
  return h('span', {
    className: 'inline-flex items-center rounded-full font-medium ' + cls + (level === 'emergency' ? ' animate-pulse' : ''),
    style: { backgroundColor: color + '20', color: color, border: '1px solid ' + color + '40' }
  },
    h('span', { className: 'mr-1.5 h-2 w-2 rounded-full inline-block' + (level === 'emergency' ? ' animate-ping' : ''), style: { backgroundColor: color } }),
    label
  );
}

// ----- MetricCard -----
function MetricCard(props) {
  var title = props.title, value = props.value, unit = props.unit, description = props.description, trend = props.trend, alert = props.alert;
  var trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
  var trendColor = trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400' : 'text-gray-400';
  return h('div', { className: 'rounded-lg border p-4 transition-all ' + (alert ? 'border-red-500/50 bg-red-950/20 shadow-lg shadow-red-500/10' : 'border-gray-700 bg-gray-800/50') },
    h('div', { className: 'mb-1 text-xs font-medium uppercase tracking-wider text-gray-400' }, title),
    h('div', { className: 'flex items-baseline gap-1' },
      h('span', { className: 'text-2xl font-bold ' + (alert ? 'text-red-400' : 'text-white') },
        typeof value === 'number' ? value.toFixed(1) : value),
      h('span', { className: 'text-sm text-gray-400' }, unit),
      trend && h('span', { className: 'ml-2 text-sm font-medium ' + trendColor }, trendIcon)
    ),
    description && h('div', { className: 'mt-1 text-xs text-gray-500' }, description)
  );
}

// ----- RecommendationBox -----
function RecommendationBox(props) {
  var text = props.text, riskLevel = props.riskLevel;
  var bc = riskLevel === 'emergency' ? 'border-red-500' : riskLevel === 'danger' ? 'border-orange-500' : riskLevel === 'caution' ? 'border-yellow-500' : 'border-gray-600';
  return h('div', { className: 'rounded-lg border-l-4 ' + bc + ' bg-gray-800/50 p-4' },
    h('div', { className: 'mb-2 flex items-center gap-2 text-sm font-semibold text-gray-300' },
      h('svg', { className: 'h-4 w-4', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' },
        h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' })
      ),
      'AI \uC870\uCE58 \uAD8C\uACE0\uC548'
    ),
    h('div', { className: 'whitespace-pre-wrap text-sm leading-relaxed text-gray-300' },
      text || '\uC2DC\uB098\uB9AC\uC624\uB97C \uC2E4\uD589\uD558\uBA74 AI \uC5D0\uC774\uC804\uD2B8\uC758 \uBD84\uC11D \uACB0\uACFC\uAC00 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.')
  );
}

// ----- FeedingPatternChart -----
function FeedingPatternChart(props) {
  var data = props.data, anomalyIndices = props.anomalyIndices || [];
  var chartData = data.map(function (d, i) {
    return Object.assign({}, d, { dateLabel: d.date.slice(5), isAnomaly: anomalyIndices.includes(i) });
  });
  var anomalyDates = anomalyIndices.filter(function (i) { return i < data.length; }).map(function (i) { return data[i].date.slice(5); });

  return h('div', { style: { width: '100%', height: 320 } },
    h(ResponsiveContainer, { width: '100%', height: '100%' },
      h(LineChart, { data: chartData, margin: { top: 10, right: 30, left: 0, bottom: 0 } },
        h(CartesianGrid, { strokeDasharray: '3 3', stroke: '#374151' }),
        h(XAxis, { dataKey: 'dateLabel', stroke: '#9CA3AF', fontSize: 11, tickLine: false }),
        h(YAxis, { stroke: '#9CA3AF', fontSize: 11, tickLine: false, domain: ['auto', 'auto'],
          label: { value: 'kg', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 11 } }),
        h(Tooltip, {
          contentStyle: { backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' },
          labelStyle: { color: '#9CA3AF' },
          formatter: function (value, name) {
            var label = name === 'consumption_kg' ? '실제 급이량' : '정상 기준선';
            return [Number(value).toFixed(1) + ' kg', label];
          }
        }),
        h(Legend, { formatter: function (v) { return v === 'consumption_kg' ? '실제 측정값' : '정상 기준선 (이동평균)'; }, wrapperStyle: { fontSize: '12px' } }),
        anomalyDates.map(function (date, i) {
          return h(ReferenceLine, { key: 'ref-' + i, x: date, stroke: '#EF4444', strokeDasharray: '3 3' });
        }),
        h(Line, { type: 'monotone', dataKey: 'normal_baseline', stroke: '#3B82F6', strokeWidth: 2, dot: false, strokeDasharray: '5 5' }),
        h(Line, { type: 'monotone', dataKey: 'consumption_kg', stroke: '#EF4444', strokeWidth: 2, activeDot: { r: 6 },
          dot: function (dotProps) {
            var cx = dotProps.cx, cy = dotProps.cy, index = dotProps.index;
            if (anomalyIndices.includes(index)) {
              return h('circle', { key: index, cx: cx, cy: cy, r: 5, fill: '#EF4444', stroke: '#FCA5A5', strokeWidth: 2 });
            }
            return h('circle', { key: index, cx: cx, cy: cy, r: 2, fill: '#EF4444' });
          }
        })
      )
    )
  );
}

// ----- AgentLoopVisual (SVG circle) -----
function AgentLoopVisual(props) {
  var currentAgent = props.currentAgent, completedAgents = props.completedAgents || [];
  var agents = [
    { id: 'context', label: '상황인식', shortLabel: 'CTX' },
    { id: 'risk_trajectory', label: '위험궤적', shortLabel: 'RSK' },
    { id: 'planning', label: '대응계획', shortLabel: 'PLN' },
    { id: 'execution', label: '조치실행', shortLabel: 'EXE' },
    { id: 'monitoring', label: '관찰', shortLabel: 'MON' },
    { id: 'recovery', label: '수정복구', shortLabel: 'RCV' },
    { id: 'orchestration', label: '오케스트레이션', shortLabel: 'ORC' },
  ];
  var cx = 120, cy = 120, radius = 85, nr = 24;

  var lines = agents.map(function (agent, i) {
    var nextI = (i + 1) % agents.length;
    var a1 = (i * 360) / agents.length - 90, a2 = (nextI * 360) / agents.length - 90;
    var x1 = cx + radius * Math.cos(a1 * Math.PI / 180), y1 = cy + radius * Math.sin(a1 * Math.PI / 180);
    var x2 = cx + radius * Math.cos(a2 * Math.PI / 180), y2 = cy + radius * Math.sin(a2 * Math.PI / 180);
    var isActive = currentAgent === agent.id || (completedAgents.includes(agent.id) && (currentAgent === agents[nextI].id || completedAgents.includes(agents[nextI].id)));
    return h('line', { key: 'l' + i, x1: x1, y1: y1, x2: x2, y2: y2, stroke: isActive ? getAgentColor(agent.id) : '#374151', strokeWidth: isActive ? 2 : 1, strokeDasharray: isActive ? undefined : '4 4', opacity: isActive ? 1 : 0.4 });
  });

  var nodes = agents.map(function (agent, i) {
    var angle = (i * 360) / agents.length - 90;
    var x = cx + radius * Math.cos(angle * Math.PI / 180), y = cy + radius * Math.sin(angle * Math.PI / 180);
    var color = getAgentColor(agent.id);
    var isActive = currentAgent === agent.id, isCompleted = completedAgents.includes(agent.id);
    return h('g', { key: agent.id },
      isActive && h('circle', { cx: x, cy: y, r: nr + 6, fill: 'none', stroke: color, strokeWidth: 2, opacity: 0.5,
        children: [
          h('animate', { key: 'ar', attributeName: 'r', from: String(nr + 2), to: String(nr + 12), dur: '1.5s', repeatCount: 'indefinite' }),
          h('animate', { key: 'ao', attributeName: 'opacity', from: '0.6', to: '0', dur: '1.5s', repeatCount: 'indefinite' }),
        ]
      }),
      h('circle', { cx: x, cy: y, r: nr,
        fill: (isActive || isCompleted) ? color + '30' : '#1F2937',
        stroke: isActive ? color : isCompleted ? color : '#4B5563',
        strokeWidth: isActive ? 3 : isCompleted ? 2 : 1
      }),
      isCompleted && !isActive && h('text', { x: x, y: y - 4, textAnchor: 'middle', fill: color, fontSize: 14, fontWeight: 'bold' }, '\u2713'),
      h('text', { x: x, y: isCompleted && !isActive ? y + 10 : y + 1, textAnchor: 'middle', dominantBaseline: 'middle', fill: (isActive || isCompleted) ? color : '#9CA3AF', fontSize: 9, fontWeight: isActive ? 'bold' : 'normal' }, agent.shortLabel),
      h('text', { x: x, y: y + nr + 12, textAnchor: 'middle', fill: isActive ? color : '#6B7280', fontSize: 8 }, agent.label)
    );
  });

  return h('div', { className: 'flex items-center justify-center' },
    h('svg', { width: 240, height: 240, viewBox: '0 0 240 240' },
      lines,
      nodes,
      h('text', { x: cx, y: cy - 6, textAnchor: 'middle', fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }, 'Agentic'),
      h('text', { x: cx, y: cy + 8, textAnchor: 'middle', fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }, 'Loop')
    )
  );
}

// ----- AgentLogTimeline -----
function AgentLogTimeline(props) {
  var logs = props.logs || [], maxHeight = props.maxHeight || '400px';
  var sorted = logs.slice().reverse();
  return h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/30' },
    h('div', { className: 'border-b border-gray-700 px-4 py-2' },
      h('h3', { className: 'text-sm font-semibold text-gray-300' }, '에이전트 실행 로그')),
    h('div', { className: 'overflow-y-auto p-2', style: { maxHeight: maxHeight } },
      sorted.length === 0
        ? h('div', { className: 'py-8 text-center text-sm text-gray-500' }, '시나리오를 실행하면 에이전트 로그가 여기에 표시됩니다.')
        : h('div', { className: 'space-y-2' },
          sorted.map(function (log) {
            var color = getAgentColor(log.agentId);
            return h('div', { key: log.id, className: 'rounded-md border border-gray-700/50 bg-gray-900/50 p-3', style: { borderLeftColor: color, borderLeftWidth: '3px' } },
              h('div', { className: 'mb-1 flex items-center justify-between' },
                h('div', { className: 'flex items-center gap-2' },
                  h('span', { className: 'inline-block h-2 w-2 rounded-full', style: { backgroundColor: color } }),
                  h('span', { className: 'text-xs font-semibold', style: { color: color } }, log.agentName),
                  log.status === 'running' && h('span', { className: 'flex items-center gap-1 text-xs text-yellow-400' },
                    h('span', { className: 'inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400' }), '실행 중...')
                ),
                h('div', { className: 'flex items-center gap-2 text-[10px] text-gray-500' },
                  log.duration_ms > 0 && h('span', null, formatDuration(log.duration_ms)),
                  h('span', null, formatTimestamp(log.timestamp))
                )
              ),
              h('div', { className: 'text-xs leading-relaxed text-gray-400' },
                log.content.length > 200 ? log.content.slice(0, 200) + '...' : log.content)
            );
          })
        )
    )
  );
}

// ----- ScenarioCard -----
function ScenarioCard(props) {
  var scenario = props.scenario, isActive = props.isActive, isRunning = props.isRunning, onSelect = props.onSelect;
  return h('button', {
    onClick: function () { if (!isRunning) onSelect(scenario.id); },
    disabled: isRunning,
    className: 'w-full rounded-xl border p-5 text-left transition-all ' +
      (isActive ? 'border-blue-500 bg-blue-950/30 shadow-lg shadow-blue-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800') +
      (isRunning ? ' cursor-not-allowed opacity-60' : ' cursor-pointer')
  },
    h('div', { className: 'mb-3' },
      h('h3', { className: 'text-base font-bold text-white' }, scenario.title)),
    h('p', { className: 'mb-3 text-sm leading-relaxed text-gray-400' }, scenario.description),
    h('div', { className: 'space-y-1' },
      scenario.details.map(function (detail, i) {
        return h('div', { key: i, className: 'flex items-start gap-2 text-xs text-gray-500' },
          h('span', { className: 'mt-0.5 text-gray-600' }, '\u2022'),
          h('span', null, detail));
      })
    ),
    isActive && isRunning && h('div', { className: 'mt-3 flex items-center gap-2 text-xs text-blue-400' },
      h('span', { className: 'inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400' }), '에이전트 실행 중...')
  );
}

// ----- ExecutionStepper -----
function ExecutionStepper(props) {
  var currentAgent = props.currentAgent, completedAgents = props.completedAgents || [], durations = props.durations || {};
  var steps = [
    { id: 'context', label: '데이터 수집 & Context 분석', desc: 'LiDAR 급이 데이터 분석 및 상황 파악' },
    { id: 'risk_trajectory', label: '위험 궤적 분석', desc: 'HMM 기반 위험 상태 전이 분석' },
    { id: 'planning', label: '대응 계획 수립', desc: 'CBR 기반 최적 대응 계획 생성' },
    { id: 'execution', label: '조치 실행', desc: '실행 가능한 체크리스트 생성' },
    { id: 'monitoring', label: '모니터링 설정', desc: '모니터링 기준 및 성공 지표 설정' },
    { id: 'recovery', label: '효과 평가', desc: '조치 효과 평가 및 대안 전략' },
    { id: 'orchestration', label: '최종 보고', desc: '종합 의사결정 보고서 생성' },
  ];
  return h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/30 p-4' },
    h('h3', { className: 'mb-4 text-sm font-semibold text-gray-300' }, '에이전트 실행 진행 상황'),
    h('div', { className: 'space-y-1' },
      steps.map(function (step, index) {
        var isCompleted = completedAgents.includes(step.id);
        var isCurrent = currentAgent === step.id;
        var isPending = !isCompleted && !isCurrent;
        var color = getAgentColor(step.id);
        return h('div', { key: step.id, className: 'flex items-center gap-3' },
          h('div', { className: 'flex flex-col items-center' },
            h('div', {
              className: 'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold ' +
                (isCompleted ? 'border-transparent text-white' : isCurrent ? 'border-current bg-transparent' : 'border-gray-600 bg-transparent text-gray-600'),
              style: isCompleted ? { backgroundColor: color } : isCurrent ? { borderColor: color, color: color } : undefined
            }, isCompleted ? '\u2713' : index + 1),
            index < steps.length - 1 && h('div', { className: 'h-4 w-0.5', style: { backgroundColor: isCompleted ? color : '#4B5563' } })
          ),
          h('div', { className: 'flex-1 pb-3' },
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'text-sm font-medium ' + (isPending ? 'text-gray-500' : 'text-white'), style: isCurrent ? { color: color } : undefined }, step.label),
              isCurrent && h('span', { className: 'flex items-center gap-1 text-xs', style: { color: color } },
                h('span', { className: 'inline-block h-1.5 w-1.5 animate-pulse rounded-full', style: { backgroundColor: color } }), '처리 중...'),
              isCompleted && durations[step.id] && h('span', { className: 'text-[10px] text-gray-500' }, formatDuration(durations[step.id]))
            ),
            h('div', { className: 'text-xs text-gray-500' }, step.desc)
          )
        );
      })
    )
  );
}

// ----- AgentCard -----
function AgentCard(props) {
  var agent = props.agent, performance = props.performance;
  var color = getAgentColor(agent.id);
  return h('div', { className: 'rounded-lg border border-gray-700 bg-gray-800/50 p-4 transition-all hover:border-gray-600', style: { borderTopColor: color, borderTopWidth: '3px' } },
    h('div', { className: 'mb-3 flex items-center gap-3' },
      h('div', { className: 'flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold', style: { backgroundColor: color + '20', color: color } }, agent.nameKo.charAt(0)),
      h('div', null,
        h('h3', { className: 'text-sm font-bold text-white' }, agent.name),
        h('p', { className: 'text-xs text-gray-400' }, agent.nameKo))
    ),
    h('div', { className: 'mb-3 text-xs text-gray-400' },
      h('span', { className: 'inline-block rounded bg-gray-700/50 px-2 py-0.5 text-gray-300' }, agent.technology)),
    performance && h('div', { className: 'space-y-2 border-t border-gray-700 pt-3' },
      h('div', { className: 'flex justify-between text-xs' }, h('span', { className: 'text-gray-500' }, '실행 횟수'), h('span', { className: 'text-gray-300' }, performance.executionCount + '회')),
      h('div', { className: 'flex justify-between text-xs' }, h('span', { className: 'text-gray-500' }, '평균 응답시간'), h('span', { className: 'text-gray-300' }, formatDuration(performance.avgResponseTime))),
      performance.lastDecision && h('div', { className: 'mt-2 rounded bg-gray-900/50 p-2' },
        h('div', { className: 'mb-1 text-[10px] font-medium text-gray-500' }, '최근 판단'),
        h('div', { className: 'text-xs leading-relaxed text-gray-400' }, performance.lastDecision.length > 150 ? performance.lastDecision.slice(0, 150) + '...' : performance.lastDecision))
    )
  );
}
