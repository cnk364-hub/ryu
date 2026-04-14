// =============================================================================
// 가축 질병 조기경보 AI 에이전트 데모 - Standalone Frontend
// API 키 불필요. mock-data/responses.json을 직접 fetch하여 클라이언트에서
// 7-에이전트 파이프라인을 시뮬레이션합니다. CBR 유사 사례 30건을 시각화.
// =============================================================================

const { useState, useEffect, useMemo, useRef } = React;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENTS = [
  { id: 'context',         name: 'Context Agent',         nameKo: '상황인식',         color: '#3B82F6', tech: 'EIF (Extended Isolation Forest)' },
  { id: 'risk_trajectory', name: 'Risk Trajectory Agent', nameKo: '위험궤적분석',     color: '#F97316', tech: 'HMM (Hidden Markov Model)' },
  { id: 'planning',        name: 'Planning Agent',        nameKo: '대응계획',         color: '#8B5CF6', tech: 'CBR (Case-Based Reasoning)' },
  { id: 'execution',       name: 'Execution Agent',       nameKo: '조치실행',         color: '#22C55E', tech: '자동화 실행 엔진' },
  { id: 'monitoring',      name: 'Monitoring Agent',      nameKo: '관찰',             color: '#14B8A6', tech: '실시간 KPI 추적' },
  { id: 'recovery',        name: 'Recovery Agent',        nameKo: '수정복구',         color: '#EF4444', tech: 'Feedback Loop' },
  { id: 'orchestration',   name: 'Orchestration Agent',   nameKo: '오케스트레이션',   color: '#EAB308', tech: 'Multi-Agent Coordination' },
];

const SCENARIOS = [
  {
    id: 'disease_asf',
    title: 'ASF 질병 조기경보',
    desc: 'LiDAR 급이 센서 데이터에서 아프리카돼지열병(ASF) 의심 패턴을 감지하고 다중 AI 에이전트가 협력하여 긴급 대응합니다.',
    accent: '#EF4444',
    icon: '🐷',
  },
  {
    id: 'environment_heat',
    title: '고온 스트레스 환경경보',
    desc: '축사 내부 온도·습도 이상 상승으로 인한 열 스트레스 상황을 감지하고 환기 시스템 제어를 수행합니다.',
    accent: '#F59E0B',
    icon: '🌡️',
  },
  {
    id: 'shipment_optimization',
    title: '최적 출하시기 분석',
    desc: '사료 효율(FCR)과 성장 데이터를 분석하여 경제적으로 최적인 출하 시기를 결정합니다.',
    accent: '#3B82F6',
    icon: '🚚',
  },
];

