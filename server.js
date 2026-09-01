const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webp': 'image/webp',
};

// ─── Environment data per scenario ───────────────────────────────────────────
const ENVIRONMENT_DATA = {
  disease_asf: { temp: 22.5, humidity: 65, ammonia: 18, ventilation: 'normal' },
  environment_heat: { temp: 33.2, humidity: 82, ammonia: 25, ventilation: 'critical' },
  shipment_optimization: { temp: 21.0, humidity: 60, ammonia: 12, ventilation: 'normal' },
};

// ─── Mock agent responses ────────────────────────────────────────────────────
const AGENT_RESPONSES = {
  disease_asf: {
    context: {
      situation_summary: '최근 3일간 급이량이 기준 대비 35.2% 급감하여 ASF 감염 의심',
      risk_indicators: ['급이량 35% 급감', '3일 연속 하락', '야간 급이 75% 감소'],
      data_quality: 'good',
      timestamp: '2026-04-08T14:30:00+09:00',
    },
    risk_trajectory: {
      current_state: 'K3',
      transition_probabilities: { K1: 0.05, K2: 0.10, K3: 0.35, K4: 0.50 },
      risk_timeline_hours: 12,
      severity_score: 0.82,
    },
    planning: {
      action_plan: {
        immediate: ['의심 돈사 즉시 격리', '방역당국 즉시 신고', '긴급 소독 실시'],
        short_term: ['체온 측정 2회/일', '인접 돈사 모니터링'],
        preventive: ['전 두수 정밀 검사', '백신 접종 확인'],
      },
      similar_cases: ['2023년 충남 홍성 ASF (유사도 87%)'],
      confidence: 0.85,
    },
    execution: {
      checklist: [
        { priority: 'high', action: '1호동 출입문 폐쇄 및 격리', responsible: '농장 관리자', deadline: '30분 이내' },
        { priority: 'high', action: '방역기관 긴급 신고', responsible: '농장주', deadline: '1시간 이내' },
        { priority: 'high', action: '전 구역 긴급 소독', responsible: '방역 담당', deadline: '2시간 이내' },
        { priority: 'medium', action: '의심 개체 체온 측정', responsible: '수의사', deadline: '4시간 이내' },
      ],
      alert_message: '긴급: 1호동 ASF 의심. 즉시 격리 및 방역당국 신고 필요.',
      vet_required: true,
    },
    monitoring: {
      monitoring_metrics: ['급이량 회복률', '체온 변화 추이', '폐사율 변동', '타 돈사 이상 여부'],
      success_criteria: ['급이량 80% 회복', '신규 의심 개체 미발생'],
      recovery_trigger_conditions: ['48시간 내 미회복', '추가 의심 개체 발생'],
      next_check_hours: 6,
    },
    recovery: {
      effectiveness_score: 0.45,
      plan_adjustment_needed: true,
      alternative_strategies: ['전두수 긴급 PCR 검사', '이동제한 구역 확대', '비상 살처분 계획 수립'],
      escalation_required: true,
    },
    orchestration: {
      final_decision: 'ASF 의심 - 긴급 방역 조치',
      alert_level: 'emergency',
      farmer_message: '긴급: 1호동에서 ASF 의심 징후 감지. 급이량 35% 급감, 12시간 내 긴급 전환 확률 50%. 즉시 격리 및 방역당국 신고 필요.',
      vet_notification: '수의사 긴급 호출: 1호동 ASF 의심. 즉시 현장 방문 요청.',
      trajectory_log_id: 'TRJ-20260408-001',
    },
  },

  environment_heat: {
    context: {
      situation_summary: '축사 내부 온도 33.2°C, 습도 82%로 열 스트레스 위험 수준. 급이량은 정상이나 환경 스트레스 누적 중',
      risk_indicators: ['온도 33.2°C 초과', '습도 82% 고습', 'THI 위험 구간'],
      data_quality: 'good',
      timestamp: '2026-04-08T14:30:00+09:00',
    },
    risk_trajectory: {
      current_state: 'K2',
      transition_probabilities: { K1: 0.15, K2: 0.45, K3: 0.30, K4: 0.10 },
      risk_timeline_hours: 48,
      severity_score: 0.54,
    },
    planning: {
      action_plan: {
        immediate: ['환기 시스템 최대 가동', '쿨링 패드 작동', '음수량 확인'],
        short_term: ['사료 급이 시간 조정(새벽/야간)', '차광막 설치'],
        preventive: ['환기 시스템 점검', '폭염 대비 비상 계획'],
      },
      similar_cases: ['2024년 여름 폭염 사례 (유사도 78%)'],
      confidence: 0.80,
    },
    execution: {
      checklist: [
        { priority: 'high', action: '환기팬 100% 가동', responsible: '시설 관리자', deadline: '즉시' },
        { priority: 'high', action: '쿨링 패드 가동', responsible: '시설 관리자', deadline: '30분 이내' },
        { priority: 'medium', action: '급이 시간 변경(05시/21시)', responsible: '사양 관리자', deadline: '당일' },
      ],
      alert_message: '주의: 축사 온도 33.2°C. 환기 및 쿨링 시스템 즉시 가동.',
      vet_required: false,
    },
    monitoring: {
      monitoring_metrics: ['축사 내부 온도', '습도 변화', '음수량', '급이량 변화'],
      success_criteria: ['온도 28°C 이하 유지', '급이량 정상 유지'],
      recovery_trigger_conditions: ['온도 35°C 초과', '급이량 15% 이상 감소'],
      next_check_hours: 4,
    },
    recovery: {
      effectiveness_score: 0.72,
      plan_adjustment_needed: false,
      alternative_strategies: ['미스트 시스템 추가 가동', '사육 밀도 일시 조정'],
      escalation_required: false,
    },
    orchestration: {
      final_decision: '고온 스트레스 경보 - 환경 제어 강화',
      alert_level: 'caution',
      farmer_message: '주의: 축사 온도 33.2°C 위험 수준입니다. 환기 시스템 최대 가동 및 쿨링 패드를 작동시켜 주십시오. 72시간 이상 지속 시 생산성 저하 예상.',
      vet_notification: '참고: 고온 스트레스 상황 모니터링 중. 현재 수의 조치 불필요.',
      trajectory_log_id: 'TRJ-20260408-002',
    },
  },

  shipment_optimization: {
    context: {
      situation_summary: '평균 체중 112kg, 목표 115kg 도달 임박. FCR 3.1 최적 구간 유지, 출하 시기 분석 필요',
      risk_indicators: ['사료 가격 상승 추세', '도축장 예약 필요'],
      data_quality: 'good',
      timestamp: '2026-04-08T14:30:00+09:00',
    },
    risk_trajectory: {
      current_state: 'K1',
      transition_probabilities: { K1: 0.85, K2: 0.10, K3: 0.04, K4: 0.01 },
      risk_timeline_hours: 999,
      severity_score: 0.12,
    },
    planning: {
      action_plan: {
        immediate: ['도축장 4/12 예약 확인', '출하 차량 수배'],
        short_term: ['출하 전 건강검진 실시', '출하 동선 확인'],
        preventive: ['차기 입식 계획 수립', '축사 소독 계획'],
      },
      similar_cases: ['2025년 동절기 출하 최적화 (유사도 82%)'],
      confidence: 0.90,
    },
    execution: {
      checklist: [
        { priority: 'medium', action: '도축장 예약 (4/12)', responsible: '농장주', deadline: '3일 이내' },
        { priority: 'medium', action: '출하 차량 예약', responsible: '관리자', deadline: '2일 전' },
        { priority: 'low', action: '출하 전 건강검진', responsible: '수의사', deadline: '출하 전일' },
      ],
      alert_message: '안내: 최적 출하일 4월 12일. 도축장 예약을 권장합니다.',
      vet_required: false,
    },
    monitoring: {
      monitoring_metrics: ['일당증체량(ADG)', '사료요구율(FCR)', '평균 체중', '사료 가격 동향'],
      success_criteria: ['목표 체중 115kg 도달', 'FCR 3.2 이하 유지'],
      recovery_trigger_conditions: ['FCR 3.5 초과', '질병 발생'],
      next_check_hours: 24,
    },
    recovery: {
      effectiveness_score: 0.90,
      plan_adjustment_needed: false,
      alternative_strategies: ['출하일 1-2일 조정 가능', '분할 출하 검토'],
      escalation_required: false,
    },
    orchestration: {
      final_decision: '출하 최적화 - 4월 12일 출하 권고',
      alert_level: 'normal',
      farmer_message: '현재 평균 체중 112kg, 목표 도달까지 약 3.5일 소요. FCR 3.1로 최적 구간 유지 중. 4월 12일 출하가 경제적으로 최적입니다. 도축장 사전 예약을 권장합니다.',
      vet_notification: '참고: 출하 전 건강검진 일정 조율 필요.',
      trajectory_log_id: 'TRJ-20260408-003',
    },
  },
};

