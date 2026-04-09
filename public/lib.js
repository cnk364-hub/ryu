/* ============================================================
   lib.js - Utility library for the Livestock AI Agent Demo
   ============================================================ */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENTS = [
  { id: 'context', name: 'Context Agent', nameKo: '상황인식', color: '#3B82F6', tech: 'EIF 이상탐지', icon: 'C' },
  { id: 'risk_trajectory', name: 'Risk Trajectory Agent', nameKo: '위험궤적분석', color: '#F97316', tech: 'HMM 상태전이', icon: 'R' },
  { id: 'planning', name: 'Planning Agent', nameKo: '대응계획', color: '#8B5CF6', tech: 'CBR 사례기반추론', icon: 'P' },
  { id: 'execution', name: 'Execution Agent', nameKo: '조치실행', color: '#22C55E', tech: '자동화 실행 엔진', icon: 'E' },
  { id: 'monitoring', name: 'Monitoring Agent', nameKo: '모니터링', color: '#14B8A6', tech: '실시간 KPI 추적', icon: 'M' },
  { id: 'recovery', name: 'Recovery Agent', nameKo: '복구관리', color: '#EF4444', tech: '복구 시뮬레이션', icon: 'V' },
  { id: 'orchestration', name: 'Orchestration Agent', nameKo: '오케스트레이션', color: '#EAB308', tech: 'Multi-Agent 조율', icon: 'O' },
];

const SCENARIOS = [
  {
    id: 'disease_asf',
    title: 'ASF 질병 조기경보',
    description: 'LiDAR 급이 센서 데이터에서 아프리카돼지열병(ASF) 의심 패턴을 감지하고 다중 에이전트가 협력하여 대응합니다.',
    icon: '&#x1F48A;',
    iconBg: 'rgba(239,68,68,0.15)',
    details: [
      '최근 3일간 급이량 35% 급감 감지',
      'EIF 이상탐지 알고리즘으로 이상 패턴 확인',
      'HMM 상태전이 모델로 K3(위험) 상태 판정',
      'CBR 유사 사례: 2023년 충남 홍성 ASF 사례',
      '48시간 내 K4(긴급) 전환 확률 72% 추정',
    ],
  },
  {
    id: 'environment_heat',
    title: '고온 스트레스 환경경보',
    description: '축사 내부 온도/습도 이상 상승으로 인한 열 스트레스 상황을 감지하고 환경 제어 대응을 수행합니다.',
    icon: '&#x1F321;',
    iconBg: 'rgba(249,115,22,0.15)',
    details: [
      '축사 내부 온도 32도 이상, 습도 80% 이상 감지',
      'THI(온습도지수) 위험 구간 진입',
      '급이량은 정상이나 환경 스트레스 누적 중',
      '환기 시스템 가동률 100%로 상향 권고',
      '72시간 이내 폭염 지속 시 생산성 저하 예상',
    ],
  },
  {
    id: 'shipment_optimization',
    title: '최적 출하시기 분석',
    description: '사료 효율(FCR)과 성장 데이터를 분석하여 경제적으로 최적인 출하 시기를 결정합니다.',
    icon: '&#x1F69A;',
    iconBg: 'rgba(34,197,94,0.15)',
    details: [
      '현재 평균 체중 112kg, 목표 체중 115kg 도달 임박',
      'FCR(사료요구율) 3.1로 경제적 효율 구간 유지',
      '일당증체량(ADG) 0.85kg/일 안정적 유지',
      '사료 가격 상승 추세 반영 시 조기 출하 유리',
      '출하 지연 시 사료비 증가분 일별 추정 제공',
    ],
  },
];

const RISK_LABELS = { normal: '정상', caution: '주의', danger: '위험', emergency: '긴급' };
const RISK_COLORS = { normal: '#22c55e', caution: '#eab308', danger: '#f97316', emergency: '#ef4444' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function $(sel, parent) { return (parent || document).querySelector(sel); }
function $$(sel, parent) { return Array.from((parent || document).querySelectorAll(sel)); }
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'innerHTML') el.innerHTML = v;
    else el.setAttribute(k, v);
  });
  children.flat(Infinity).forEach(c => {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  });
  return el;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function getAgentById(id) {
  return AGENTS.find(a => a.id === id);
}

