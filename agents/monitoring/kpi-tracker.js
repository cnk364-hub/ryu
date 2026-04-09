/**
 * KPI Tracker - 조치 효과 정량화 엔진
 *
 * 조치 전/후 급이패턴을 비교하고 KPI 기반으로 효과를 정량 평가
 *
 * KPI 지표:
 *   1. 급이량 회복률 (%)
 *   2. 이상점수 변화량
 *   3. 변동성 안정화율
 *   4. 위험단계 변화 (K4→K3→K2→K1)
 *   5. 조치 소요시간 대비 효과
 */

class KPITracker {
  constructor(config = {}) {
    this.config = {
      recoveryThreshold: config.recoveryThreshold || 0.8,   // 회복 판정 기준 (80%)
      stabilityWindow: config.stabilityWindow || 3,          // 안정화 판단 윈도우 (일)
      ...config,
    };

    // KPI 가중치
    this.kpiWeights = {
      feedingRecovery: 0.30,
      anomalyReduction: 0.25,
      volatilityStability: 0.15,
      riskLevelChange: 0.20,
      responseEfficiency: 0.10,
    };
  }

  /**
   * 조치 전/후 비교 분석
   *
   * @param {Object} params
   * @param {Array} params.beforeData - 조치 전 급이 데이터
   * @param {Array} params.afterData - 조치 후 급이 데이터
   * @param {Array} params.beforeScores - 조치 전 이상점수
   * @param {Array} params.afterScores - 조치 후 이상점수
   * @param {string} params.beforeState - 조치 전 위험단계
   * @param {string} params.afterState - 조치 후 위험단계
   * @param {number} params.responseTimeHours - 조치 소요시간
   * @returns {Object} KPI 평가 결과
   */
  evaluate(params) {
    const { beforeData, afterData, beforeScores, afterScores,
            beforeState, afterState, responseTimeHours } = params;

    // 1. 급이량 회복률
    const feedingRecovery = this._calcFeedingRecovery(beforeData, afterData);

    // 2. 이상점수 변화
    const anomalyChange = this._calcAnomalyChange(beforeScores, afterScores);

    // 3. 변동성 안정화율
    const volatilityStability = this._calcVolatilityStability(beforeData, afterData);

    // 4. 위험단계 변화
    const riskChange = this._calcRiskLevelChange(beforeState, afterState);

    // 5. 대응 효율성
    const responseEfficiency = this._calcResponseEfficiency(responseTimeHours, beforeState);

    // 종합 효과 점수 (0~1)
    const overallScore =
      this.kpiWeights.feedingRecovery * feedingRecovery.score +
      this.kpiWeights.anomalyReduction * anomalyChange.score +
      this.kpiWeights.volatilityStability * volatilityStability.score +
      this.kpiWeights.riskLevelChange * riskChange.score +
      this.kpiWeights.responseEfficiency * responseEfficiency.score;

    return {
      overall_score: Math.round(overallScore * 100) / 100,
      overall_label: this._scoreLabel(overallScore),
      kpis: {
        feeding_recovery: feedingRecovery,
        anomaly_reduction: anomalyChange,
        volatility_stability: volatilityStability,
        risk_level_change: riskChange,
        response_efficiency: responseEfficiency,
      },
    };
  }

  /**
   * 급이량 회복률
   */
  _calcFeedingRecovery(beforeData, afterData) {
    if (!beforeData || !afterData || beforeData.length === 0 || afterData.length === 0) {
      return { score: 0, value: 0, unit: '%', description: '데이터 부족' };
    }

    // 조치 전 정상 기준선 (가장 이른 데이터의 평균)
    const normalBaseline = this._mean(beforeData.slice(0, Math.min(7, beforeData.length)).map(d => d.consumption_kg));

    // 조치 전 최저점
    const preBottom = Math.min(...beforeData.slice(-3).map(d => d.consumption_kg));

    // 조치 후 최근 평균
    const postAvg = this._mean(afterData.slice(-3).map(d => d.consumption_kg));

    // 회복률 = (조치 후 - 최저점) / (정상 기준 - 최저점)
    const drop = normalBaseline - preBottom;
    const recoveryRate = drop > 0 ? Math.min(1, (postAvg - preBottom) / drop) : (postAvg >= normalBaseline ? 1 : 0);
    const recoveryPct = Math.round(recoveryRate * 100);

    return {
      score: Math.max(0, Math.min(1, recoveryRate)),
      value: recoveryPct,
      unit: '%',
      normalBaseline: Math.round(normalBaseline * 10) / 10,
      preBottom: Math.round(preBottom * 10) / 10,
      postAvg: Math.round(postAvg * 10) / 10,
      description: recoveryPct >= 80 ? '급이량 정상 회복' :
        recoveryPct >= 50 ? '부분 회복 중' : '회복 미흡',
    };
  }

