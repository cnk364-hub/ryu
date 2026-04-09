/**
 * Recovery Agent (수정복구 에이전트)
 *
 * 역할: 조치 효과가 미흡하거나 위험이 지속될 경우 대체 대응 및
 *       복구 시나리오를 재수립하여 위험 악화를 방지
 *
 * 핵심 기술: 룰 기반 제어, CBR 재검색
 *
 * 입력: 모니터링 결과, 실패 사례, 현재 위험 상태
 * 출력: 수정 조치안, 복구 전략, 재조치 계획
 */

const { EscalationEngine } = require('./escalation-engine');

class RecoveryAgent {
  constructor(config = {}) {
    this.config = config;
    this.escalationEngine = new EscalationEngine();
    this.llmEndpoint = config.llmEndpoint || null;
  }

  /**
   * 메인 분석 실행
   *
   * @param {Object} input
   * @param {Object} input.monitoringResult - Monitoring Agent 결과
   * @param {Object} input.riskResult - 현재 Risk Trajectory 결과
   * @param {Object} input.executionLog - 실행 이력
   * @param {number} input.hoursElapsed - 최초 경보 후 경과 시간
   * @param {Object} input.currentContext - 현재 상황 (환경, 급이 등)
   * @returns {Object} 복구 계획
   */
  async analyze(input) {
    const { monitoringResult, riskResult, executionLog, hoursElapsed, currentContext } = input;
    const startTime = Date.now();

    const riskLevel = riskResult?.result?.current_state || 'K1';
    const monResult = monitoringResult?.result || {};

    // 1. 에스컬레이션 평가
    const escalation = this.escalationEngine.evaluate({
      riskLevel,
      hoursElapsed: hoursElapsed || 0,
      feedingRecovery: monResult.action_effectiveness?.kpis?.feeding_recovery?.score || 0,
      envStatus: currentContext?.envStatus || 'normal',
      vetCalled: currentContext?.vetCalled || false,
      vetArrived: currentContext?.vetArrived || false,
      isolationDone: currentContext?.isolationDone || false,
      spreadDetected: currentContext?.spreadDetected || false,
      feedChanged: currentContext?.feedChanged || false,
      envActionTaken: currentContext?.envActionTaken || false,
      monitoringResult: monResult,
    });

    // 2. 조치 효과 판정
    const effectiveness = this._assessEffectiveness(monResult);

    // 3. 수정 조치안 생성
    const revisedActions = this._generateRevisedActions(
      effectiveness, escalation, riskLevel, monResult
    );

    // 4. 복구 전략 수립
    const recoveryStrategy = this._buildRecoveryStrategy(
      effectiveness, escalation, riskLevel, hoursElapsed
    );

    // 5. 재조치 계획 (타임라인)
    const reactionPlan = this._buildReactionPlan(revisedActions, escalation, riskLevel);

    const duration = Date.now() - startTime;

    return {
      agentId: 'recovery',
      agentName: 'Recovery Agent (수정복구)',
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      result: {
        effectiveness_score: effectiveness.score,
        effectiveness_label: effectiveness.label,
        plan_adjustment_needed: effectiveness.adjustmentNeeded,
        escalation_required: escalation.escalation_needed,
        escalation_level: escalation.overall_level,
        escalation_details: {
          time_escalations: escalation.time_escalations,
          failure_patterns: escalation.failure_patterns,
          vet_escalation: escalation.vet_escalation,
        },
        revised_actions: revisedActions,
        recovery_strategy: recoveryStrategy,
        reaction_plan: reactionPlan,
        policy_adjustments: escalation.policy_adjustments,
      },
    };
  }

  /**
   * 조치 효과 판정
   */
  _assessEffectiveness(monResult) {
    const score = monResult.action_effectiveness?.overall_score || 0;
    const reAlert = monResult.re_alert_needed?.needed || false;
    const stateDir = monResult.state_change?.direction || 'stable';

    let label, adjustmentNeeded;
    if (score >= 0.7 && stateDir === 'improving') {
      label = '효과적 — 현재 계획 유지';
      adjustmentNeeded = false;
    } else if (score >= 0.4) {
      label = '부분 효과 — 보완 필요';
      adjustmentNeeded = true;
    } else if (score >= 0.2) {
      label = '미흡 — 대안 전략 필요';
      adjustmentNeeded = true;
    } else {
      label = '효과 없음 — 전면 재수립 필요';
      adjustmentNeeded = true;
    }

    return { score, label, adjustmentNeeded, reAlert, stateDirection: stateDir };
  }

