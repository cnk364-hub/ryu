/**
 * Planning Agent 테스트
 * 실행: node agents/planning/test.js
 */

const { PlanningAgent } = require('./index');

async function runTest() {
  console.log('=== Planning Agent 테스트 ===\n');
  const agent = new PlanningAgent();

  // 테스트 1: ASF 긴급 상황
  console.log('--- 테스트 1: ASF 긴급 상황 ---');
  const asfResult = await agent.analyze({
    contextResult: {
      result: {
        feeding_analysis: { changeRate3d: -35.2, changeRate7d: -15, trend: 'rapid_decline', pattern: 'acute_drop', currentAvg: 162 },
        environment_analysis: { status: 'normal', temperature: { value: 22 }, humidity: { value: 65 } },
        anomaly_detection: { is_anomaly: true, anomaly_score: 0.85, anomaly_days: 3 },
        livestock_analysis: { recentMortality: 0.3 },
      },
    },
    riskResult: {
      result: {
        current_state: 'K4',
        severity_score: 0.94,
        risk_timeline_description: '현재 긴급 상태',
        anomaly_classification: { primary_type: 'disease' },
      },
    },
  });

  const r = asfResult.result;
  console.log('즉시 조치:', r.action_plan.immediate.length + '건');
  r.action_plan.immediate.forEach(a => console.log(`  [${a.priority}] ${a.action} → ${a.deadline} (${a.responsible})`));
  console.log('단기 조치:', r.action_plan.short_term.length + '건');
  console.log('유사 사례:', r.similar_cases.length + '건');
  r.similar_cases.forEach(c => console.log(`  ${c.title} (${c.similarity})`));
  console.log('수의사 필요:', r.vet_required);
  console.log('권고 메시지:\n', r.recommendation);
  console.log('\nXAI 설명:');
  r.explanations.forEach(e => console.log(`  Q: ${e.question}\n  A: ${e.answer}\n`));
  console.log('처리시간:', asfResult.duration_ms + 'ms\n');

  // 테스트 2: 고온 환경 스트레스
  console.log('--- 테스트 2: 고온 환경 스트레스 ---');
  const heatResult = await agent.analyze({
    contextResult: {
      result: {
        feeding_analysis: { changeRate3d: -5.3, trend: 'stable', pattern: 'mild_change', currentAvg: 235 },
        environment_analysis: { status: 'critical', temperature: { value: 33.2, status: 'critical' }, humidity: { value: 82, status: 'critical' } },
        anomaly_detection: { is_anomaly: false, anomaly_days: 0 },
      },
    },
    riskResult: {
      result: {
        current_state: 'K2',
        severity_score: 0.39,
        anomaly_classification: { primary_type: 'environment' },
      },
    },
  });

  const h = heatResult.result;
  console.log('즉시 조치:', h.action_plan.immediate.length + '건');
  h.action_plan.immediate.forEach(a => console.log(`  [${a.priority}] ${a.action}`));
  console.log('유사 사례:', h.similar_cases[0]?.title, h.similar_cases[0]?.similarity);
  console.log('처리시간:', heatResult.duration_ms + 'ms\n');

  // 테스트 3: 정상 상태
  console.log('--- 테스트 3: 정상 상태 ---');
  const normalResult = await agent.analyze({
    contextResult: {
      result: {
        feeding_analysis: { changeRate3d: 1.5, trend: 'stable', pattern: 'normal', currentAvg: 258 },
        environment_analysis: { status: 'normal', temperature: { value: 21 }, humidity: { value: 60 } },
        anomaly_detection: { is_anomaly: false, anomaly_days: 0 },
      },
    },
    riskResult: {
      result: { current_state: 'K1', severity_score: 0.12, anomaly_classification: { primary_type: 'seasonal' } },
    },
  });

  console.log('즉시 조치:', normalResult.result.action_plan.immediate.length + '건 (정상이면 0)');
  console.log('권고:', normalResult.result.recommendation);
  console.log('처리시간:', normalResult.duration_ms + 'ms\n');

  // 검증
  console.log('=== 결과 검증 ===');
  const pass =
    r.action_plan.immediate.length >= 3 &&
    r.similar_cases.length >= 1 &&
    r.vet_required === true &&
    r.explanations.length >= 2 &&
    h.action_plan.immediate[0]?.action.includes('환기') &&
    normalResult.result.action_plan.immediate.length === 0;

  console.log('전체 테스트:', pass ? 'PASS ✓' : 'FAIL ✗');
}

runTest().catch(console.error);