  /**
   * 이상점수 변화량
   */
  _calcAnomalyChange(beforeScores, afterScores) {
    if (!beforeScores || !afterScores || beforeScores.length === 0 || afterScores.length === 0) {
      return { score: 0, value: 0, description: '데이터 부족' };
    }

    const preAvg = this._mean(beforeScores.slice(-3));
    const postAvg = this._mean(afterScores.slice(-3));
    const reduction = preAvg - postAvg;

    // 점수가 많이 줄었을수록 좋음
    const score = preAvg > 0 ? Math.max(0, Math.min(1, reduction / preAvg)) : (postAvg < 0.3 ? 1 : 0);

    return {
      score,
      value: Math.round(reduction * 1000) / 1000,
      preAvg: Math.round(preAvg * 1000) / 1000,
      postAvg: Math.round(postAvg * 1000) / 1000,
      description: reduction > 0.3 ? '이상점수 크게 감소' :
        reduction > 0.1 ? '이상점수 소폭 감소' :
        reduction > 0 ? '이상점수 미세 개선' : '이상점수 미개선 또는 악화',
    };
  }

  /**
   * 변동성 안정화율
   */
  _calcVolatilityStability(beforeData, afterData) {
    if (!beforeData || !afterData || beforeData.length < 3 || afterData.length < 3) {
      return { score: 0.5, value: 0, description: '데이터 부족' };
    }

    const preVals = beforeData.slice(-5).map(d => d.consumption_kg);
    const postVals = afterData.slice(-5).map(d => d.consumption_kg);

    const preCV = this._cv(preVals);
    const postCV = this._cv(postVals);

    // 변동성이 줄었으면 좋음
    const improvement = preCV > 0 ? Math.max(0, (preCV - postCV) / preCV) : (postCV < 0.05 ? 1 : 0.5);
    const score = Math.min(1, improvement);

    return {
      score,
      value: Math.round(improvement * 100),
      preCV: Math.round(preCV * 1000) / 1000,
      postCV: Math.round(postCV * 1000) / 1000,
      description: postCV < 0.05 ? '패턴 안정화됨' :
        improvement > 0.3 ? '변동성 감소 중' : '변동성 지속',
    };
  }

  /**
   * 위험단계 변화
   */
  _calcRiskLevelChange(beforeState, afterState) {
    const stateOrder = { K1: 0, K2: 1, K3: 2, K4: 3, normal: 0, caution: 1, danger: 2, emergency: 3 };
    const before = stateOrder[beforeState] !== undefined ? stateOrder[beforeState] : 2;
    const after = stateOrder[afterState] !== undefined ? stateOrder[afterState] : 2;

    const change = before - after; // 양수 = 개선
    const score = change > 0 ? Math.min(1, change / 3) : (change === 0 ? 0.3 : 0);

    const labels = { 0: '정상(K1)', 1: '주의(K2)', 2: '위험(K3)', 3: '긴급(K4)' };

    return {
      score,
      before: beforeState,
      after: afterState,
      change: change > 0 ? `${change}단계 개선` : change === 0 ? '변화 없음' : `${Math.abs(change)}단계 악화`,
      description: change >= 2 ? '위험 크게 완화' :
        change === 1 ? '위험 1단계 완화' :
        change === 0 ? '위험 수준 유지' : '위험 악화',
    };
  }

  /**
   * 대응 효율성 (소요시간 기반)
   */
  _calcResponseEfficiency(responseTimeHours, riskLevel) {
    if (!responseTimeHours) return { score: 0.5, value: null, description: '시간 데이터 없음' };

    // 위험 단계별 권장 대응 시간
    const targetHours = { K4: 1, K3: 4, K2: 12, K1: 24, emergency: 1, danger: 4, caution: 12, normal: 24 };
    const target = targetHours[riskLevel] || 12;

    const ratio = target / Math.max(responseTimeHours, 0.1);
    const score = Math.min(1, ratio);

    return {
      score,
      value: responseTimeHours,
      targetHours: target,
      unit: '시간',
      description: responseTimeHours <= target ? `권장시간(${target}h) 내 대응 완료` :
        `권장시간(${target}h) 초과 (${responseTimeHours}h 소요)`,
    };
  }

  // --- 유틸리티 ---
  _mean(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

  _stddev(arr) {
    if (arr.length < 2) return 0;
    const m = this._mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  }

  _cv(arr) {
    const m = this._mean(arr);
    return m > 0 ? this._stddev(arr) / m : 0;
  }

  _scoreLabel(score) {
    if (score >= 0.8) return '매우 효과적';
    if (score >= 0.6) return '효과적';
    if (score >= 0.4) return '부분 효과';
    if (score >= 0.2) return '미흡';
    return '효과 없음';
  }
}

module.exports = { KPITracker };