// ─── Agent definitions ───────────────────────────────────────────────────────
const AGENT_PIPELINE = [
  { id: 'context', name: 'Context Analysis Agent' },
  { id: 'risk_trajectory', name: 'Risk Trajectory Agent' },
  { id: 'planning', name: 'Planning Agent' },
  { id: 'execution', name: 'Execution Agent' },
  { id: 'monitoring', name: 'Monitoring Agent' },
  { id: 'recovery', name: 'Recovery Agent' },
  { id: 'orchestration', name: 'Orchestration Agent' },
];

// ─── Simulator: generate feeding data ────────────────────────────────────────
function generateFeedingData(scenario) {
  const rng = mulberry32(42);
  const days = 30;
  const startDate = new Date('2026-03-10');
  const data = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    let consumption;
    const noise = (rng() - 0.5) * 10; // +/- 5kg noise

    if (scenario === 'disease_asf') {
      if (i < 24) {
        consumption = 250 + noise;
      } else if (i < 27) {
        // Gradual decline days 24-26: 4%/day
        const declineFactor = 1 - 0.04 * (i - 23);
        consumption = (250 + noise) * declineFactor;
      } else {
        // Sharp decline days 27-29: 12%/day
        const gradualDecline = 1 - 0.04 * 3; // after 3 days of gradual
        const sharpDeclineFactor = gradualDecline * (1 - 0.12 * (i - 26));
        consumption = (250 + noise) * sharpDeclineFactor;
      }
    } else if (scenario === 'environment_heat') {
      if (i <= 20) {
        consumption = 250 + noise;
      } else {
        // Slight dip after day 20
        consumption = 250 + noise - (i - 20) * 2;
      }
    } else if (scenario === 'shipment_optimization') {
      // Stable upward trend
      consumption = 250 + 0.3 * i + noise;
    } else {
      consumption = 250 + noise;
    }

    consumption = Math.max(0, Math.round(consumption * 100) / 100);
    data.push({ date: dateStr, consumption_kg: consumption });
  }

  // Compute derived fields
  for (let i = 0; i < data.length; i++) {
    // 7-day moving average as normal_baseline
    const windowStart = Math.max(0, i - 6);
    const window = data.slice(windowStart, i + 1);
    const avg = window.reduce((s, d) => s + d.consumption_kg, 0) / window.length;
    data[i].normal_baseline = Math.round(avg * 100) / 100;

    // deviation_pct
    const baseline = data[i].normal_baseline;
    data[i].deviation_pct =
      baseline !== 0
        ? Math.round(((data[i].consumption_kg - baseline) / baseline) * 10000) / 100
        : 0;

    // slope: 3-point linear regression
    if (i >= 2) {
      const x = [-1, 0, 1];
      const y = [data[i - 2].consumption_kg, data[i - 1].consumption_kg, data[i].consumption_kg];
      const xMean = 0;
      const yMean = (y[0] + y[1] + y[2]) / 3;
      const num = x.reduce((s, xi, idx) => s + (xi - xMean) * (y[idx] - yMean), 0);
      const den = x.reduce((s, xi) => s + (xi - xMean) ** 2, 0);
      data[i].slope = Math.round((num / den) * 100) / 100;
    } else {
      data[i].slope = 0;
    }

    // volatility: 5-point coefficient of variation
    if (i >= 4) {
      const recent = data.slice(i - 4, i + 1).map((d) => d.consumption_kg);
      const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
      const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
      const std = Math.sqrt(variance);
      data[i].volatility = mean !== 0 ? Math.round((std / mean) * 10000) / 100 : 0;
    } else {
      data[i].volatility = 0;
    }

    // status based on deviation thresholds
    const absDev = Math.abs(data[i].deviation_pct);
    if (absDev >= 25) {
      data[i].status = 'emergency';
    } else if (absDev >= 15) {
      data[i].status = 'danger';
    } else if (absDev >= 8) {
      data[i].status = 'caution';
    } else {
      data[i].status = 'normal';
    }
  }

  return data;
}

