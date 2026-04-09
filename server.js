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
const contextAgent = new ContextAgent({ anomalyThreshold: 0.6 });
const riskAgent = new RiskTrajectoryAgent({ predictionHorizon: 7 });

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

  // API: Agent pipeline (SSE)
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
      const responses = mockResponses[scenario];

      if (!responses) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown scenario' }));
        return;
      }

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const agentOrder = [
        { id: 'context', name: 'Context Agent (상황인식)' },
        { id: 'risk_trajectory', name: 'Risk Trajectory Agent (위험궤적분석)' },
        { id: 'planning', name: 'Planning Agent (대응계획)' },
        { id: 'execution', name: 'Execution Agent (조치실행)' },
        { id: 'monitoring', name: 'Monitoring Agent (관찰)' },
        { id: 'recovery', name: 'Recovery Agent (수정복구)' },
        { id: 'orchestration', name: 'Orchestration Agent (협업오케스트레이션)' },
      ];

      let index = 0;
      const pipelineStart = Date.now();

      function sendNext() {
        if (index >= agentOrder.length) {
          // Pipeline complete
          const evt = {
            type: 'pipeline_complete',
            data: { totalDuration: Date.now() - pipelineStart, timestamp: new Date().toISOString() }
          };
          res.write(`data: ${JSON.stringify(evt)}\n\n`);
          res.end();
          return;
        }

        const agent = agentOrder[index];
        const response = responses[agent.id] || {};

        // Send agent_start
        const startEvt = {
          type: 'agent_start',
          data: { agentId: agent.id, agentName: agent.name, timestamp: new Date().toISOString() }
        };
        res.write(`data: ${JSON.stringify(startEvt)}\n\n`);

        // Simulate processing delay (1.2 ~ 2.5 seconds)
        const delay = 1200 + Math.random() * 1300;
        const agentStart = Date.now();

        setTimeout(() => {
          const duration_ms = Date.now() - agentStart;
          const completeEvt = {
            type: 'agent_complete',
            data: {
              agentId: agent.id,
              agentName: agent.name,
              response: response,
              rawText: JSON.stringify(response),
              duration_ms: Math.round(duration_ms),
              timestamp: new Date().toISOString(),
            }
          };
          res.write(`data: ${JSON.stringify(completeEvt)}\n\n`);

          index++;
          sendNext();
        }, delay);
      }

      sendNext();
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
