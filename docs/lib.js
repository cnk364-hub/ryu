// ===== Utility Functions =====
function getRiskColor(level) {
  switch (level) {
    case 'normal': return '#22C55E';
    case 'caution': return '#EAB308';
    case 'danger': return '#F97316';
    case 'emergency': return '#EF4444';
    default: return '#6B7280';
  }
}
function getRiskLabel(level) {
  switch (level) {
    case 'normal': return '정상';
    case 'caution': return '주의';
    case 'danger': return '위험';
    case 'emergency': return '긴급';
    default: return '알 수 없음';
  }
}
function getAgentColor(agentId) {
  switch (agentId) {
    case 'context': return '#3B82F6';
    case 'risk_trajectory': return '#F97316';
    case 'planning': return '#8B5CF6';
    case 'execution': return '#22C55E';
    case 'monitoring': return '#14B8A6';
    case 'recovery': return '#EF4444';
    case 'orchestration': return '#EAB308';
    default: return '#6B7280';
  }
}
function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}
function formatTimestamp(date) {
  var d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ===== Simulator (Seeded PRNG) =====
function mulberry32(seed) {
  return function () {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function arrMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
}
function arrStddev(arr) {
  if (arr.length < 2) return 0;
  var m = arrMean(arr);
  return Math.sqrt(arr.reduce(function (s, v) { return s + Math.pow(v - m, 2); }, 0) / arr.length);
}
function regressionSlope(vals) {
  var n = vals.length;
  if (n < 2) return 0;
  var xm = (n - 1) / 2, ym = arrMean(vals), num = 0, den = 0;
  for (var i = 0; i < n; i++) { num += (i - xm) * (vals[i] - ym); den += Math.pow(i - xm, 2); }
  return den === 0 ? 0 : num / den;
}
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function statusFromDev(dev) {
  if (dev > -10) return 'normal';
  if (dev > -20) return 'caution';
  if (dev > -30) return 'danger';
  return 'emergency';
}

function generateFeedingData(scenario, days) {
  days = days || 30;
  var seed = scenario === 'disease_asf' ? 42 : scenario === 'environment_heat' ? 84 : 126;
  var rng = mulberry32(seed), base = 250, noise = 10, raw = [];
  for (var i = 0; i < days; i++) {
    var c;
    if (scenario === 'disease_asf') {
      if (i < 24) c = base + (rng() - 0.5) * 2 * noise;
      else if (i < 27) c = base * (1 - (i - 23) * 0.04) + (rng() - 0.5) * 2 * noise * 0.8;
      else c = base * (1 - (i - 26) * 0.12) + (rng() - 0.5) * 2 * noise * 0.5;
    } else if (scenario === 'environment_heat') {
      var heat = i >= 20 ? (i - 19) * 1.5 : 0;
      c = base - heat + (rng() - 0.5) * 2 * noise;
    } else {
      c = base + i * 0.3 + (rng() - 0.5) * 2 * noise * 0.7;
    }
    raw.push(Math.max(50, Math.round(c * 10) / 10));
  }
  var result = [], startDate = new Date('2026-03-10');
  for (var i = 0; i < days; i++) {
    var date = new Date(startDate); date.setDate(startDate.getDate() + i);
    var consumption = raw[i];
    var w = raw.slice(Math.max(0, i - 6), i + 1);
    var baseline = Math.round(arrMean(w) * 10) / 10;
    var dev_pct = baseline === 0 ? 0 : Math.round(((consumption - baseline) / baseline) * 100 * 10) / 10;
    var sw = raw.slice(Math.max(0, i - 2), i + 1);
    var slope = Math.round(regressionSlope(sw) * 100) / 100;
    var vw = raw.slice(Math.max(0, i - 4), i + 1);
    var vm = arrMean(vw);
    var volatility = vm === 0 ? 0 : Math.round((arrStddev(vw) / vm) * 1000) / 1000;
    result.push({ date: fmtDate(date), consumption_kg: consumption, normal_baseline: baseline, deviation_pct: dev_pct, slope: slope, volatility: volatility, status: statusFromDev(dev_pct) });
  }
  return result;
}

// ===== EIF Anomaly Detection =====
function detectAnomalies(data, threshold) {
  threshold = threshold || 0.6;
  if (!data.length) return [];
  var devs = data.map(function (d) { return d.deviation_pct; });
  var gm = arrMean(devs), gs = arrStddev(devs) || 1;
  return data.map(function (p, i) {
    var zDev = -(p.deviation_pct - gm) / gs;
    var slopeFactor = -p.slope / 5;
    var volFactor = p.volatility / 0.1;
    var raw = 0.60 * zDev + 0.25 * slopeFactor + 0.15 * volFactor;
    var score = Math.round((1 / (1 + Math.exp(-(1.8 * raw - 1.0)))) * 1000) / 1000;
    score = Math.max(0, Math.min(1, score));
    return { index: i, score: score, isAnomaly: score > threshold };
  });
}

// ===== Agent & Scenario Definitions =====
var AGENT_DEFINITIONS = [
  { id: 'context', name: 'Context Agent', nameKo: '상황인식 에이전트', technology: 'EIF (Extended Isolation Forest) 이상탐지', color: '#3B82F6' },
  { id: 'risk_trajectory', name: 'Risk Trajectory Agent', nameKo: '위험궤적분석 에이전트', technology: 'HMM (Hidden Markov Model) 상태전이', color: '#F97316' },
  { id: 'planning', name: 'Planning Agent', nameKo: '대응계획 에이전트', technology: 'CBR (Case-Based Reasoning) 사례기반추론', color: '#8B5CF6' },
  { id: 'execution', name: 'Execution Agent', nameKo: '실행관리 에이전트', technology: '자동화 실행 엔진', color: '#22C55E' },
  { id: 'monitoring', name: 'Monitoring Agent', nameKo: '모니터링 에이전트', technology: '실시간 KPI 추적 엔진', color: '#14B8A6' },
  { id: 'recovery', name: 'Recovery Agent', nameKo: '복구관리 에이전트', technology: '복구 시뮬레이션 엔진', color: '#EF4444' },
  { id: 'orchestration', name: 'Orchestration Agent', nameKo: '오케스트레이션 에이전트', technology: 'Multi-Agent 오케스트레이션', color: '#EAB308' },
];

var SCENARIOS = [
  {
    id: 'disease_asf', title: 'ASF 질병 조기경보',
    description: 'LiDAR 급이 센서 데이터에서 아프리카돼지열병(ASF) 의심 패턴을 감지하고 다중 에이전트가 협력하여 대응합니다.',
    details: ['최근 3일간 급이량 35% 급감 감지', 'EIF 이상탐지 알고리즘으로 이상 패턴 확인', 'HMM 상태전이 모델로 K3(위험) 상태 판정', '방역 당국 신고 및 이동제한 조치 권고']
  },
  {
    id: 'environment_heat', title: '고온 스트레스 환경경보',
    description: '축사 내부 온도·습도 이상 상승으로 인한 열 스트레스 상황을 감지하고 환경 제어 대응을 수행합니다.',
    details: ['축사 내부 온도 32°C 이상, 습도 80% 이상 감지', 'THI(온습도지수) 위험 구간 진입', '환기 시스템 가동률 100%로 상향 권고', '72시간 이내 폭염 지속 시 생산성 저하 예상']
  },
  {
    id: 'shipment_optimization', title: '최적 출하시기 분석',
    description: '사료 효율(FCR)과 성장 데이터를 분석하여 경제적으로 최적인 출하 시기를 결정합니다.',
    details: ['현재 평균 체중 112kg, 목표 체중 115kg 도달 임박', 'FCR(사료요구율) 3.1로 경제적 효율 구간 유지', '사료 가격 상승 추세 반영 시 조기 출하 유리', '도축장 예약 가능 일정 확인 및 최적일 산출']
  },
];

var AGENT_NAMES = {
  context: 'Context Agent (상황인식)',
  risk_trajectory: 'Risk Trajectory Agent (위험궤적분석)',
  planning: 'Planning Agent (대응계획)',
  execution: 'Execution Agent (조치실행)',
  monitoring: 'Monitoring Agent (관찰)',
  recovery: 'Recovery Agent (수정복구)',
  orchestration: 'Orchestration Agent (협업오케스트레이션)',
};

// ===== Simple State Store =====
var AppStateContext = React.createContext();

function useAppState() {
  return React.useContext(AppStateContext);
}

function AppStateProvider(props) {
  var _s = React.useState({
    feedingData: [],
    metrics: { feedingChangeRate: 0, anomalyDays: 0, estimatedRiskHours: 0, riskLevel: 'normal' },
    pipeline: { isRunning: false, currentAgent: null, completedAgents: [], results: [], scenario: null },
    logs: [],
    activeTab: 'dashboard',
    riskLevel: 'normal',
    agentPerformances: [],
    recommendation: '',
  });
  var state = _s[0], setState = _s[1];

  var actions = React.useMemo(function () {
    return {
      update: function (partial) { setState(function (prev) { return Object.assign({}, prev, partial); }); },
      setActiveTab: function (tab) { setState(function (prev) { return Object.assign({}, prev, { activeTab: tab }); }); },
      startPipeline: function (scenario) {
        setState(function (prev) {
          return Object.assign({}, prev, {
            pipeline: { isRunning: true, currentAgent: null, completedAgents: [], results: [], scenario: scenario }
          });
        });
      },
      setCurrentAgent: function (agentId) {
        setState(function (prev) {
          return Object.assign({}, prev, { pipeline: Object.assign({}, prev.pipeline, { currentAgent: agentId }) });
        });
      },
      completeAgent: function (agentId, result) {
        setState(function (prev) {
          return Object.assign({}, prev, {
            pipeline: Object.assign({}, prev.pipeline, {
              completedAgents: prev.pipeline.completedAgents.concat([agentId]),
              results: prev.pipeline.results.concat([result]),
            })
          });
        });
      },
      addLog: function (entry) {
        setState(function (prev) { return Object.assign({}, prev, { logs: prev.logs.concat([entry]) }); });
      },
      updateLog: function (id, updates) {
        setState(function (prev) {
          return Object.assign({}, prev, {
            logs: prev.logs.map(function (e) { return e.id === id ? Object.assign({}, e, updates) : e; })
          });
        });
      },
      completePipeline: function () {
        setState(function (prev) {
          return Object.assign({}, prev, { pipeline: Object.assign({}, prev.pipeline, { isRunning: false, currentAgent: null }) });
        });
      },
      updateAgentPerf: function (perf) {
        setState(function (prev) {
          var idx = prev.agentPerformances.findIndex(function (p) { return p.agentId === perf.agentId; });
          var arr = prev.agentPerformances.slice();
          if (idx >= 0) arr[idx] = perf; else arr.push(perf);
          return Object.assign({}, prev, { agentPerformances: arr });
        });
      },
    };
  }, []);

  return React.createElement(AppStateContext.Provider, { value: { state: state, actions: actions } }, props.children);
}