// ---------------------------------------------------------------------------
// SVG Line Chart
// ---------------------------------------------------------------------------

function renderFeedingChart(container, data, anomalyScores) {
  container.innerHTML = '';
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">데이터 없음</div>';
    return;
  }

  const W = 720, H = 260;
  const pad = { top: 20, right: 30, bottom: 40, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const consumptions = data.map(d => d.consumption_kg);
  const baselines = data.map(d => d.normal_baseline);
  const allValues = [...consumptions, ...baselines];
  const minY = Math.floor(Math.min(...allValues) / 10) * 10 - 10;
  const maxY = Math.ceil(Math.max(...allValues) / 10) * 10 + 10;

  function xPos(i) { return pad.left + (i / (data.length - 1)) * plotW; }
  function yPos(v) { return pad.top + (1 - (v - minY) / (maxY - minY)) * plotH; }

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

  // Grid lines
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const v = minY + (maxY - minY) * (i / gridSteps);
    const y = yPos(v);
    const line = svgEl('line', { x1: pad.left, y1: y, x2: W - pad.right, y2: y, stroke: '#1f2937', 'stroke-width': '1' });
    svg.appendChild(line);
    const label = svgEl('text', { x: pad.left - 8, y: y + 4, fill: '#6b7280', 'font-size': '10', 'text-anchor': 'end' });
    label.textContent = Math.round(v);
    svg.appendChild(label);
  }

  // X-axis labels (every 5th)
  for (let i = 0; i < data.length; i += 5) {
    const x = xPos(i);
    const label = svgEl('text', { x: x, y: H - 8, fill: '#6b7280', 'font-size': '9', 'text-anchor': 'middle' });
    label.textContent = data[i].date.slice(5); // MM-DD
    svg.appendChild(label);
  }

  // Y-axis label
  const yLabel = svgEl('text', { x: 12, y: pad.top + plotH / 2, fill: '#6b7280', 'font-size': '10', 'text-anchor': 'middle', transform: `rotate(-90, 12, ${pad.top + plotH / 2})` });
  yLabel.textContent = '사료소모량(kg)';
  svg.appendChild(yLabel);

  // Baseline line (blue dashed)
  const baselinePath = baselines.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${yPos(v)}`).join(' ');
  const baselineLine = svgEl('path', { d: baselinePath, fill: 'none', stroke: '#3b82f6', 'stroke-width': '2', 'stroke-dasharray': '6,3', opacity: '0.6' });
  svg.appendChild(baselineLine);

  // Consumption line (red/gradient)
  const consumptionPath = consumptions.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${yPos(v)}`).join(' ');
  const consumptionLine = svgEl('path', { d: consumptionPath, fill: 'none', stroke: '#ef4444', 'stroke-width': '2.5', 'stroke-linejoin': 'round' });
  svg.appendChild(consumptionLine);

  // Area fill under consumption line
  const areaPath = consumptionPath + ` L${xPos(data.length - 1)},${yPos(minY)} L${xPos(0)},${yPos(minY)} Z`;
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: 'areaGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
  const stop1 = svgEl('stop', { offset: '0%', 'stop-color': '#ef4444', 'stop-opacity': '0.15' });
  const stop2 = svgEl('stop', { offset: '100%', 'stop-color': '#ef4444', 'stop-opacity': '0' });
  grad.appendChild(stop1);
  grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.appendChild(defs);
  const area = svgEl('path', { d: areaPath, fill: 'url(#areaGrad)' });
  svg.appendChild(area);

  // Anomaly markers
  if (anomalyScores) {
    anomalyScores.forEach((a, i) => {
      if (a.isAnomaly) {
        const x = xPos(i);
        // Vertical dashed line
        const vLine = svgEl('line', {
          x1: x, y1: pad.top, x2: x, y2: pad.top + plotH,
          stroke: '#ef4444', 'stroke-width': '1', 'stroke-dasharray': '4,3', opacity: '0.6'
        });
        svg.appendChild(vLine);
        // Circle marker
        const circle = svgEl('circle', {
          cx: x, cy: yPos(consumptions[i]), r: '4',
          fill: '#ef4444', stroke: '#0a0f1a', 'stroke-width': '2'
        });
        svg.appendChild(circle);
        // Label on first anomaly only
        if (i === anomalyScores.findIndex(aa => aa.isAnomaly)) {
          const txt = svgEl('text', { x: x + 6, y: pad.top + 14, fill: '#ef4444', 'font-size': '10', 'font-weight': 'bold' });
          txt.textContent = '이상 탐지';
          svg.appendChild(txt);
        }
      }
    });
  }

  // Data points on consumption line
  consumptions.forEach((v, i) => {
    const isAnomaly = anomalyScores && anomalyScores[i] && anomalyScores[i].isAnomaly;
    if (!isAnomaly && i % 3 !== 0) return; // thin out normal dots
    const circle = svgEl('circle', {
      cx: xPos(i), cy: yPos(v), r: isAnomaly ? '0' : '2.5',
      fill: isAnomaly ? 'transparent' : '#ef4444', opacity: '0.7'
    });
    svg.appendChild(circle);
  });

  // Legend
  const legendY = H - 4;
  const leg1 = svgEl('line', { x1: pad.left + plotW / 2 - 100, y1: legendY, x2: pad.left + plotW / 2 - 80, y2: legendY, stroke: '#3b82f6', 'stroke-width': '2', 'stroke-dasharray': '6,3' });
  svg.appendChild(leg1);
  const leg1t = svgEl('text', { x: pad.left + plotW / 2 - 76, y: legendY + 3, fill: '#9ca3af', 'font-size': '10' });
  leg1t.textContent = '정상 기준선';
  svg.appendChild(leg1t);

  const leg2 = svgEl('line', { x1: pad.left + plotW / 2 + 10, y1: legendY, x2: pad.left + plotW / 2 + 30, y2: legendY, stroke: '#ef4444', 'stroke-width': '2.5' });
  svg.appendChild(leg2);
  const leg2t = svgEl('text', { x: pad.left + plotW / 2 + 34, y: legendY + 3, fill: '#9ca3af', 'font-size': '10' });
  leg2t.textContent = '실제 측정값';
  svg.appendChild(leg2t);

  container.appendChild(svg);
}

