/**
 * Orchestration Agent 통합 테스트 - 3종 시나리오
 * 실행: node agents/orchestration/test.js
 */
const { OrchestrationAgent } = require('./index');
const simulator = require('../../mock-data/simulator');

async function runTest() {
  console.log('=== 3종 시나리오 통합 파이프라인 테스트 ===\n');

  // ============================================
  // 시나리오 1: ASF 질병 조기탐지
  // ============================================
  console.log('━━━ 시나리오 1: ASF 질병 조기탐지 ━━━');
  const agent1 = new OrchestrationAgent();
  const asfData = simulator.generateFeedingData('disease_asf');
  const asfEnv = simulator.generateEnvironmentData('disease_asf');
  agent1.agents.context.train(asfData.slice(0, 24));

  const r1 = await agent1.runPipeline({
    scenario: 'disease_asf',
    feedingData: asfData,
    environmentData: asfEnv,
    farmInfo: { name: '제일축산 1호동' },
    livestockInfo: { breed: 'LYD', headCount: 120, avgWeight: 95, avgAge: 150, recentMortality: 0.3 },
    onStep: (id, r) => process.stdout.write(`  [${id}] ${r.duration_ms}ms `),
  });
  console.log();

  const f1 = r1.result;
  console.log('시나리오:', f1.scenario.name);
  console.log('결정:', f1.final_report.final_decision);
  console.log('경보:', f1.final_report.alert_level, '| 심각도:', f1.final_report.severity_score);
  console.log('수의사:', f1.final_report.vet_notification ? 'YES' : 'NO');
  console.log('에이전트:', Object.keys(f1.agent_results).length + '개 실행');
  console.log('소요:', r1.duration_ms + 'ms\n');

  // ============================================
  // 시나리오 2: 고온 스트레스 환경 대응
  // ============================================
  console.log('━━━ 시나리오 2: 사육환경 이상 대응 ━━━');
  const agent2 = new OrchestrationAgent();
  const heatData = simulator.generateFeedingData('environment_heat');
  const heatEnv = simulator.generateEnvironmentData('environment_heat');

  const r2 = await agent2.runPipeline({
    scenario: 'environment_heat',
    feedingData: heatData,
    environmentData: heatEnv,
    farmInfo: { name: '제일축산 1호동' },
    onStep: (id, r) => process.stdout.write(`  [${id}] ${r.duration_ms}ms `),
  });
  console.log();

  const f2 = r2.result;
  console.log('시나리오:', f2.scenario.name);
  console.log('결정:', f2.final_report.final_decision);
  console.log('경보:', f2.final_report.alert_level);
  console.log('핵심:', '온도', f2.final_report.key_metrics.feeding_change + '% 급이변화');
  console.log('소요:', r2.duration_ms + 'ms\n');

  // ============================================
  // 시나리오 3: 최적 출하시기 분석
  // ============================================
  console.log('━━━ 시나리오 3: 최적 출하시기 분석 ━━━');
  const agent3 = new OrchestrationAgent();
  const shipData = simulator.generateFeedingData('shipment_optimization');
  const shipEnv = simulator.generateEnvironmentData('shipment_optimization');

  const r3 = await agent3.runPipeline({
    scenario: 'shipment_optimization',
    feedingData: shipData,
    environmentData: shipEnv,
    farmInfo: { name: '제일축산 1호동' },
    onStep: (id, r) => process.stdout.write(`  [${id}] ${r.duration_ms}ms `),
  });
  console.log();

  const f3 = r3.result;
  console.log('시나리오:', f3.scenario.name);
  console.log('결정:', f3.final_report.final_decision);
  console.log('경보:', f3.final_report.alert_level);
  console.log('메시지:', f3.final_report.farmer_message.slice(0, 80) + '...');
  console.log('소요:', r3.duration_ms + 'ms\n');

  // ============================================
  // 시나리오 자동 감지 테스트
  // ============================================
  console.log('━━━ 시나리오 자동 감지 테스트 ━━━');
  const { detectScenario } = require('../scenario-profiles');
  console.log('ASF 데이터 →', detectScenario(asfData, asfEnv));
  console.log('고온 데이터 →', detectScenario(heatData, heatEnv));
  console.log('출하 데이터 →', detectScenario(shipData, shipEnv));
  console.log();

  // ============================================
  // 검증
  // ============================================
  console.log('━━━ 결과 검증 ━━━');
  const checks = [
    ['ASF → emergency', f1.final_report.alert_level === 'emergency'],
    ['ASF → 수의사 통보', f1.final_report.vet_notification !== null],
    ['ASF → K4', f1.final_report.risk_state === 'K4'],
    ['환경 → 비긴급', f2.final_report.alert_level !== 'emergency'],
    ['환경 시나리오 ID', f2.scenario.id === 'environment_heat'],
    ['출하 시나리오 ID', f3.scenario.id === 'shipment_optimization'],
    ['출하 → 출하 메시지', f3.final_report.farmer_message.includes('출하')],
    ['전체 에이전트 실행', Object.keys(f1.agent_results).length >= 5],
  ];

  let allPass = true;
  checks.forEach(([label, result]) => {
    console.log(`  ${result ? 'PASS' : 'FAIL'} — ${label}`);
    if (!result) allPass = false;
  });

  console.log('\n전체 테스트:', allPass ? 'PASS ✓' : 'FAIL ✗');
  console.log('\n7개 에이전트 x 3개 시나리오 통합 테스트 완료!');
}

runTest().catch(console.error);
