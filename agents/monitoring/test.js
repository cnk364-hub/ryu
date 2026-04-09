/**
 * Monitoring Agent 테스트
 * 실행: node agents/monitoring/test.js
 */
const { MonitoringAgent } = require('./index');
const simulator = require('../../mock-data/simulator');

async function runTest() {
  console.log('=== Monitoring Agent 테스트 ===\n');
  const agent = new MonitoringAgent();

  // 테스트 1: ASF 조치 후 부분 회복
  console.log('--- 테스트 1: ASF 조치 후 부분 회복 ---');
  const fullData = simulator.generateFeedingData('disease_asf');
  const beforeData = fullData.slice(0, 27);  // 급이 감소 구간
  const afterData = fullData.slice(24);       // 일부 겹침 + 이후

  // 이상점수 시뮬레이션
  const beforeScores = beforeData.slice(-5).map(() => 0.75 + Math.random() * 0.15);
  const afterScores = [0.7, 0.6, 0.55, 0.48, 0.42, 0.38];

  const r1 = await agent.analyze({
    beforeData, afterData, beforeScores, afterScores,
    beforeState: 'K4', afterState: 'K2', responseTimeHours: 3,
  });

  const m = r1.result;
  console.log('상태 변화:', m.state_change.description);
  console.log('조치 효과:', m.action_effectiveness.overall_score, `(${m.action_effectiveness.overall_label})`);
  console.log('KPI:');
  Object.entries(m.action_effectiveness.kpis).forEach(([k, v]) => {
    console.log(`  ${k}: ${v.score.toFixed(2)} - ${v.description}`);
  });
  console.log('이상추이:', m.anomaly_trend.description);
  console.log('재경보:', m.re_alert_needed.needed ? 'YES - ' + m.re_alert_needed.reasons.join(', ') : 'NO');
  console.log('경보해제:', m.alert_clearable.clearable ? 'YES' : 'NO - ' + m.alert_clearable.description);
  console.log('성공기준:', m.success_criteria.description);
  console.log('다음체크:', m.next_check.intervalHours + '시간 후 -', m.next_check.reason);
  console.log('처리시간:', r1.duration_ms + 'ms\n');

  // 테스트 2: 완전 회복
  console.log('--- 테스트 2: 완전 회복 ---');
  const normalData = simulator.generateFeedingData('shipment_optimization');
  const r2 = await agent.analyze({
    beforeData: fullData.slice(0, 27),
    afterData: normalData.slice(-7),
    beforeScores: [0.8, 0.85, 0.9],
    afterScores: [0.3, 0.25, 0.2, 0.18, 0.15],
    beforeState: 'K4', afterState: 'K1', responseTimeHours: 2,
  });

  console.log('상태 변화:', r2.result.state_change.description);
  console.log('조치 효과:', r2.result.action_effectiveness.overall_score, `(${r2.result.action_effectiveness.overall_label})`);
  console.log('경보해제:', r2.result.alert_clearable.clearable ? 'YES' : 'NO');
  console.log('성공기준:', r2.result.success_criteria.description);
  console.log('처리시간:', r2.duration_ms + 'ms\n');

  // 테스트 3: 악화 (조치 실패)
  console.log('--- 테스트 3: 악화 (조치 실패) ---');
  const r3 = await agent.analyze({
    beforeData: fullData.slice(20, 27),
    afterData: fullData.slice(25),
    beforeScores: [0.6, 0.65, 0.7],
    afterScores: [0.72, 0.78, 0.85, 0.9, 0.92],
    beforeState: 'K3', afterState: 'K4', responseTimeHours: 8,
  });

  console.log('상태 변화:', r3.result.state_change.description);
  console.log('조치 효과:', r3.result.action_effectiveness.overall_score, `(${r3.result.action_effectiveness.overall_label})`);
  console.log('재경보:', r3.result.re_alert_needed.needed ? 'YES' : 'NO');
  console.log('다음체크:', r3.result.next_check.intervalHours + '시간 후');
  console.log('처리시간:', r3.duration_ms + 'ms\n');

  // 검증
  console.log('=== 결과 검증 ===');
  const pass =
    m.state_change.direction === 'improving' &&           // K4→K2 개선
    m.anomaly_trend.trend === 'decreasing' &&             // 이상점수 감소 추세
    r2.result.alert_clearable.clearable === true &&       // 완전회복 시 경보 해제
    r2.result.action_effectiveness.overall_score > 0.7 && // 완전회복 효과 높음
    r3.result.re_alert_needed.needed === true &&          // 악화 시 재경보
    r3.result.state_change.direction === 'worsening';     // 악화 확인

  console.log('전체 테스트:', pass ? 'PASS ✓' : 'FAIL ✗');
}

runTest().catch(console.error);