// ---------------------------------------------------------------------------
// Agentic Loop SVG Visualization
// ---------------------------------------------------------------------------

function renderAgentLoop(container, activeAgent, completedAgents) {
  container.innerHTML = '';
  const W = 300, H = 300;
  const cx = W / 2, cy = H / 2, radius = 110;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

  // Defs for arrow marker
  const defs = svgEl('defs');
  const marker = svgEl('marker', { id: 'arrowhead', markerWidth: '8', markerHeight: '6', refX: '8', refY: '3', orient: 'auto' });
  const arrowPath = svgEl('polygon', { points: '0 0, 8 3, 0 6', fill: '#4b5563' });
  marker.appendChild(arrowPath);
  defs.appendChild(marker);

  // Glow filter
  const glowFilter = svgEl('filter', { id: 'glow' });
  const feBlur = svgEl('feGaussianBlur', { stdDeviation: '3', result: 'coloredBlur' });
  glowFilter.appendChild(feBlur);
  const feMerge = svgEl('feMerge');
  const feMergeNode1 = svgEl('feMergeNode', { in: 'coloredBlur' });
  const feMergeNode2 = svgEl('feMergeNode', { in: 'SourceGraphic' });
  feMerge.appendChild(feMergeNode1);
  feMerge.appendChild(feMergeNode2);
  glowFilter.appendChild(feMerge);
  defs.appendChild(glowFilter);
  svg.appendChild(defs);

  // Center label
  const centerText = svgEl('text', { x: cx, y: cy - 6, fill: '#6b7280', 'font-size': '10', 'text-anchor': 'middle' });
  centerText.textContent = 'Agentic';
  svg.appendChild(centerText);
  const centerText2 = svgEl('text', { x: cx, y: cy + 8, fill: '#6b7280', 'font-size': '10', 'text-anchor': 'middle' });
  centerText2.textContent = 'Loop';
  svg.appendChild(centerText2);

  // Draw arrows between nodes
  const positions = AGENTS.map((_, i) => {
    const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  for (let i = 0; i < AGENTS.length; i++) {
    const next = (i + 1) % AGENTS.length;
    const from = positions[i];
    const to = positions[next];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len;
    const ny = dy / len;
    const startX = from.x + nx * 26;
    const startY = from.y + ny * 26;
    const endX = to.x - nx * 26;
    const endY = to.y - ny * 26;

    const isCompleted = completedAgents.includes(AGENTS[i].id) && completedAgents.includes(AGENTS[next].id);
    const isActive = activeAgent === AGENTS[i].id;

    const line = svgEl('line', {
      x1: startX, y1: startY, x2: endX, y2: endY,
      stroke: isCompleted ? '#22c55e' : isActive ? '#3b82f6' : '#2d3748',
      'stroke-width': isActive ? '2' : '1.5',
      'marker-end': 'url(#arrowhead)',
      opacity: isCompleted ? '0.7' : isActive ? '0.9' : '0.4'
    });
    svg.appendChild(line);
  }

  // Draw nodes
  AGENTS.forEach((agent, i) => {
    const pos = positions[i];
    const isActive = activeAgent === agent.id;
    const isCompleted = completedAgents.includes(agent.id);

    const g = svgEl('g', { class: `agent-node${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}` });

    // Pulse ring for active
    if (isActive) {
      const pulse = svgEl('circle', { cx: pos.x, cy: pos.y, r: '28', fill: 'none', stroke: agent.color, 'stroke-width': '2', opacity: '0.3' });
      pulse.innerHTML = `<animate attributeName="r" values="24;32;24" dur="1.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.5s" repeatCount="indefinite"/>`;
      g.appendChild(pulse);
    }

    // Main circle
    const circle = svgEl('circle', {
      cx: pos.x, cy: pos.y, r: '22',
      fill: isActive || isCompleted ? agent.color : '#1a2236',
      stroke: agent.color,
      'stroke-width': isActive ? '3' : '2',
      opacity: isActive ? '1' : isCompleted ? '0.9' : '0.5',
      filter: isActive ? 'url(#glow)' : ''
    });
    g.appendChild(circle);

    // Icon text or checkmark
    if (isCompleted && !isActive) {
      const check = svgEl('text', { x: pos.x, y: pos.y + 5, fill: 'white', 'font-size': '14', 'text-anchor': 'middle', 'font-weight': 'bold' });
      check.textContent = '\u2713';
      g.appendChild(check);
    } else {
      const txt = svgEl('text', { x: pos.x, y: pos.y + 5, fill: isActive || isCompleted ? 'white' : agent.color, 'font-size': '12', 'text-anchor': 'middle', 'font-weight': 'bold' });
      txt.textContent = agent.icon;
      g.appendChild(txt);
    }

    // Label
    const label = svgEl('text', {
      x: pos.x, y: pos.y + 36,
      fill: isActive ? agent.color : '#6b7280',
      'font-size': '9',
      'text-anchor': 'middle',
      'font-weight': isActive ? 'bold' : 'normal'
    });
    label.textContent = agent.nameKo;
    g.appendChild(label);

    svg.appendChild(g);
  });

  container.appendChild(svg);
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

function renderProgressBar(container, label, value, target, color) {
  const pct = Math.min(100, (value / target) * 100);
  const isGood = value >= target;

  container.innerHTML = `
    <div class="progress-bar-label">
      <span>${label}</span>
      <span style="color: ${isGood ? '#22c55e' : color}">${typeof value === 'number' && value < 10 ? value.toFixed(1) : value}% / ${target}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${pct}%; background: ${color};"></div>
    </div>
  `;
}