// ─── Anomaly detection: z-score based ────────────────────────────────────────
function computeAnomalyScores(feedingData) {
  const values = feedingData.map((d) => d.consumption_kg);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  return feedingData.map((d) => {
    const zScore = std !== 0 ? Math.abs((d.consumption_kg - mean) / std) : 0;
    // Map z-score to 0-1 range using sigmoid-like scaling
    const score = Math.round(Math.min(1, zScore / 3) * 100) / 100;
    return {
      date: d.date,
      consumption_kg: d.consumption_kg,
      z_score: Math.round(zScore * 100) / 100,
      anomaly_score: score,
      isAnomaly: score > 0.6,
    };
  });
}

// ─── Parse URL query parameters ──────────────────────────────────────────────
function parseQuery(urlString) {
  const url = new URL(urlString, 'http://localhost');
  const params = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return { pathname: url.pathname, params };
}

// ─── Read request body ───────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ─── Send JSON response ─────────────────────────────────────────────────────
function sendJSON(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

// ─── Sleep utility ───────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── SSE agent pipeline handler ──────────────────────────────────────────────
async function handleAgentRun(req, res, body) {
  const scenario = body.scenario || 'disease_asf';

  if (!AGENT_RESPONSES[scenario]) {
    sendJSON(res, 400, { error: 'Invalid scenario. Use: disease_asf, environment_heat, shipment_optimization' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  const pipelineStart = Date.now();
  const rng = mulberry32(7);

  for (const agent of AGENT_PIPELINE) {
    // Send agent_start
    const startEvent = {
      type: 'agent_start',
      data: {
        agentId: agent.id,
        agentName: agent.name,
        timestamp: new Date().toISOString(),
      },
    };
    res.write(`data: ${JSON.stringify(startEvent)}\n\n`);

    // Simulate processing: 1.5 - 2.5 seconds
    const delay = 1500 + Math.floor(rng() * 1000);
    await sleep(delay);

    // Send agent_complete
    const completeEvent = {
      type: 'agent_complete',
      data: {
        agentId: agent.id,
        agentName: agent.name,
        response: AGENT_RESPONSES[scenario][agent.id],
        duration_ms: delay,
        timestamp: new Date().toISOString(),
      },
    };
    res.write(`data: ${JSON.stringify(completeEvent)}\n\n`);
  }

  // Send pipeline_complete
  const pipelineComplete = {
    type: 'pipeline_complete',
    data: {
      totalDuration: Date.now() - pipelineStart,
    },
  };
  res.write(`data: ${JSON.stringify(pipelineComplete)}\n\n`);

  res.end();
}

// ─── Serve static files ──────────────────────────────────────────────────────
function serveStaticFile(req, res, filePath) {
  // Prevent directory traversal
  const publicDir = path.join(__dirname, 'public');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(publicDir)) {
    sendJSON(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJSON(res, 404, { error: 'Not Found' });
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
    });

    const stream = fs.createReadStream(resolved);
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });
  });
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname, params } = parseQuery(req.url);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API: GET /api/simulator
  if (req.method === 'GET' && pathname === '/api/simulator') {
    const scenario = params.scenario || 'disease_asf';
    const validScenarios = ['disease_asf', 'environment_heat', 'shipment_optimization'];

    if (!validScenarios.includes(scenario)) {
      sendJSON(res, 400, {
        error: 'Invalid scenario. Use: disease_asf, environment_heat, shipment_optimization',
      });
      return;
    }

    const feedingData = generateFeedingData(scenario);
    const environmentData = ENVIRONMENT_DATA[scenario];
    const anomalyScores = computeAnomalyScores(feedingData);

    sendJSON(res, 200, { feedingData, environmentData, anomalyScores });
    return;
  }

  // API: POST /api/agents/run
  if (req.method === 'POST' && pathname === '/api/agents/run') {
    try {
      const body = await readBody(req);
      await handleAgentRun(req, res, body);
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid request body' });
    }
    return;
  }

  // Static file serving from ./public/
  let filePath = path.join(__dirname, 'public', pathname);

  // Default to index.html for directory requests
  if (pathname === '/' || pathname === '') {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

  serveStaticFile(req, res, filePath);
});

