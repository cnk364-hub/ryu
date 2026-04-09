/**
 * Monitoring Agent (관찰 에이전트)
 *
 * 역할: 조치 이후 급이패턴 및 상태 변화를 지속 관찰하여
 *       위험 완화 여부와 조치 효과를 정량적으로 평가
 *
 * 핵심 기술: 시계열 분석, 이상탐지, KPI 기반 효과 평가
 *
 * 입력: 조치 후 LiDAR 재고 데이터, 소모량 시계열, 실행 로그
 * 출력: 상태 변화 결과, 조치 효과, 재경보 여부, 성능 지표
 */

const { KPITracker } = require('./kpi-tracker');

class MonitoringAgent {
  constructor(config = {}) {
    this.config = {
      checkInterval: config.checkInterval || 6,          // 모니터링 주기 (시간)
      recoveryThreshold: config.recoveryThreshold || 0.8, // 회복 판정 기준
      reAlertThreshold: config.reAlertThreshold || 0.6,   // 재경보 기준
      ...config,
    };
    this.kpiTracker = new KPITracker(config.kpiConfig);
    this.monitoringHistory = [];
    this.llmEndpoint = config.llmEndpoint || null;
  }

  /**
   * 메인 분석 실행
   *
   * @param {Object} input
   * @param {Array} input.beforeData - 조치 전 급이 데이터
   * @param {Array} input.afterData - 조치 후 급이 데이터
   * @param {Array} input.beforeScores - 조치 전 이상점수
   * @param {Array} input.afterScores - 조치 후 이상점수
   * @param {string} input.beforeState - 조치 전 위험단계
   * @param {string} input.afterState - 현재 위험단계
   * @param {Object} input.executionLog - 실행 로그
   * @param {number} input.responseTimeHours - 조치 소요시간
   * @returns {Object} 모니터링 결과
   */
  async analyze(input) {
    const startTime = Date.now();
    const { beforeData, afterData, beforeScores, afterScores,
            beforeState, afterState, executionLog, responseTimeHours } = input;

    // 1. KPI 기반 조치 효과 평가
    const kpiResult = this.kpiTracker.evaluate({
      beforeData, afterData, beforeScores, afterScores,
      beforeState, afterState, responseTimeHours,
    });

    // 2. 상태 변화 추적
    const stateChange = this._trackStateChange(beforeState, afterState, beforeData, afterData);

    // 3. 급이패턴 비교 (조치 전/후)
    const patternComparison = this._comparePatterns(beforeData, afterData);

    // 4. 이상점수 재계산 및 추이 분석
    const anomalyTrend = this._analyzeAnomalyTrend(beforeScores, afterScores);

    // 5. 위험단계 하향 여부 확인
    const riskReduction = this._checkRiskReduction(beforeState, afterState);

    // 6. 재경보 필요 여부 판단
    const reAlertNeeded = this._checkReAlert(afterScores, afterState, kpiResult);

    // 7. 경보 해제 판단
    const alertClearable = this._checkAlertClear(afterScores, afterState, kpiResult, patternComparison);

    // 8. 모니터링 성공 기준 확인
    const successCriteria = this._evaluateSuccessCriteria(kpiResult, stateChange, anomalyTrend);

    // 9. 다음 체크 권장
    const nextCheck = this._recommendNextCheck(afterState, reAlertNeeded, kpiResult);

    // 10. 성능 지표 요약
    const performanceMetrics = this._buildPerformanceMetrics(kpiResult, stateChange, anomalyTrend);

    // 기록
    const record = {
      timestamp: new Date().toISOString(),
      beforeState, afterState,
      overallScore: kpiResult.overall_score,
      reAlertNeeded,
    };
    this.monitoringHistory.push(record);

    const duration = Date.now() - startTime;

    return {
      agentId: 'monitoring',
      agentName: 'Monitoring Agent (관찰)',
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      result: {
        state_change: stateChange,
        action_effectiveness: {
          overall_score: kpiResult.overall_score,
          overall_label: kpiResult.overall_label,
          kpis: kpiResult.kpis,
        },
        pattern_comparison: patternComparison,
        anomaly_trend: anomalyTrend,
        re_alert_needed: reAlertNeeded,
        alert_clearable: alertClearable,
        success_criteria: successCriteria,
        next_check: nextCheck,
        performance_metrics: performanceMetrics,
      },
    };
  }

