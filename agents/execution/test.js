/**
 * Execution Agent 테스트
 * 실행: node agents/execution/test.js
 */

const { ExecutionAgent } = require('./index');

async function runTest() {
  console.log('=== Execution Agent 테스트 ===\n');
  const agent = new ExecutionAgent();

  // 테스트 1: ASF 긴급
  console.log('--- 테스트 1: ASF 긴급 ---');
  const r1 = await agent.analyze({
    planningResult: {
      result: {
        action_plan: {
          immediate: [
            { action: '의심 돈사 즉시 격리', priority: 'critical', responsible: '방역 담당자', deadline: '즉시 (30분 이내)' },
            { action: '시군 가축방역기관 긴급 신고', priority: 'critical', responsible: '농장주', deadline: '즉시 (30분 이내)' },
            { action: '전 구역 긴급 소독 실시', priority: 'high', responsible: '방역 담당자', deadline: '1시간 이내' },
          ],
          short_term: [
            { action: '의심 개체 체온 측정', priority: 'high', responsible: '수의사', deadline: '4시간 이내' },
          ],
          preventive: [
            { action: '인접 농가 상황 공유', priority: 'low' },
          ],
        },
      },
    },
    contextResult: { result: { situation_summary: '급이량 35% 급감, ASF 의심', environment_analysis: { status: 'normal' } } },
    riskResult: { result: { current_state: 'K4' } },
    farmInfo: { name: '제일축산 1호동' },
  });

  console.log('경보 발송:', r1.result.alert_results.length + '건');
  r1.result.alert_results.forEach(a => console.log(`  [${a.target}] ${a.status} - ${a.priority} (${a.channels.join(',')})`));
  console.log('워크플로우:', r1.result.workflow.workflowId, '- 태스크', r1.result.workflow.totalTasks + '건');
  console.log('체크리스트:', r1.result.checklist.length + '건');
  r1.result.checklist.forEach(c => console.log(`  ${c.order}. [${c.priority}] ${c.action} → ${c.responsible} (${c.deadline})`));
  console.log('시스템 조치:', r1.result.system_actions.length + '건');
  r1.result.system_actions.forEach(s => console.log(`  [${s.system}] ${s.action}`));
  console.log('수의사 필요:', r1.result.vet_required);
  console.log('처리시간:', r1.duration_ms + 'ms\n');

  // 테스트 2: 고온 환경 (K2)
  console.log('--- 테스트 2: 고온 환경 ---');
  const r2 = await agent.analyze({
    planningResult: {
      result: {
        action_plan: {
          immediate: [{ action: '환기 시스템 최대 가동', priority: 'high' }, { action: '쿨링패드 작동', priority: 'medium' }],
          short_term: [{ action: '음수 공급 확대', priority: 'medium' }],
          preventive: [],
        },
      },
    },
    contextResult: { result: { situation_summary: '축사 온도 33°C, 습도 82%', environment_analysis: { status: 'critical' } } },
    riskResult: { result: { current_state: 'K2' } },
    farmInfo: { name: '제일축산 1호동' },
  });

  console.log('경보:', r2.result.alert_results.length + '건');
  console.log('시스템 조치:', r2.result.system_actions.length + '건');
  r2.result.system_actions.forEach(s => console.log(`  [${s.system}] ${s.action}`));
  console.log('처리시간:', r2.duration_ms + 'ms\n');

  // 테스트 3: 정상 (K1)
  console.log('--- 테스트 3: 정상 ---');
  const r3 = await agent.analyze({
    planningResult: { result: { action_plan: { immediate: [], short_term: [], preventive: [] } } },
    contextResult: { result: { situation_summary: '정상', environment_analysis: { status: 'normal' } } },
    riskResult: { result: { current_state: 'K1' } },
    farmInfo: { name: '제일축산 1호동' },
  });
  console.log('경보:', r3.result.alert_results.length + '건');
  console.log('수의사 필요:', r3.result.vet_required);
  console.log('처리시간:', r3.duration_ms + 'ms\n');

  // 검증
  console.log('=== 결과 검증 ===');
  const pass =
    r1.result.alert_results.length >= 3 &&             // K4: 농장주+수의사+당국+관리자
    r1.result.alert_results.some(a => a.target === 'vet') &&
    r1.result.alert_results.some(a => a.target === 'quarantine_authority') &&
    r1.result.workflow.totalTasks >= 4 &&
    r1.result.system_actions.length >= 2 &&
    r1.result.vet_required === true &&
    r2.result.system_actions.some(s => s.system === 'hvac') &&
    r3.result.vet_required === false;

  console.log('전체 테스트:', pass ? 'PASS ✓' : 'FAIL ✗');
}

runTest().catch(console.error);