// ─── Start server ────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║     ██████╗ ██╗   ██╗██╗   ██╗                               ║
  ║     ██╔══██╗╚██╗ ██╔╝██║   ██║                               ║
  ║     ██████╔╝ ╚████╔╝ ██║   ██║                               ║
  ║     ██╔══██╗  ╚██╔╝  ██║   ██║                               ║
  ║     ██║  ██║   ██║   ╚██████╔╝                               ║
  ║     ╚═╝  ╚═╝   ╚═╝    ╚═════╝                                ║
  ║                                                              ║
  ║     Smart Livestock Management System                        ║
  ║     AI-Powered Multi-Agent Pipeline Server                   ║
  ║                                                              ║
  ╠══════════════════════════════════════════════════════════════╣
  ║                                                              ║
  ║     Server running on http://localhost:${PORT}                  ║
  ║     Static files:  ./public/                                 ║
  ║                                                              ║
  ║     API Endpoints:                                           ║
  ║       GET  /api/simulator?scenario=<name>                    ║
  ║       POST /api/agents/run  { scenario: <name> }             ║
  ║                                                              ║
  ║     Scenarios:                                               ║
  ║       - disease_asf                                          ║
  ║       - environment_heat                                     ║
  ║       - shipment_optimization                                ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝
  `);
});
