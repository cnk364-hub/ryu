const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Load mock responses
const mockResponses = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mock-data', 'responses.json'), 'utf-8')
);

// Load simulator data
const simulator = require('./mock-data/simulator.js');

// Load AI Agents (실제 AI 에이전트)
const { ContextAgent } = require('./agents/context/index.js');
const { RiskTrajectoryAgent } = require('./agents/risk-trajectory/index.js');
const { PlanningAgent } = require('./agents/planning/index.js');
const { ExecutionAgent } = require('./agents/execution/index.js');
const { MonitoringAgent } = require('./agents/monitoring/index.js');
const { RecoveryAgent } = require('./agents/recovery/index.js');

const contextAgent = new ContextAgent({ anomalyThreshold: 0.6 });
const riskAgent = new RiskTrajectoryAgent({ predictionHorizon: 7 });
const planningAgent = new PlanningAgent();
const executionAgent = new ExecutionAgent();
const monitoringAgent = new MonitoringAgent();
const recoveryAgent = new RecoveryAgent();

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API: Context Agent 실제 분석
  if (url.pathname === '/api/agents/context' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const scenario = parsed.scenario || 'disease_asf';

        const feedingData = simulator.generateFeedingData(scenario);
        const envData = simulator.generateEnvironmentData(scenario);

        // 정상 기간 데이터로 학습
        const normalData = feedingData.slice(0, 24);
        if (normalData.length >= 7) {
          contextAgent.train(normalData);
        }

        // 분석 실행
        const result = await contextAgent.analyze({
          feedingData: feedingData,
          environmentData: envData,
          farmInfo: parsed.farmInfo || { name: '제일축산 1호동', type: 'pig' },
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Risk Trajectory Agent 분석
  if (url.pathname === '/api/agents/risk-trajectory' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const scenario = parsed.scenario || 'disease_asf';
        const feedingData = simulator.generateFeedingData(scenario);
        const { anomalyScores } = simulator.generateData(scenario);
        const scores = anomalyScores.map(a => a.score);

        const result = await riskAgent.analyze({
          anomalyScores: scores,
          feedingData: feedingData,
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Simulator data
  if (url.pathname === '/api/simulator' && req.method === 'GET') {
    const scenario = url.searchParams.get('scenario') || 'disease_asf';
    const data = simulator.generateData(scenario);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
    return;
  }

  // API: Agent pipeline (SSE) — 실제 AI 에이전트 실행
  if (url.pathname === '/api/agents/run' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const scenario = parsed.scenario || 'disease_asf';

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const pipelineStart = Date.now();

      // 데이터 준비
      const feedingData = simulator.generateFeedingData(scenario);
      const envData = simulator.generateEnvironmentData(scenario);
      const farmInfo = { name: '제일축산영농조합법인 1호동', type: 'pig' };
      const livestockInfo = { breed: 'LYD', headCount: 120, avgWeight: 95, avgAge: 150, recentMortality: 0.3 };

      // 학습
      const normalData = feedingData.slice(0, 24);
      if (normalData.length >= 7) contextAgent.train(normalData);

      // 결과 저장 (에이전트 간 전달용)
      const results = {};

      const agentSteps = [
        {
          id: 'context', name: 'Context Agent (상황인식)',
          run: async () => {
            const r = await contextAgent.analyze({ feedingData, environmentData: envData, farmInfo, livestockInfo });
            results.context = r;
            return r.result;
          }
        },
        {
          id: 'risk_trajectory', name: 'Risk Trajectory Agent (위험궤적분석)',
          run: async () => {
            const ctx = results.context?.result || {};
            const scores = feedingData.map((_, i) => {
              const base = ctx.anomaly_detection?.anomaly_score || 0.5;
              return (ctx.anomaly_detection?.anomaly_indices || []).includes(i) ? Math.min(1, base + 0.1) : Math.max(0, base - 0.2);
            });
            const r = await riskAgent.analyze({ anomalyScores: scores, feedingData, contextResult: ctx });
            results.risk = r;
            return r.result;
          }
        },
        {
          id: 'planning', name: 'Planning Agent (대응계획)',
          run: async () => {
            const r = await planningAgent.analyze({ contextResult: results.context, riskResult: results.risk });
            results.planning = r;
            return r.result;
          }
        },
        {
          id: 'execution', name: 'Execution Agent (조치실행)',
          run: async () => {
            const r = await executionAgent.analyze({ planningResult: results.planning, contextResult: results.context, riskResult: results.risk, farmInfo });
            results.execution = r;
            return r.result;
          }
        },
        {
          id: 'monitoring', name: 'Monitoring Agent (관찰)',
          run: async () => {
            const ctx = results.context?.result || {};
            const scores = feedingData.map(() => ctx.anomaly_detection?.anomaly_score || 0.3);
            const r = await monitoringAgent.analyze({
              beforeData: feedingData.slice(0, -3), afterData: feedingData.slice(-7),
              beforeScores: scores.slice(0, -3), afterScores: scores.slice(-5),
              beforeState: results.risk?.result?.current_state || 'K1',
              afterState: results.risk?.result?.current_state || 'K1',
              responseTimeHours: 2,
            });
            results.monitoring = r;
            return r.result;
          }
        },
        {
          id: 'recovery', name: 'Recovery Agent (수정복구)',
          run: async () => {
            const r = await recoveryAgent.analyze({
              monitoringResult: results.monitoring, riskResult: results.risk, hoursElapsed: 6,
              currentContext: { envStatus: results.context?.result?.environment_analysis?.status || 'normal' },
            });
            results.recovery = r;
            return r.result;
          }
        },
        {
          id: 'orchestration', name: 'Orchestration Agent (협업오케스트레이션)',
          run: async () => {
            // 최종 종합 보고서
            const ctx = results.context?.result || {};
            const risk = results.risk?.result || {};
            const plan = results.planning?.result || {};
            const riskLevel = risk.current_state || 'K1';
            const labels = { K1: '정상', K2: '주의', K3: '위험', K4: '긴급' };

            return {
              final_decision: `${labels[riskLevel] || riskLevel} 단계 대응`,
              alert_level: { K1: 'normal', K2: 'caution', K3: 'danger', K4: 'emergency' }[riskLevel] || 'normal',
              farmer_message: plan.recommendation || ctx.situation_summary || '정상 상태입니다.',
              vet_notification: ['K3', 'K4'].includes(riskLevel)
                ? `${riskLevel === 'K4' ? '긴급' : '참고'} 통보: ${farmInfo.name} ${labels[riskLevel]} 상태. ${ctx.situation_summary || ''}`
                : null,
              severity_score: risk.severity_score || 0,
              key_metrics: {
                feeding_change: ctx.feeding_analysis?.changeRate3d || 0,
                anomaly_score: ctx.anomaly_detection?.anomaly_score || 0,
                action_count: (plan.action_plan?.immediate?.length || 0),
                effectiveness: results.monitoring?.result?.action_effectiveness?.overall_score || 0,
              },
              trajectory_log_id: `TRJ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-3)}`,
            };
          }
        },
      ];

      let stepIndex = 0;

      async function runNextAgent() {
        if (stepIndex >= agentSteps.length) {
          const evt = { type: 'pipeline_complete', data: { totalDuration: Date.now() - pipelineStart, timestamp: new Date().toISOString() } };
          res.write(`data: ${JSON.stringify(evt)}\n\n`);
          res.end();
          return;
        }

        const step = agentSteps[stepIndex];

        // agent_start 전송
        res.write(`data: ${JSON.stringify({ type: 'agent_start', data: { agentId: step.id, agentName: step.name, timestamp: new Date().toISOString() } })}\n\n`);

        // 시각적 딜레이 (실제 처리는 매우 빠르므로 사용자가 볼 수 있게)
        const visualDelay = 800 + Math.random() * 700;
        await new Promise(resolve => setTimeout(resolve, visualDelay));

        try {
          const agentStart = Date.now();
          const response = await step.run();
          const duration_ms = Date.now() - agentStart;

          res.write(`data: ${JSON.stringify({
            type: 'agent_complete',
            data: {
              agentId: step.id, agentName: step.name,
              response, rawText: JSON.stringify(response),
              duration_ms: Math.round(duration_ms + visualDelay),
              timestamp: new Date().toISOString(),
              realAI: true,
            }
          })}\n\n`);
        } catch (err) {
          res.write(`data: ${JSON.stringify({
            type: 'agent_complete',
            data: {
              agentId: step.id, agentName: step.name,
              response: { error: err.message }, rawText: err.message,
              duration_ms: 0, timestamp: new Date().toISOString(),
            }
          })}\n\n`);
        }

        stepIndex++;
        runNextAgent();
      }

      runNextAgent();
    });
    return;
  }

  // Static file serving
  let filePath = url.pathname;
  if (filePath === '/' || filePath === '') filePath = '/index.html';

  const fullPath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(fullPath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // Try without extension
      if (!ext) {
        fs.readFile(fullPath + '.html', (err2, data2) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 Not Found</h1>');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data2);
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  가축 질병 조기경보 AI 에이전트 데모 시스템          ║
║  Livestock Disease Early Warning AI Agent Demo       ║
╠══════════════════════════════════════════════════════╣
║  Server running at http://localhost:${PORT}             ║
║  Mock mode: API 키 불필요, 비용 0원                  ║
╚══════════════════════════════════════════════════════╝
  `);
});
