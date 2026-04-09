/**
 * Recovery Agent 테스트
 * 실행: node agents/recovery/test.js
 */
const { RecoveryAgent } = require('./index');

async function runTest() {
  console.log('=== Recovery Agent 테스트 ===\n');
  const agent = new RecoveryAgent();

  // 테스트 1: 조치 실패 — K4 지속, 급이 미회복
  console.log('--- 테스트 1: 조치 실패 (K4 지속) ---');
  const r1 = await agent.analyze({
    monitoringResult: {
      result: {
        state_change: { direction: 'stable', beforeState: 'K4', afterState: 'K4' },
        action_effectiveness: { overall_score: 0.15, overall_label: '미흡', kpis: { feeding_recovery: { score: 0.1 } } },
        re_alert_needed: { needed: true, reasons: ['이상점수 높음'] },
      },
    },
    riskResult: { result: { current_state: 'K4' } },
    hoursElapsed: 8,
    currentContext: { envStatus: 'normal', vetCalled: true, vetArrived: false },
  });

  const m1 = r1.result;
  console.log('효과:', m1.effectiveness_score, `(${m1.effectiveness_label})`);
  console.log('계획 수정 필요:', m1.plan_adjustment_needed);
  console.log('에스컬레이션:', m1.escalation_required, `(${m1.escalation_level})`);
  console.log('시간 에스컬레이션:', m1.escalation_details.time_escalations.length + '건');
  m1.escalation_details.time_escalations.forEach(e => console.log(`  [${e.level}] ${e.action} (${e.triggerHours}h)`));
  console.log('실패패턴:', m1.escalation_details.failure_patterns.length + '건');
  m1.escalation_details.failure_patterns.forEach(p => console.log(`  ${p.pattern}: ${p.diagnosis}`));
  console.log('수의사:', m1.escalation_details.vet_escalation.needed ? 'YES - ' + m1.escalation_details.vet_escalation.reasons.join(', ') : 'NO');
  console.log('수정 조치:', m1.revised_actions.length + '건');
  m1.revised_actions.forEach(a => console.log(`  [${a.priority}] ${a.action} (${a.reason})`));
  console.log('복구 전략:', m1.recovery_strategy.strategy, `(${m1.recovery_strategy.urgency})`);
  console.log('정책 보정:', m1.policy_adjustments.length + '건');
  console.log('처리시간:', r1.duration_ms + 'ms\n');

  // 테스트 2: 부분 효과 — K3→K2
  console.log('--- 테스트 2: 부분 효과 (K3→K2) ---');
  const r2 = await agent.analyze({
    monitoringResult: {
      result: {
        state_change: { direction: 'improving' },
        action_effectiveness: { overall_score: 0.55 },
        re_alert_needed: { needed: false },
      },
    },
    riskResult: { result: { current_state: 'K2' } },
    hoursElapsed: 12,
    currentContext: { envStatus: 'normal', vetCalled: false },
  });

  console.log('효과:', r2.result.effectiveness_score, `(${r2.result.effectiveness_label})`);
  console.log('복구 전략:', r2.result.recovery_strategy.strategy);
  console.log('수정 조치:', r2.result.revised_actions.length + '건');
  console.log('처리시간:', r2.duration_ms + 'ms\n');

  // 테스트 3: 효과적 — 회복 중
  console.log('--- 테스트 3: 효과적 (회복 중) ---');
  const r3 = await agent.analyze({
    monitoringResult: {
      result: {
        state_change: { direction: 'improving' },
        action_effectiveness: { overall_score: 0.82, kpis: { feeding_recovery: { score: 0.9 } } },
        re_alert_needed: { needed: false },
      },
    },
    riskResult: { result: { current_state: 'K1' } },
    hoursElapsed: 48,
    currentContext: { envStatus: 'normal', vetCalled: false },
  });

  console.log('효과:', r3.result.effectiveness_score, `(${r3.result.effectiveness_label})`);
  console.log('복구 전략:', r3.result.recovery_strategy.strategy);
  console.log('에스컬레이션:', r3.result.escalation_required);
  console.log('처리시간:', r3.duration_ms + 'ms\n');

  // 검증
  console.log('=== 결과 검증 ===');
  const pass =
    m1.plan_adjustment_needed === true &&                   // 실패 시 수정 필요
    m1.escalation_required === true &&                      // 에스컬레이션 발동
    m1.escalation_level === 'critical' &&                   // 긴급 수준
    m1.revised_actions.length >= 3 &&                       // 수정 조치 3건 이상
    m1.recovery_strategy.strategy === 'escalate_full' &&    // 전면 대응
    r2.result.recovery_strategy.strategy === 'supplement' && // 부분효과 → 보완
    r3.result.recovery_strategy.strategy === 'maintain' &&  // 효과적 → 유지
    r3.result.escalation_required === false;                 // 회복 시 에스컬 없음

  console.log('전체 테스트:', pass ? 'PASS ✓' : 'FAIL ✗');
}

runTest().catch(console.error);
