/**
 * Escalation Engine - 조치 에스컬레이션 및 대체 시나리오 엔진
 *
 * 기능:
 * - 실패 사례 패턴 분석
 * - 에스컬레이션 규칙 적용 (위험 지속 시 수위 상향)
 * - 대체 대응 시나리오 검색
 * - 수의사 상향 조건 판단
 * - 정책 보정 및 후속 조치 재추천
 */

class EscalationEngine {
  constructor() {
    // 에스컬레이션 규칙 매트릭스
    // [현재 위험단계][경과 시간대] → 에스컬레이션 조치
    this.rules = {
      K2: {
        12: { action: '모니터링 주기 단축 (12h → 6h)', level: 'soft' },
        24: { action: '수의사 자문 요청', level: 'medium' },
        48: { action: '현장 정밀 점검 시행', level: 'medium' },
      },
      K3: {
        6:  { action: '수의사 현장 방문 요청', level: 'medium' },
        12: { action: '방역 당국 사전 통보', level: 'hard' },
        24: { action: '이동제한 사전 준비', level: 'hard' },
        48: { action: '긴급(K4) 전환 간주 및 전면 대응', level: 'critical' },
      },
      K4: {
        1:  { action: '수의사 미도착 시 재호출', level: 'hard' },
        2:  { action: '방역 당국 긴급 재신고', level: 'critical' },
        6:  { action: '상위 기관(도 방역본부) 보고', level: 'critical' },
        12: { action: '살처분 대비 계획 가동', level: 'critical' },
      },
    };

    // 실패 패턴 DB
    this.failurePatterns = [
      {
        id: 'FP-001',
        pattern: '급이량 미회복 + 환경 정상',
        condition: (ctx) => ctx.feedingRecovery < 0.3 && ctx.envStatus === 'normal',
        diagnosis: '환경 요인 아닌 개체 건강 문제 가능성 높음',
        alternatives: [
          '전 두수 임상 검사 (체온, 호흡, 분변)',
          '시료 채취 및 정밀 검사 (PCR, 혈청)',
          '사료 품질 재검사',
          '급이기 물리적 점검 (막힘, 고장)',
        ],
      },
      {
        id: 'FP-002',
        pattern: '환경 조치 후 미개선',
        condition: (ctx) => ctx.envStatus === 'critical' && ctx.envActionTaken && ctx.hoursElapsed > 6,
        diagnosis: '환기/냉방 시스템 근본 결함 또는 외기 온도 영향',
        alternatives: [
          '이동식 에어컨 추가 설치',
          '사육 밀도 20% 감소 (분산 수용)',
          '안개 분무 시스템 긴급 설치',
          '야간 자연환기 극대화',
        ],
      },
      {
        id: 'FP-003',
        pattern: '격리 후에도 확산 징후',
        condition: (ctx) => ctx.isolationDone && ctx.spreadDetected,
        diagnosis: '격리 범위 부족 또는 교차 오염 경로 존재',
        alternatives: [
          '격리 범위 확대 (인접 돈사 포함)',
          '전 돈사 출입 완전 차단',
          '방역 인력 전용 보호구 착용 의무화',
          '사료/분뇨 이동경로 완전 분리',
        ],
      },
      {
        id: 'FP-004',
        pattern: '사료 교체 후 미개선',
        condition: (ctx) => ctx.feedChanged && ctx.feedingRecovery < 0.5 && ctx.hoursElapsed > 48,
        diagnosis: '사료 문제 아닌 다른 원인 가능성',
        alternatives: [
          '음수 수질 검사',
          '급이기 전수 점검',
          '스트레스 요인 재조사 (소음, 밀도, 온도)',
          '수의사 정밀 진단 요청',
        ],
      },
    ];
  }

  /**
   * 에스컬레이션 필요 여부 판단 및 조치 생성
   *
   * @param {Object} context
   * @param {string} context.riskLevel - 현재 위험단계
   * @param {number} context.hoursElapsed - 최초 경보 후 경과 시간
   * @param {number} context.feedingRecovery - 급이 회복률 (0~1)
   * @param {string} context.envStatus - 환경 상태
   * @param {boolean} context.vetCalled - 수의사 호출 여부
   * @param {Object} context.monitoringResult - Monitoring Agent 결과
   * @returns {Object} 에스컬레이션 결과
   */
  evaluate(context) {
    const { riskLevel, hoursElapsed, monitoringResult } = context;

    // 1. 시간 기반 에스컬레이션 확인
    const timeEscalations = this._checkTimeEscalation(riskLevel, hoursElapsed);

    // 2. 실패 패턴 매칭
    const matchedPatterns = this._matchFailurePatterns(context);

    // 3. 대체 시나리오 구성
    const alternatives = this._buildAlternatives(matchedPatterns, context);

    // 4. 수의사 상향 필요 여부
    const vetEscalation = this._checkVetEscalation(context);

    // 5. 정책 보정 제안
    const policyAdjustments = this._suggestPolicyAdjustments(context, monitoringResult);

    // 전체 에스컬레이션 수준
    const overallLevel = this._determineOverallLevel(timeEscalations, matchedPatterns, vetEscalation);

    return {
      escalation_needed: timeEscalations.length > 0 || matchedPatterns.length > 0,
      overall_level: overallLevel,
      time_escalations: timeEscalations,
      failure_patterns: matchedPatterns,
      alternative_actions: alternatives,
      vet_escalation: vetEscalation,
      policy_adjustments: policyAdjustments,
    };
  }

