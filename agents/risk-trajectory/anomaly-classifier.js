/**
 * Anomaly Classifier - 이상 유형 분류기
 *
 * Rule + Pattern Logic 기반으로 이상의 원인을 분류:
 *   - 질병 (disease): 급이량 급감 + 지속성 + 계절/지역 위험
 *   - 사료 문제 (feed): 급이량 변동 + 사료 교체/품질 이력
 *   - 환경 스트레스 (environment): 온도/습도 이상 + 급이 영향
 *   - 계절 변동 (seasonal): 주기적 패턴 + 완만한 변화
 *   - 장비 오류 (equipment): 급격한 불연속 + 빠른 복귀
 *   - 복합 (mixed): 여러 요인 동시 발생
 */

class AnomalyClassifier {
  constructor() {
    // 분류 규칙 가중치
    this.rules = {
      disease: {
        feedingDropRate: 0.30,     // 급이량 감소율 기여도
        persistence: 0.25,         // 지속일수 기여도
        volatility: 0.15,          // 변동성 기여도
        envNormal: 0.10,           // 환경 정상 시 질병 가능성↑
        mortalityRise: 0.20,       // 폐사율 상승
      },
      environment: {
        tempAnomaly: 0.35,         // 온도 이상
        humidityAnomaly: 0.25,     // 습도 이상
        thiAnomaly: 0.20,          // THI 이상
        ventilation: 0.20,         // 환기 이상
      },
      feed: {
        suddenChange: 0.30,        // 급작스런 변화 후 안정
        partialRecovery: 0.25,     // 부분 회복
        erraticPattern: 0.25,      // 불규칙 패턴
        noEnvCorrelation: 0.20,    // 환경과 무관
      },
      seasonal: {
        gradualChange: 0.35,       // 완만한 변화
        cyclicPattern: 0.30,       // 주기적 패턴
        lowVolatility: 0.20,       // 낮은 변동성
        seasonMatch: 0.15,         // 계절 일치
      },
      equipment: {
        sharpDiscontinuity: 0.40,  // 급격한 불연속
        quickRecovery: 0.30,       // 빠른 복귀
        singlePoint: 0.30,         // 단일 지점 이상
      },
    };
  }

  /**
   * 이상 유형 분류 실행
   *
   * @param {Object} params
   * @param {Object} params.feedingAnalysis - 급이 패턴 분석 결과
   * @param {Object} params.envAnalysis - 환경 분석 결과
   * @param {Object} params.anomalyResult - 이상탐지 결과
   * @param {Object} params.livestockInfo - 개체/사육 정보 (선택)
   * @param {string} params.season - 현재 계절 ('spring'|'summer'|'fall'|'winter')
   * @returns {Object} 분류 결과
   */
  classify(params) {
    const { feedingAnalysis, envAnalysis, anomalyResult, livestockInfo, season } = params;

    // 각 유형별 점수 계산
    const scores = {
      disease: this._scoreDiseaseType(feedingAnalysis, envAnalysis, anomalyResult, livestockInfo),
      environment: this._scoreEnvironmentType(feedingAnalysis, envAnalysis),
      feed: this._scoreFeedType(feedingAnalysis, envAnalysis, anomalyResult),
      seasonal: this._scoreSeasonalType(feedingAnalysis, season),
      equipment: this._scoreEquipmentType(feedingAnalysis, anomalyResult),
    };

    // 점수 정규화 (합 = 1)
    const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
    const probabilities = {};
    for (const key in scores) {
      probabilities[key] = Math.round((scores[key] / total) * 100) / 100;
    }

    // 최고 점수 유형 선택
    let primaryType = 'unknown';
    let maxScore = 0;
    for (const key in probabilities) {
      if (probabilities[key] > maxScore) {
        maxScore = probabilities[key];
        primaryType = key;
      }
    }

    // 복합 유형 판정: 2개 이상이 0.25 이상이면 mixed
    const significantTypes = Object.entries(probabilities)
      .filter(([, v]) => v >= 0.25)
      .map(([k]) => k);
    if (significantTypes.length >= 2) {
      primaryType = 'mixed';
    }

    return {
      primary_type: primaryType,
      primary_type_label: this._typeLabel(primaryType),
      probabilities,
      significant_factors: significantTypes,
      description: this._generateDescription(primaryType, probabilities, feedingAnalysis, envAnalysis),
      confidence: maxScore,
    };
  }

  /**
   * 질병 유형 점수
   */
  _scoreDiseaseType(feeding, env, anomaly, livestock) {
    let score = 0;

    // 급이량 급감 (20% 이상 감소 → 높은 점수)
    if (feeding.changeRate3d < -25) score += 0.9;
    else if (feeding.changeRate3d < -15) score += 0.5;
    else if (feeding.changeRate3d < -5) score += 0.1;

    // 지속성 (연속 감소일수)
    if (feeding.trend === 'rapid_decline') score += 0.8;
    else if (feeding.trend === 'gradual_decline') score += 0.4;

    // 패턴: 급성 급이량 감소
    if (feeding.pattern === 'acute_drop') score += 0.7;

    // 환경이 정상인데 급이 이상 → 질병 가능성↑
    if (env && env.status === 'normal') score += 0.3;

    // 폐사율 상승
    if (livestock && livestock.recentMortality > 0.5) score += 0.6;
    if (livestock && livestock.recentMortality > 1.0) score += 0.4;

    return score;
  }