  /**
   * 수정 조치안 생성
   */
  _generateRevisedActions(effectiveness, escalation, riskLevel, monResult) {
    const actions = [];

    // 에스컬레이션 조치 추가
    for (const esc of escalation.time_escalations) {
      actions.push({
        action: esc.action,
        priority: esc.level === 'critical' ? 'critical' : esc.level === 'hard' ? 'high' : 'medium',
        source: 'escalation_rule',
        reason: `${esc.triggerHours}시간 경과 기반 에스컬레이션`,
      });
    }

    // 실패 패턴 기반 대안
    for (const alt of escalation.alternative_actions) {
      actions.push({
        action: alt.action,
        priority: alt.priority,
        source: alt.source,
        reason: '실패 패턴 분석 기반 대안',
      });
    }

    // 수의사 에스컬레이션
    if (escalation.vet_escalation.needed) {
      actions.push({
        action: '수의사 ' + (escalation.vet_escalation.urgency === 'critical' ? '긴급 재호출' : '방문 요청'),
        priority: escalation.vet_escalation.urgency === 'critical' ? 'critical' : 'high',
        source: 'vet_escalation',
        reason: escalation.vet_escalation.reasons.join(', '),
      });
    }

    // 조치 효과 미흡 시 기본 보강
    if (effectiveness.score < 0.3 && actions.length < 3) {
      if (riskLevel === 'K4') {
        actions.push({ action: '전두수 긴급 정밀검사 시행', priority: 'critical', source: 'default', reason: '조치 효과 없음' });
      }
      actions.push({ action: '모니터링 주기 1시간으로 단축', priority: 'high', source: 'default', reason: '집중 관찰 필요' });
    }

    // 중복 제거
    const seen = new Set();
    return actions.filter(a => {
      const key = a.action.slice(0, 15);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }

  /**
   * 복구 전략 수립
   */
  _buildRecoveryStrategy(effectiveness, escalation, riskLevel, hoursElapsed) {
    let strategy, description, urgency;

    if (effectiveness.score >= 0.7 && !escalation.escalation_needed) {
      strategy = 'maintain';
      description = '현재 조치 계획이 효과적입니다. 모니터링을 유지하며 정상 회복을 확인합니다.';
      urgency = 'low';
    } else if (effectiveness.score >= 0.4) {
      strategy = 'supplement';
      description = '부분적 효과가 있으나 추가 보강 조치가 필요합니다. 대안 조치를 병행하여 회복을 가속합니다.';
      urgency = 'medium';
    } else if (effectiveness.score >= 0.2 || escalation.overall_level === 'medium') {
      strategy = 'pivot';
      description = '현재 접근이 효과가 낮습니다. 대체 대응 시나리오로 전환하고 원인 재분석이 필요합니다.';
      urgency = 'high';
    } else {
      strategy = 'escalate_full';
      description = '조치 효과가 없으며 상황이 악화되고 있습니다. 상위 기관 보고 및 전면 대응 체계로 전환합니다.';
      urgency = 'critical';
    }

    // 복구 목표 타임라인
    const recoveryTimeline = {
      target24h: riskLevel === 'K4' ? '급이량 10% 회복, 추가 폐사 방지' :
                 riskLevel === 'K3' ? '급이량 30% 회복, K2 전환' :
                 '급이량 정상 범위 회복',
      target48h: '이상점수 0.4 이하 달성',
      target72h: 'K1(정상) 상태 전환 및 경보 해제',
    };

    return { strategy, description, urgency, recoveryTimeline };
  }

  /**
   * 재조치 계획 (시간순 타임라인)
   */
  _buildReactionPlan(revisedActions, escalation, riskLevel) {
    const plan = [];

    // 즉시 (0~1시간)
    const immediate = revisedActions.filter(a => a.priority === 'critical' || a.priority === 'high');
    if (immediate.length > 0) {
      plan.push({
        phase: 'immediate',
        timeframe: '0~1시간',
        actions: immediate.map(a => a.action),
      });
    }

    // 단기 (1~6시간)
    const shortTerm = revisedActions.filter(a => a.priority === 'medium');
    if (shortTerm.length > 0) {
      plan.push({
        phase: 'short_term',
        timeframe: '1~6시간',
        actions: shortTerm.map(a => a.action),
      });
    }

    // 재평가 시점
    plan.push({
      phase: 'reassessment',
      timeframe: riskLevel === 'K4' ? '3시간 후' : riskLevel === 'K3' ? '6시간 후' : '12시간 후',
      actions: ['Monitoring Agent 재실행으로 효과 재평가', '효과 미흡 시 Recovery Agent 재실행'],
    });

    return plan;
  }
}

module.exports = { RecoveryAgent };
