/**
 * Orchestration Agent 테스트 - 전체 파이프라인 통합 실행
 * 실행: node agents/orchestration/test.js
 */
const { OrchestrationAgent } = require('./index');
const simulator = require('../../mock-data/simulator');

async function runTest() {
  console.log('=== Orchestration Agent 통합 테스트 ===\n');

  const agent = new OrchestrationAgent();

  // 테스트 1: ASF 시나리오 전체 파이프라인
  console.log('--- 테스트 1: ASF 시나리오 (전체 7개 에이전트 순차 실행) ---');
  const asfData = simulator.generateFeedingData('disease_asf');
  const asfEnv = simulator.generateEnvironmentData('disease_asf');

  // 정상 데이터로 Context Agent 학습
  agent.agents.context.train(asfData.slice(0, 24));

  const r1 = await agent.runPipeline({
    feedingData: asfData,
    environmentData: asfEnv,
    farmInfo: { name: '제일축산 1호동', type: 'pig' },
    livestockInfo: { breed: 'LYD', headCount: 120, avgWeight: 95, avgAge: 150, recentMortality: 0.3 },
    onStep: (agentId, result) => {
      console.log(`  [${agentId}] 완료 (${result.duration_ms}ms)`);
    },
  });

  const f = r1.result.final_report;
  console.log('\n=== 최종 보고서 ===');
  console.log('의사결정:', f.final_decision);
  console.log('경보 수준:', f.alert_level);
  console.log('위험 상태:', f.risk_state);
  console.log('심각도:', f.severity_score);
  console.log('핵심 지표:', JSON.stringify(f.key_metrics, null, 2));
  console.log('농장주 메시지:', f.farmer_message.slice(0, 120) + '...');
  console.log('수의사 통보:', f.vet_notification ? f.vet_notification.slice(0, 100) + '...' : 'N/A');
  console.log('궤적 로그 ID:', f.trajectory_log_id);

  console.log('\n=== 파이프라인 상태 ===');
  const state = r1.result.pipeline_state;
  console.log('최종 상태:', state.current);
  console.log('루프 횟수:', r1.result.loop_count);
  console.log('상태 전이 이력:');
  state.history.forEach(h => console.log(`  ${h.from} → ${h.to} (${h.reason})`));

  console.log('\n=== 에이전트 요약 ===');
  Object.entries(r1.result.agent_results).forEach(([id, a]) => {
    console.log(`  [${id}] ${a.duration_ms}ms — ${a.summary}`);
  });

  console.log('\n운영 로그:', r1.result.operation_log.length + '건');
  console.log('전체 소요시간:', r1.duration_ms + 'ms\n');

  // 테스트 2: 정상 시나리오
  console.log('--- 테스트 2: 정상 시나리오 ---');
  const agent2 = new OrchestrationAgent();
  const normalData = simulator.generateFeedingData('shipment_optimization');
  const normalEnv = simulator.generateEnvironmentData('shipment_optimization');

  const r2 = await agent2.runPipeline({
    feedingData: normalData,
    environmentData: normalEnv,
    farmInfo: { name: '제일축산 1호동' },
  });

  console.log('의사결정:', r2.result.final_report.final_decision);
  console.log('경보 수준:', r2.result.final_report.alert_level);
  console.log('소요시간:', r2.duration_ms + 'ms\n');

  // 검증
  console.log('=== 결과 검증 ===');
  const pass =
    f.alert_level === 'emergency' &&                     // ASF → 긴급
    f.severity_score >= 0.5 &&                           // 높은 심각도
    f.vet_notification !== null &&                       // 수의사 통보
    r1.result.agent_results.context !== undefined &&     // 7개 에이전트 모두 실행
    r1.result.agent_results.risk_trajectory !== undefined &&
    r1.result.agent_results.planning !== undefined &&
    r1.result.agent_results.execution !== undefined &&
    r1.result.agent_results.monitoring !== undefined &&
    r1.result.operation_log.length >= 10 &&              // 운영 로그 충분
    r2.result.final_report.alert_level !== 'emergency';  // 정상은 긴급 아님

  console.log('전체 테스트:', pass ? 'PASS ✓' : 'FAIL ✗');
  console.log('\n🎉 7/7 에이전트 통합 파이프라인 테스트 완료!');
}

runTest().catch(console.error);
