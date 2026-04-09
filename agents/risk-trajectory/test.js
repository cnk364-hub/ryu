/**
 * Risk Trajectory Agent 테스트
 * 실행: node agents/risk-trajectory/test.js
 */

const { RiskTrajectoryAgent } = require('./index');
const { ContextAgent } = require('../context/index');
const simulator = require('../../mock-data/simulator');

// EIF 간이 이상점수 계산 (context agent의 통계 기반)
function calcAnomalyScores(feedingData) {
  const values = feedingData.map(d => d.consumption_kg);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) || 1;
  return values.map(v => {
    const z = Math.abs((v - mean) / std);
    return Math.round((1 / (1 + Math.exp(-(1.8 * z - 2.0)))) * 1000) / 1000;
  });
}

async function runTest() {
  console.log('=== Risk Trajectory Agent 테스트 ===\n');

  // -------------------------------------------------------
  // 테스트 1: ASF 질병 시나리오 (급이량 급감 → 위험 상승)
  // -------------------------------------------------------
  console.log('--- 테스트 1: ASF 질병 시나리오 ---');
  const asfData = simulator.generateFeedingData('disease_asf');
  const anomalyScores = calcAnomalyScores(asfData);

  const agent = new RiskTrajectoryAgent({ predictionHorizon: 7 });

  // 과거 사례로 학습 (ASF 발생 패턴)
  agent.learnFromHistory([
    ['K1','K1','K1','K1','K1','K2','K2','K3','K3','K4'],
    ['K1','K1','K1','K2','K2','K2','K3','K3','K4','K4'],
    ['K1','K1','K2','K3','K3','K4','K4','K4','K4','K4'],
  ]);

  const asfResult = await agent.analyze({
    anomalyScores,
    feedingData: asfData,
  });

  const r = asfResult.result;
  console.log('현재 상태:', r.current_state, `(${r.current_state_label})`);
  console.log('전이 확률:', JSON.stringify(r.transition_probabilities));
  console.log('심각도:', r.severity_score);
  console.log('위험 도달:', r.risk_timeline_description);
  console.log('Viterbi 경로 (최근 10일):', r.optimal_path.states.slice(-10).join(' → '));
  console.log('미래 예측:');
  r.future_predictions.forEach(p => {
    console.log(`  ${p.label}: ${p.most_likely} (K3+K4: ${Math.round((p.distribution[2]+p.distribution[3])*100)}%)`);
  });
  console.log('전환점:', r.trajectory_visualization.transitions.length + '건');
  r.trajectory_visualization.explanations.slice(-3).forEach(e => {
    console.log(`  [${e.date}] ${e.description}`);
  });
  console.log('처리시간:', asfResult.duration_ms + 'ms');
  console.log();

  // -------------------------------------------------------
  // 테스트 2: 고온 스트레스 시나리오
  // -------------------------------------------------------
  console.log('--- 테스트 2: 고온 스트레스 시나리오 ---');
  const heatData = simulator.generateFeedingData('environment_heat');
  const heatScores = calcAnomalyScores(heatData);

  const agent2 = new RiskTrajectoryAgent();
  const heatResult = await agent2.analyze({
    anomalyScores: heatScores,
    feedingData: heatData,
  });

  const h = heatResult.result;
  console.log('현재 상태:', h.current_state, `(${h.current_state_label})`);
  console.log('심각도:', h.severity_score);
  console.log('위험 도달:', h.risk_timeline_description);
  console.log('처리시간:', heatResult.duration_ms + 'ms');
  console.log();

  // -------------------------------------------------------
  // 테스트 3: 정상 시나리오
  // -------------------------------------------------------
  console.log('--- 테스트 3: 정상 시나리오 ---');
  const normalData = simulator.generateFeedingData('shipment_optimization');
  const normalScores = calcAnomalyScores(normalData);

  const agent3 = new RiskTrajectoryAgent();
  const normalResult = await agent3.analyze({
    anomalyScores: normalScores,
    feedingData: normalData,
  });

  const n = normalResult.result;
  console.log('현재 상태:', n.current_state, `(${n.current_state_label})`);
  console.log('심각도:', n.severity_score);
  console.log('위험 도달:', n.risk_timeline_description);
  console.log('처리시간:', normalResult.duration_ms + 'ms');
  console.log();

  // -------------------------------------------------------
  // 결과 요약
  // -------------------------------------------------------
  console.log('=== 테스트 결과 요약 ===');
  console.log('ASF 시나리오  → 상태:', r.current_state, '| 심각도:', r.severity_score);
  console.log('고온 시나리오 → 상태:', h.current_state, '| 심각도:', h.severity_score);
  console.log('정상 시나리오 → 상태:', n.current_state, '| 심각도:', n.severity_score);

  // ASF 검증: 이상유형 분류 확인
  console.log('\n--- 이상 유형 분류 결과 ---');
  console.log('ASF:', JSON.stringify(asfResult.result.anomaly_classification.probabilities));
  console.log('ASF 분류:', asfResult.result.anomaly_classification.primary_type_label);
  console.log('고온:', JSON.stringify(heatResult.result.anomaly_classification.probabilities));
  console.log('고온 분류:', heatResult.result.anomaly_classification.primary_type_label);

  const pass =
    r.severity_score >= 0.5 &&                           // ASF는 높은 심각도
    r.current_state === 'K4' &&                           // ASF는 긴급 상태
    r.future_predictions[0].most_likely === 'K4' &&       // ASF 미래도 긴급 유지
    asfResult.result.anomaly_classification !== undefined; // 분류기 동작 확인

  console.log('\n전체 테스트:', pass ? 'PASS ✓' : 'FAIL ✗');
}

runTest().catch(console.error);
