/**
 * State Machine - 파이프라인 상태 머신
 *
 * 7개 에이전트의 실행 흐름을 상태 머신으로 관리
 *
 * 상태 전이:
 *   IDLE → CONTEXT → RISK → PLANNING → EXECUTION → MONITORING → RECOVERY → COMPLETE
 *                                                       ↑              |
 *                                                       └──────────────┘ (루프)
 *
 * 조건부 분기:
 *   - MONITORING 후 회복 → COMPLETE
 *   - MONITORING 후 미흡 → RECOVERY → MONITORING (루프)
 *   - 사람 확인 필요 → HUMAN_REVIEW
 */

class StateMachine {
  constructor() {
    this.states = {
      IDLE:        { next: 'CONTEXT',    agent: null },
      CONTEXT:     { next: 'RISK',       agent: 'context' },
      RISK:        { next: 'PLANNING',   agent: 'risk_trajectory' },
      PLANNING:    { next: 'EXECUTION',  agent: 'planning' },
      EXECUTION:   { next: 'MONITORING', agent: 'execution' },
      MONITORING:  { next: null,         agent: 'monitoring' },      // 조건부 분기
      RECOVERY:    { next: 'MONITORING', agent: 'recovery' },        // 루프백
      HUMAN_REVIEW:{ next: null,         agent: null },              // 사람 개입
      COMPLETE:    { next: null,         agent: null },
      ERROR:       { next: null,         agent: null },
    };

    this.currentState = 'IDLE';
    this.history = [];
    this.loopCount = 0;
    this.maxLoops = 3;  // 최대 모니터링-복구 반복 횟수
  }

  /**
   * 현재 상태 조회
   */
  getState() {
    return {
      current: this.currentState,
      agent: this.states[this.currentState]?.agent,
      history: this.history,
      loopCount: this.loopCount,
    };
  }

  /**
   * 다음 상태로 전이
   * @param {Object} context - 전이 조건 판단용 컨텍스트
   * @returns {Object} 전이 결과
   */
  transition(context = {}) {
    const prevState = this.currentState;
    let nextState;
    let reason;

    switch (this.currentState) {
      case 'IDLE':
        nextState = 'CONTEXT';
        reason = '파이프라인 시작';
        break;

      case 'CONTEXT':
      case 'RISK':
      case 'PLANNING':
      case 'EXECUTION':
        nextState = this.states[this.currentState].next;
        reason = '순차 실행';
        break;

      case 'MONITORING': {
        const result = this._evaluateMonitoringResult(context);
        nextState = result.nextState;
        reason = result.reason;
        if (nextState === 'RECOVERY') this.loopCount++;
        break;
      }

      case 'RECOVERY':
        nextState = 'MONITORING';
        reason = '복구 후 재모니터링';
        break;

      case 'HUMAN_REVIEW':
        if (context.humanApproved) {
          nextState = context.resumeState || 'MONITORING';
          reason = '관리자 승인 후 재개';
        } else if (context.humanRejected) {
          nextState = 'COMPLETE';
          reason = '관리자 종료 결정';
        } else {
          nextState = 'HUMAN_REVIEW';
          reason = '관리자 확인 대기 중';
        }
        break;

      default:
        nextState = 'COMPLETE';
        reason = '종료';
    }

    this.history.push({
      from: prevState,
      to: nextState,
      reason,
      timestamp: new Date().toISOString(),
      loopCount: this.loopCount,
    });

    this.currentState = nextState;

    return {
      previousState: prevState,
      currentState: nextState,
      agent: this.states[nextState]?.agent,
      reason,
      isComplete: nextState === 'COMPLETE',
      isHumanReview: nextState === 'HUMAN_REVIEW',
      loopCount: this.loopCount,
    };
  }

  /**
   * 모니터링 결과 기반 분기 판단
   */
  _evaluateMonitoringResult(context) {
    const { monitoringResult, riskLevel } = context;
    const effectiveness = monitoringResult?.action_effectiveness?.overall_score || 0;
    const alertClearable = monitoringResult?.alert_clearable?.clearable || false;
    const reAlertNeeded = monitoringResult?.re_alert_needed?.needed || false;

    // 경보 해제 가능 → 완료
    if (alertClearable && effectiveness >= 0.7) {
      return { nextState: 'COMPLETE', reason: '경보 해제 조건 충족 — 정상 회복' };
    }

    // 정상 상태 + 효과적 → 완료
    if ((riskLevel === 'K1' || riskLevel === 'normal') && effectiveness >= 0.6) {
      return { nextState: 'COMPLETE', reason: '정상 상태 회복' };
    }

    // 최대 루프 초과 → 사람 확인
    if (this.loopCount >= this.maxLoops) {
      return { nextState: 'HUMAN_REVIEW', reason: `최대 반복(${this.maxLoops}회) 초과 — 관리자 확인 필요` };
    }

    // K4 긴급 + 효과 없음 → 사람 확인
    if (riskLevel === 'K4' && effectiveness < 0.2) {
      return { nextState: 'HUMAN_REVIEW', reason: '긴급 상태에서 조치 효과 없음 — 관리자 판단 필요' };
    }

    // 재경보 또는 미흡 → Recovery 루프
    if (reAlertNeeded || effectiveness < 0.5) {
      return { nextState: 'RECOVERY', reason: '조치 효과 미흡 — 복구 에이전트 실행' };
    }

    // 부분 효과 → 한 번 더 모니터링 (Recovery 경유)
    return { nextState: 'RECOVERY', reason: '추가 보완 필요' };
  }

  /**
   * 강제 상태 설정 (에러 복구 등)
   */
  forceState(state, reason) {
    const prev = this.currentState;
    this.currentState = state;
    this.history.push({ from: prev, to: state, reason: `[FORCE] ${reason}`, timestamp: new Date().toISOString() });
  }

  /**
   * 리셋
   */
  reset() {
    this.currentState = 'IDLE';
    this.history = [];
    this.loopCount = 0;
  }
}

module.exports = { StateMachine };