  /**
   * 환경 스트레스 유형 점수
   */
  _scoreEnvironmentType(feeding, env) {
    let score = 0;
    if (!env) return 0;

    if (env.temperature && env.temperature.status === 'critical') score += 0.9;
    else if (env.temperature && env.temperature.status === 'warning') score += 0.4;

    if (env.humidity && env.humidity.status === 'critical') score += 0.7;
    else if (env.humidity && env.humidity.status === 'warning') score += 0.3;

    if (env.thi && env.thi.status === 'danger') score += 0.8;
    else if (env.thi && env.thi.status === 'caution') score += 0.4;

    if (env.ventilation_status === 'critical') score += 0.6;

    // 급이 변화가 완만하면 환경 요인 가능성
    if (feeding.changeRate3d > -10 && feeding.trend !== 'rapid_decline') {
      score += 0.2;
    }

    return score;
  }

  /**
   * 사료 문제 유형 점수
   */
  _scoreFeedType(feeding, env, anomaly) {
    let score = 0;

    // 불규칙 패턴
    if (feeding.pattern === 'erratic') score += 0.8;

    // 높은 변동성 + 완만한 하락
    if (feeding.volatility > 0.1 && Math.abs(feeding.changeRate3d) < 15) score += 0.5;

    // 환경 정상 + 급이 이상
    if (env && env.status === 'normal' && Math.abs(feeding.changeRate3d) > 5) score += 0.3;

    // 급격한 변화 후 부분 회복 패턴
    if (feeding.pattern === 'moderate_drop' && feeding.trend !== 'rapid_decline') score += 0.4;

    return score;
  }

  /**
   * 계절 변동 유형 점수
   */
  _scoreSeasonalType(feeding, season) {
    let score = 0;

    // 완만한 변화
    if (feeding.trend === 'stable' || feeding.trend === 'gradual_decline') score += 0.4;

    // 낮은 변동성
    if (feeding.volatility < 0.05) score += 0.5;

    // 계절 일치 (여름: 급이 감소, 겨울: 급이 증가 경향)
    if (season === 'summer' && feeding.changeRate3d < 0 && feeding.changeRate3d > -10) score += 0.6;
    if (season === 'winter' && feeding.changeRate3d > 0 && feeding.changeRate3d < 10) score += 0.5;

    // 소폭 변화
    if (Math.abs(feeding.changeRate3d) < 8) score += 0.3;

    return score;
  }

  /**
   * 장비 오류 유형 점수
   */
  _scoreEquipmentType(feeding, anomaly) {
    let score = 0;

    // 이상 일수가 1~2일 (단발성)
    if (anomaly && anomaly.anomalyDays <= 2 && anomaly.isAnomaly) score += 0.7;

    // 급격한 변화 + 짧은 지속
    if (Math.abs(feeding.changeRate3d) > 30 && feeding.volatility > 0.15) score += 0.5;

    // 변동성 매우 높음 (센서 오류 특성)
    if (feeding.volatility > 0.20) score += 0.4;

    return score;
  }

  /**
   * 유형 라벨
   */
  _typeLabel(type) {
    const labels = {
      disease: '질병 의심',
      environment: '환경 스트레스',
      feed: '사료 문제',
      seasonal: '계절 변동',
      equipment: '장비 오류/센서 이상',
      mixed: '복합 요인',
      unknown: '분류 불가',
    };
    return labels[type] || type;
  }

  /**
   * 분류 결과 설명 생성
   */
  _generateDescription(type, probs, feeding, env) {
    switch (type) {
      case 'disease':
        return `급이량이 ${Math.abs(feeding.changeRate3d)}% 감소하고 ${feeding.trend === 'rapid_decline' ? '급격한' : '지속적인'} 하락 추세를 보여 질병 감염이 의심됩니다. 환경 요인보다 개체 건강 상태 확인이 우선됩니다.`;
      case 'environment':
        return `축사 환경 이상(${env && env.alerts ? env.alerts.length + '건' : ''})이 급이 변화의 주요 원인으로 판단됩니다. 환경 제어 조치가 우선됩니다.`;
      case 'feed':
        return `급이 패턴의 불규칙성이 사료 품질 또는 급이 시스템 문제를 시사합니다. 사료 교체 이력 및 급이기 점검이 필요합니다.`;
      case 'seasonal':
        return `현재 급이 변화가 계절적 정상 변동 범위 내에 있는 것으로 판단됩니다. 지속적인 모니터링을 권장합니다.`;
      case 'equipment':
        return `급격하고 단발적인 데이터 변동으로 센서 또는 급이 장비 오류 가능성이 있습니다. 장비 점검이 필요합니다.`;
      case 'mixed':
        const factors = Object.entries(probs).filter(([, v]) => v >= 0.25).map(([k]) => this._typeLabel(k));
        return `${factors.join(', ')} 등 복합적 요인이 관여하고 있습니다. 종합적인 점검이 필요합니다.`;
      default:
        return '충분한 데이터가 확보되지 않아 분류가 어렵습니다.';
    }
  }
}

module.exports = { AnomalyClassifier };