const RISK_LABELS = {
  normal:    { ko: '정상',  bg: '#16A34A', text: 'text-green-300',  bgClass: 'bg-green-900/40 border-green-500/40' },
  caution:   { ko: '주의',  bg: '#EAB308', text: 'text-yellow-200', bgClass: 'bg-yellow-900/40 border-yellow-500/40' },
  danger:    { ko: '위험',  bg: '#F97316', text: 'text-orange-200', bgClass: 'bg-orange-900/40 border-orange-500/40' },
  emergency: { ko: '긴급',  bg: '#EF4444', text: 'text-red-200',    bgClass: 'bg-red-900/40 border-red-500/40' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSimilarity(text) {
  // "...사례 (유사도 87%)" 또는 "...사례 (수익률 +3.2%)" 패턴에서 숫자 추출
  const m = text.match(/(?:유사도|수익률\s*[+\-]?)\s*([\d.]+)\s*%/);
  if (m) return parseFloat(m[1]);
  return null;
}

function stripParen(text) {
  return text.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function similarityColor(score) {
  if (score === null) return '#6B7280';
  if (score >= 85) return '#22C55E';
  if (score >= 75) return '#3B82F6';
  if (score >= 65) return '#EAB308';
  return '#9CA3AF';
}

function nowKST() {
  return new Date().toLocaleString('ko-KR', { hour12: false });
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RiskBadge({ level }) {
  const cfg = RISK_LABELS[level] || RISK_LABELS.normal;
  const pulse = level === 'emergency';
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${cfg.bgClass} ${cfg.text} ${pulse ? 'agent-pulse' : ''}`}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cfg.bg }} />
      위험등급: {cfg.ko}
    </div>
  );
}

function ScenarioCard({ scenario, isActive, isRunning, onSelect }) {
  return (
    <button
      onClick={() => !isRunning && onSelect(scenario.id)}
      disabled={isRunning}
      className={`w-full rounded-xl border p-5 text-left transition-all ${
        isActive
          ? 'border-blue-500 bg-blue-950/40 shadow-lg shadow-blue-500/10'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800'
      } ${isRunning ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
          style={{ backgroundColor: scenario.accent + '22', border: `1px solid ${scenario.accent}66` }}
        >
          {scenario.icon}
        </div>
        <h3 className="text-base font-bold text-white">{scenario.title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-gray-400">{scenario.desc}</p>
      {isActive && isRunning && (
        <div className="mt-3 flex items-center gap-2 text-xs text-blue-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          7개 에이전트 실행 중...
        </div>
      )}
    </button>
  );
}

function ExecutionStepper({ currentAgent, completedAgents, durations }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-300">에이전트 실행 진행 상황</h3>
      <div className="space-y-1">
        {AGENTS.map((agent, idx) => {
          const isCompleted = completedAgents.includes(agent.id);
          const isCurrent = currentAgent === agent.id;
          const isPending = !isCompleted && !isCurrent;
          return (
            <div key={agent.id} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    isCompleted ? 'border-transparent text-white'
                    : isCurrent ? 'border-current bg-transparent agent-pulse'
                    : 'border-gray-600 bg-transparent text-gray-600'
                  }`}
                  style={
                    isCompleted ? { backgroundColor: agent.color }
                    : isCurrent ? { borderColor: agent.color, color: agent.color }
                    : undefined
                  }
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                {idx < AGENTS.length - 1 && (
                  <div className="h-4 w-0.5" style={{ backgroundColor: isCompleted ? agent.color : '#374151' }} />
                )}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${isPending ? 'text-gray-500' : 'text-white'}`}
                    style={isCurrent ? { color: agent.color } : undefined}
                  >
                    {idx + 1}. {agent.name} ({agent.nameKo})
                  </span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: agent.color }}>
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: agent.color }} />
                      처리 중...
                    </span>
                  )}
                  {isCompleted && durations[agent.id] != null && (
                    <span className="text-[10px] text-gray-500">{durations[agent.id]}ms</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{agent.tech}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CBRCasesPanel({ cases }) {
  const enriched = useMemo(
    () => cases.map((c, i) => ({
      idx: i + 1,
      raw: c,
      desc: stripParen(c),
      score: parseSimilarity(c),
    })),
    [cases]
  );

  const stats = useMemo(() => {
    const scored = enriched.filter((c) => c.score !== null);
    if (!scored.length) return { avg: 0, max: 0, min: 0, count: enriched.length };
    const scores = scored.map((c) => c.score);
    return {
      avg: (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1),
      max: Math.max(...scores),
      min: Math.min(...scores),
      count: enriched.length,
    };
  }, [enriched]);

  return (
    <div className="rounded-lg border border-purple-500/40 bg-purple-950/20 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-500/20 px-2 py-1 text-xs font-bold text-purple-300">CBR</span>
          <h3 className="text-base font-bold text-white">사례기반추론(CBR) 검색 결과</h3>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-gray-400">총 <strong className="text-white">{stats.count}</strong>건</span>
          <span className="text-gray-400">평균 <strong className="text-purple-300">{stats.avg}%</strong></span>
          <span className="text-gray-400">최고 <strong className="text-green-300">{stats.max}%</strong></span>
          <span className="text-gray-400">최저 <strong className="text-yellow-300">{stats.min}%</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {enriched.map((c) => (
          <div
            key={c.idx}
            className="flex items-start gap-2 rounded-md border border-gray-700/60 bg-gray-900/60 p-2.5 transition-colors hover:border-purple-500/50"
          >
            <span className="mt-0.5 inline-flex h-5 w-7 flex-shrink-0 items-center justify-center rounded text-[10px] font-mono text-gray-500">
              #{String(c.idx).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs leading-snug text-gray-200">{c.desc}</div>
              {c.score !== null && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.score}%`, backgroundColor: similarityColor(c.score) }}
                    />
                  </div>
                  <span
                    className="text-[10px] font-bold tabular-nums"
                    style={{ color: similarityColor(c.score) }}
                  >
                    {c.score}%
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentResultPanel({ agent, response }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: agent.color }}
        />
        <h4 className="text-sm font-bold text-white">
          {agent.name} <span className="text-gray-400">({agent.nameKo})</span>
        </h4>
        <span className="ml-auto rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300">{agent.tech}</span>
      </div>
      <pre className="max-h-64 overflow-auto rounded bg-gray-950/80 p-3 text-xs leading-relaxed text-gray-300">
        {JSON.stringify(response, null, 2)}
      </pre>
    </div>
  );
}

function FinalReport({ orchestration, riskLevel }) {
  if (!orchestration) return null;
  const cfg = RISK_LABELS[riskLevel] || RISK_LABELS.normal;
  return (
    <div className={`rounded-xl border-2 p-5 ${cfg.bgClass}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-2xl">📋</span>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">최종 의사결정 보고서</div>
          <h3 className="text-base font-bold text-white">{orchestration.final_decision}</h3>
        </div>
        <div className="ml-auto">
          <RiskBadge level={riskLevel} />
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs font-bold text-gray-400">▶ 농장주 메시지</div>
          <div className="rounded-md bg-gray-900/60 p-3 text-sm leading-relaxed text-gray-200">
            {orchestration.farmer_message}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-bold text-gray-400">▶ 수의사 통보</div>
          <div className="rounded-md bg-gray-900/60 p-3 text-sm leading-relaxed text-gray-200">
            {orchestration.vet_notification}
          </div>
        </div>
        {orchestration.trajectory_log_id && (
          <div className="text-[10px] font-mono text-gray-500">
            Trajectory Log ID: {orchestration.trajectory_log_id}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function App() {
  const [mockData, setMockData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [scenarioId, setScenarioId] = useState(null);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [completedAgents, setCompletedAgents] = useState([]);
  const [results, setResults] = useState({});      // { agentId: response }
  const [durations, setDurations] = useState({});  // { agentId: ms }
  const [riskLevel, setRiskLevel] = useState('normal');
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(nowKST());
  const cancelRef = useRef({ cancelled: false });

  // Load mock data on mount
  useEffect(() => {
    fetch('/mock-data/responses.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setMockData)
      .catch((e) => setLoadError(e.message));
  }, []);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(nowKST()), 1000);
    return () => clearInterval(t);
  }, []);

  function runScenario(id) {
    if (!mockData || !mockData[id]) return;
    cancelRef.current.cancelled = true;          // cancel any prior run
    cancelRef.current = { cancelled: false };
    const localCancel = cancelRef.current;

    setScenarioId(id);
    setIsRunning(true);
    setCurrentAgent(null);
    setCompletedAgents([]);
    setResults({});
    setDurations({});
    setRiskLevel('normal');

    const responses = mockData[id];

    // Sequentially "run" each agent with a randomized delay (1.0~2.2s)
    let chain = Promise.resolve();
    AGENTS.forEach((agent) => {
      chain = chain.then(() => new Promise((resolve) => {
        if (localCancel.cancelled) return resolve();
        setCurrentAgent(agent.id);
        const delay = 1000 + Math.random() * 1200;
        const start = Date.now();
        setTimeout(() => {
          if (localCancel.cancelled) return resolve();
          const dur = Date.now() - start;
          const resp = responses[agent.id] || {};
          setResults((prev) => ({ ...prev, [agent.id]: resp }));
          setDurations((prev) => ({ ...prev, [agent.id]: Math.round(dur) }));
          setCompletedAgents((prev) => [...prev, agent.id]);
          if (agent.id === 'orchestration' && resp.alert_level) {
            setRiskLevel(resp.alert_level);
          }
          resolve();
        }, delay);
      }));
    });

    chain.then(() => {
      if (!localCancel.cancelled) {
        setCurrentAgent(null);
        setIsRunning(false);
      }
    });
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <div className="rounded-lg border border-red-500 bg-red-950/30 p-6">
          <h2 className="mb-2 text-lg font-bold text-red-300">Mock 데이터 로드 실패</h2>
          <p className="text-sm text-red-200">/mock-data/responses.json: {loadError}</p>
          <p className="mt-3 text-xs text-gray-400">
            <code className="rounded bg-gray-800 px-1.5 py-0.5">node server.js</code> 로 서버를 실행했는지 확인하세요.
          </p>
        </div>
      </div>
    );
  }

  if (!mockData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="mb-2 text-3xl">⏳</div>
          <div className="text-sm">Mock 데이터 로딩 중...</div>
        </div>
      </div>
    );
  }

  const cfg = RISK_LABELS[riskLevel] || RISK_LABELS.normal;
  const borderClass =
    riskLevel === 'emergency' ? 'risk-emergency'
    : riskLevel === 'danger' ? 'risk-danger'
    : riskLevel === 'caution' ? 'risk-caution' : '';

  const planningResp = results.planning;
  const orchestrationResp = results.orchestration;
  const similarCases = (planningResp && planningResp.similar_cases) || [];

  return (
    <div className={`min-h-screen ${borderClass}`}>
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-white">
                <span className="text-blue-400">MANSA</span> 축산 AI 에이전트 데모
              </h1>
              <p className="text-xs text-gray-500">제일축산영농조합법인 1호동 · API 키 불필요 (Mock 모드)</p>
            </div>
            <RiskBadge level={riskLevel} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className={`inline-block h-2 w-2 rounded-full ${isRunning ? 'animate-pulse bg-yellow-400' : 'bg-green-400'}`} />
              {isRunning
                ? `에이전트 ${completedAgents.length + 1}/7 가동 중`
                : `에이전트 ${completedAgents.length}/7 완료`}
            </div>
            <div className="text-xs tabular-nums text-gray-500">{time}</div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-[1400px] space-y-6 p-4">
        {/* Scenario selection */}
        <section>
          <h2 className="mb-3 text-lg font-bold text-white">시나리오 선택</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {SCENARIOS.map((s) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                isActive={scenarioId === s.id}
                isRunning={isRunning}
                onSelect={runScenario}
              />
            ))}
          </div>
        </section>

        {scenarioId && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            {/* Stepper sidebar */}
            <aside>
              <ExecutionStepper
                currentAgent={currentAgent}
                completedAgents={completedAgents}
                durations={durations}
              />
            </aside>

            {/* Right column: results */}
            <section className="space-y-4">
              {/* CBR Panel - prominently displayed when planning completes */}
              {similarCases.length > 0 && (
                <CBRCasesPanel cases={similarCases} />
              )}

              {/* Final report */}
              {orchestrationResp && (
                <FinalReport orchestration={orchestrationResp} riskLevel={riskLevel} />
              )}

              {/* Per-agent raw results */}
              {completedAgents.length > 0 && (
                <details className="rounded-lg border border-gray-700 bg-gray-800/30 p-4" open={!orchestrationResp}>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-300">
                    에이전트별 원본 응답 보기 ({completedAgents.length}/7)
                  </summary>
                  <div className="mt-4 space-y-3">
                    {AGENTS.filter((a) => completedAgents.includes(a.id)).map((a) => (
                      <AgentResultPanel key={a.id} agent={a} response={results[a.id]} />
                    ))}
                  </div>
                </details>
              )}

              {/* Empty state */}
              {completedAgents.length === 0 && !isRunning && (
                <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/20 p-8 text-center text-sm text-gray-500">
                  시나리오를 선택하면 7개 에이전트가 순차적으로 실행됩니다.
                </div>
              )}
            </section>
          </div>
        )}

        {!scenarioId && (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/20 p-10 text-center">
            <div className="mb-3 text-4xl">🤖</div>
            <h3 className="mb-1 text-base font-bold text-white">시나리오를 선택하여 시작하세요</h3>
            <p className="text-sm text-gray-400">
              위 3개 시나리오 중 하나를 클릭하면 7개 AI 에이전트가 협업하여 분석을 진행합니다.<br />
              Planning Agent 단계에서 <strong className="text-purple-300">CBR 유사 사례 30건</strong>을 확인할 수 있습니다.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