  /**
   * 상태 변화 추적
   */
  _trackStateChange(beforeState, afterState, beforeData, afterData) {
    const stateOrder = { K1: 0, K2: 1, K3: 2, K4: 3 };
    const before = stateOrder[beforeState] !== undefined ? stateOrder[beforeState] : 0;
    const after = stateOrder[afterState] !== undefined ? stateOrder[afterState] : 0;

    let direction, description;
    if (after < before) {
      direction = 'improving';
      description = `위험 ${before - after}단계 완화 (${beforeState} → ${afterState})`;
    } else if (after === before) {
      direction = 'stable';
      description = `위험 수준 유지 (${afterState})`;
    } else {
      direction = 'worsening';
      description = `위험 ${after - before}단계 악화 (${beforeState} → ${afterState})`;
    }

    // 급이량 변화
    let feedingChange = null;
    if (beforeData && afterData && beforeData.length > 0 && afterData.length > 0) {
      const preAvg = this._mean(beforeData.slice(-3).map(d => d.consumption_kg));
      const postAvg = this._mean(afterData.slice(-3).map(d => d.consumption_kg));
      feedingChange = {
        before: Math.round(preAvg * 10) / 10,
        after: Math.round(postAvg * 10) / 10,
        changePct: preAvg > 0 ? Math.round(((postAvg - preAvg) / preAvg) * 100 * 10) / 10 : 0,
      };
    }

    return { beforeState, afterState, direction, description, feedingChange };
  }

  /**
   * 급이패턴 전/후 비교
   */
  _comparePatterns(beforeData, afterData) {
    if (!beforeData || !afterData || beforeData.length < 3 || afterData.length < 3) {
      return { available: false, description: '비교 데이터 부족' };
    }

    const preVals = beforeData.slice(-7).map(d => d.consumption_kg);
    const postVals = afterData.slice(-7).map(d => d.consumption_kg);

    const preMean = this._mean(preVals);
    const postMean = this._mean(postVals);
    const preCV = this._cv(preVals);
    const postCV = this._cv(postVals);
    const preSlope = this._slope(preVals);
    const postSlope = this._slope(postVals);

    return {
      available: true,
      before: { mean: Math.round(preMean * 10) / 10, cv: Math.round(preCV * 1000) / 1000, slope: Math.round(preSlope * 100) / 100 },
      after: { mean: Math.round(postMean * 10) / 10, cv: Math.round(postCV * 1000) / 1000, slope: Math.round(postSlope * 100) / 100 },
      changes: {
        meanChange: Math.round((postMean - preMean) * 10) / 10,
        cvChange: Math.round((postCV - preCV) * 1000) / 1000,
        slopeChange: Math.round((postSlope - preSlope) * 100) / 100,
      },
      description: postMean > preMean
        ? `급이량 평균 ${Math.round(postMean - preMean)}kg 증가, ${postCV < preCV ? '패턴 안정화' : '변동성 지속'}`
        : `급이량 평균 ${Math.round(preMean - postMean)}kg 감소 지속`,
    };
  }

  /**
   * 이상점수 추이 분석
   */
  _analyzeAnomalyTrend(beforeScores, afterScores) {
    if (!afterScores || afterScores.length === 0) {
      return { trend: 'unknown', description: '데이터 부족' };
    }

    const recent = afterScores.slice(-5);
    const slope = this._slope(recent);
    const latestScore = recent[recent.length - 1];
    const avgScore = this._mean(recent);

    let trend;
    if (slope < -0.05) trend = 'decreasing';
    else if (slope > 0.05) trend = 'increasing';
    else trend = 'stable';

    const preAvg = beforeScores && beforeScores.length > 0
      ? this._mean(beforeScores.slice(-3)) : null;

    return {
      trend,
      latestScore: Math.round(latestScore * 1000) / 1000,
      avgScore: Math.round(avgScore * 1000) / 1000,
      slope: Math.round(slope * 1000) / 1000,
      preAvg: preAvg ? Math.round(preAvg * 1000) / 1000 : null,
      improvement: preAvg ? Math.round((preAvg - avgScore) * 1000) / 1000 : null,
      description: trend === 'decreasing' ? '이상점수 감소 추세 (개선 중)' :
        trend === 'increasing' ? '이상점수 증가 추세 (악화 중)' : '이상점수 안정 유지',
    };
  }

  /**
   * 위험단계 하향 확인
   */
  _checkRiskReduction(beforeState, afterState) {
    const order = { K1: 0, K2: 1, K3: 2, K4: 3 };
    const before = order[beforeState] || 0;
    const after = order[afterState] || 0;
    return { reduced: after < before, levels: before - after };
  }

  /**
   * 재경보 필요 여부
   */
  _checkReAlert(afterScores, afterState, kpiResult) {
    if (!afterScores || afterScores.length === 0) return { needed: false, reason: null };

    const latestScore = afterScores[afterScores.length - 1];
    const reasons = [];

    // 이상점수가 여전히 높음
    if (latestScore > this.config.reAlertThreshold) {
      reasons.push(`이상점수 ${latestScore.toFixed(2)} > 기준 ${this.config.reAlertThreshold}`);
    }

    // 조치 효과 미흡
    if (kpiResult.overall_score < 0.3) {
      reasons.push(`조치 효과 점수 ${kpiResult.overall_score} (미흡)`);
    }

    // 위험단계 미하향
    if (['K3', 'K4'].includes(afterState)) {
      reasons.push(`위험단계 ${afterState} 지속`);
    }

    return {
      needed: reasons.length > 0,
      reasons,
      urgency: reasons.length >= 2 ? 'high' : reasons.length === 1 ? 'medium' : 'low',
    };
  }

