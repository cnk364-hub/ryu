/**
 * Feature Extractor - 급이 센서 데이터에서 이상탐지용 특징 추출
 *
 * 추출 특징:
 *   1. consumption_kg      - 일일 급이량 (kg)
 *   2. deviation_pct       - 이동평균 대비 편차 (%)
 *   3. slope               - 3일 회귀 기울기 (kg/day)
 *   4. volatility          - 5일 변동계수 (CV)
 *   5. consumption_ratio   - 전일 대비 비율
 *   6. rolling_min_ratio   - 7일 최솟값 / 7일 평균
 */

class FeatureExtractor {
  constructor() {
    this.featureNames = [
      'consumption_kg',
      'deviation_pct',
      'slope',
      'volatility',
      'consumption_ratio',
      'rolling_min_ratio',
    ];
  }

  /**
   * 전체 데이터에서 특징 배열 추출
   * @param {Array} feedingData - 급이 데이터 배열
   * @returns {Array<Array<number>>} 2D 배열 [n x features]
   */
  extractBatch(feedingData) {
    const result = [];
    const consumptions = feedingData.map(d => d.consumption_kg);

    for (let i = 0; i < feedingData.length; i++) {
      const features = this._extractPoint(consumptions, i);
      result.push(features);
    }

    return result;
  }

  /**
   * 최신 데이터 포인트의 특징 추출
   * @param {Array} feedingData
   * @returns {Array<number>} 특징 벡터
   */
  extractLatest(feedingData) {
    const consumptions = feedingData.map(d => d.consumption_kg);
    return this._extractPoint(consumptions, consumptions.length - 1);
  }

  /**
   * 단일 시점 특징 추출
   */
  _extractPoint(consumptions, index) {
    const value = consumptions[index];

    // 1. 급이량
    const consumption = value;

    // 2. 이동평균 대비 편차
    const window7 = consumptions.slice(Math.max(0, index - 6), index + 1);
    const avg7 = this._mean(window7);
    const deviation = avg7 > 0 ? ((value - avg7) / avg7) * 100 : 0;

    // 3. 3일 회귀 기울기
    const window3 = consumptions.slice(Math.max(0, index - 2), index + 1);
    const slope = this._regressionSlope(window3);

    // 4. 5일 변동계수
    const window5 = consumptions.slice(Math.max(0, index - 4), index + 1);
    const mean5 = this._mean(window5);
    const volatility = mean5 > 0 ? this._stddev(window5) / mean5 : 0;

    // 5. 전일 대비 비율
    const prevValue = index > 0 ? consumptions[index - 1] : value;
    const ratio = prevValue > 0 ? value / prevValue : 1;

    // 6. 7일 최솟값 / 7일 평균
    const min7 = Math.min(...window7);
    const minRatio = avg7 > 0 ? min7 / avg7 : 1;

    return [
      Math.round(consumption * 100) / 100,
      Math.round(deviation * 100) / 100,
      Math.round(slope * 100) / 100,
      Math.round(volatility * 1000) / 1000,
      Math.round(ratio * 1000) / 1000,
      Math.round(minRatio * 1000) / 1000,
    ];
  }

  // --- 유틸리티 ---
  _mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  _stddev(arr) {
    if (arr.length < 2) return 0;
    const m = this._mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  }

  _regressionSlope(values) {
    const n = values.length;
    if (n < 2) return 0;
    const xMean = (n - 1) / 2;
    const yMean = this._mean(values);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }
}

module.exports = { FeatureExtractor };