  /**
   * 시간 기반 에스컬레이션
   */
  _checkTimeEscalation(riskLevel, hoursElapsed) {
    const rules = this.rules[riskLevel];
    if (!rules) return [];

    const triggered = [];
    for (const [hourStr, rule] of Object.entries(rules)) {
      const hour = parseInt(hourStr);
      if (hoursElapsed >= hour) {
        triggered.push({
          triggerHours: hour,
          action: rule.action,
          level: rule.level,
          overdue: hoursElapsed > hour,
          overdueHours: Math.max(0, hoursElapsed - hour),
        });
      }
    }

    return triggered;
  }

  /**
   * 실패 패턴 매칭
   */
  _matchFailurePatterns(context) {
    return this.failurePatterns
      .filter(fp => {
        try { return fp.condition(context); }
        catch { return false; }
      })
      .map(fp => ({
        patternId: fp.id,
        pattern: fp.pattern,
        diagnosis: fp.diagnosis,
        alternatives: fp.alternatives,
      }));
  }

  /**
   * 대체 시나리오 구성
   */
  _buildAlternatives(matchedPatterns, context) {
    const all = [];
    const seen = new Set();

    // 패턴 매칭된 대안
    for (const fp of matchedPatterns) {
      for (const alt of fp.alternatives) {
        if (!seen.has(alt)) {
          seen.add(alt);
          all.push({ action: alt, source: fp.patternId, priority: 'high' });
        }
      }
    }

    // 위험 단계별 기본 대안
    if (context.riskLevel === 'K4' && all.length < 3) {
      const defaults = ['전두수 긴급 PCR 검사', '이동제한 구역 확대', '비상 살처분 계획 수립'];
      defaults.forEach(d => { if (!seen.has(d)) { seen.add(d); all.push({ action: d, source: 'DEFAULT-K4', priority: 'critical' }); } });
    }

    return all.slice(0, 6);
  }

  /**
   * 수의사 상향 조건
   */
  _checkVetEscalation(context) {
    const reasons = [];

    if (['K3', 'K4'].includes(context.riskLevel) && !context.vetCalled) {
      reasons.push('위험/긴급 상태에서 수의사 미호출');
    }
    if (context.hoursElapsed > 12 && context.feedingRecovery < 0.3) {
      reasons.push('12시간 경과 후에도 급이 회복 미흡');
    }
    if (context.riskLevel === 'K4' && context.hoursElapsed > 2 && !context.vetArrived) {
      reasons.push('긴급 상태 2시간 경과, 수의사 미도착');
    }

    return {
      needed: reasons.length > 0,
      urgency: reasons.length >= 2 ? 'critical' : reasons.length === 1 ? 'high' : 'none',
      reasons,
    };
  }

  /**
   * 정책 보정 제안
   */
  _suggestPolicyAdjustments(context, monitoringResult) {
    const suggestions = [];

    // 모니터링 주기 조정
    if (monitoringResult && monitoringResult.action_effectiveness) {
      const score = monitoringResult.action_effectiveness.overall_score;
      if (score < 0.3) {
        suggestions.push({ type: 'monitoring_interval', current: '6시간', suggested: '1시간', reason: '조치 효과 미흡' });
      }
    }

    // 경보 임계값 조정
    if (context.feedingRecovery < 0.2 && context.hoursElapsed > 24) {
      suggestions.push({ type: 'alert_threshold', current: '0.6', suggested: '0.5', reason: '민감도 상향으로 조기 탐지 강화' });
    }

    // 대응 프로세스 개선
    if (context.hoursElapsed > 6 && context.riskLevel === 'K4') {
      suggestions.push({ type: 'response_process', suggestion: '초동 대응 매뉴얼 재검토 필요', reason: '긴급 상태 6시간 초과' });
    }

    return suggestions;
  }

  /**
   * 전체 에스컬레이션 수준
   */
  _determineOverallLevel(timeEscalations, failurePatterns, vetEscalation) {
    if (timeEscalations.some(e => e.level === 'critical') || vetEscalation.urgency === 'critical') return 'critical';
    if (timeEscalations.some(e => e.level === 'hard') || failurePatterns.length >= 2) return 'high';
    if (timeEscalations.length > 0 || failurePatterns.length > 0) return 'medium';
    return 'low';
  }
}

module.exports = { EscalationEngine };