  /**
   * 경보 해제 판단
   */
  _checkAlertClear(afterScores, afterState, kpiResult, patternComparison) {
    if (!afterScores || afterScores.length < 3) return { clearable: false, reason: '데이터 부족' };

    const recent3 = afterScores.slice(-3);
    const allBelowThreshold = recent3.every(s => s < 0.4);
    const stateNormal = afterState === 'K1' || afterState === 'normal';
    const goodEffect = kpiResult.overall_score >= 0.7;
    const stablePattern = patternComparison.available && patternComparison.after.cv < 0.05;

    const conditions = [
      { met: allBelowThreshold, label: '이상점수 3일 연속 정상' },
      { met: stateNormal, label: '위험단계 정상(K1)' },
      { met: goodEffect, label: '조치 효과 70% 이상' },
    ];

    const metCount = conditions.filter(c => c.met).length;
    const clearable = metCount >= 2;

    return {
      clearable,
      conditions,
      metCount,
      description: clearable ? '경보 해제 조건 충족' : `경보 해제 조건 미충족 (${metCount}/3)`,
    };
  }

  /**
   * 성공 기준 평가
   */
  _evaluateSuccessCriteria(kpiResult, stateChange, anomalyTrend) {
    const criteria = [
      {
        name: '급이량 80% 이상 회복',
        target: 80,
        current: kpiResult.kpis.feeding_recovery.value,
        unit: '%',
        met: kpiResult.kpis.feeding_recovery.value >= 80,
      },
      {
        name: '이상점수 감소 추세',
        target: 'decreasing',
        current: anomalyTrend.trend,
        met: anomalyTrend.trend === 'decreasing' || anomalyTrend.latestScore < 0.4,
      },
      {
        name: '위험단계 하향',
        target: '1단계 이상 개선',
        current: stateChange.direction,
        met: stateChange.direction === 'improving',
      },
      {
        name: '변동성 안정화',
        target: '5% 이하',
        current: kpiResult.kpis.volatility_stability.postCV,
        unit: 'CV',
        met: kpiResult.kpis.volatility_stability.score >= 0.5,
      },
    ];

    const metCount = criteria.filter(c => c.met).length;

    return {
      criteria,
      metCount,
      totalCount: criteria.length,
      overallMet: metCount >= 3,
      description: `성공 기준 ${metCount}/${criteria.length} 충족`,
    };
  }

  /**
   * 다음 체크 권장
   */
  _recommendNextCheck(afterState, reAlert, kpiResult) {
    let intervalHours;
    let reason;

    if (reAlert.needed && reAlert.urgency === 'high') {
      intervalHours = 1;
      reason = '재경보 발생 — 긴급 재확인 필요';
    } else if (['K4', 'K3'].includes(afterState)) {
      intervalHours = 3;
      reason = '위험 상태 지속 — 단축 모니터링';
    } else if (kpiResult.overall_score < 0.5) {
      intervalHours = 6;
      reason = '조치 효과 미흡 — 강화 모니터링';
    } else if (['K2'].includes(afterState)) {
      intervalHours = 12;
      reason = '주의 상태 — 일반 모니터링';
    } else {
      intervalHours = 24;
      reason = '정상 — 정기 모니터링';
    }

    return {
      intervalHours,
      reason,
      nextCheckAt: new Date(Date.now() + intervalHours * 3600000).toISOString(),
    };
  }

  /**
   * 성능 지표 요약
   */
  _buildPerformanceMetrics(kpiResult, stateChange, anomalyTrend) {
    return {
      effectiveness_score: kpiResult.overall_score,
      effectiveness_label: kpiResult.overall_label,
      state_direction: stateChange.direction,
      anomaly_trend: anomalyTrend.trend,
      feeding_recovery_pct: kpiResult.kpis.feeding_recovery.value,
      risk_change: kpiResult.kpis.risk_level_change.change,
    };
  }

  // --- 유틸리티 ---
  _mean(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  _cv(arr) { const m = this._mean(arr); return m > 0 ? this._stddev(arr) / m : 0; }
  _stddev(arr) { if (arr.length < 2) return 0; const m = this._mean(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); }
  _slope(vals) {
    const n = vals.length; if (n < 2) return 0;
    const xm = (n - 1) / 2, ym = this._mean(vals);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - xm) * (vals[i] - ym); den += (i - xm) ** 2; }
    return den === 0 ? 0 : num / den;
  }
}

module.exports = { MonitoringAgent };
