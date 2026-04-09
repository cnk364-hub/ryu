/**
 * Context Agent (상황인식 에이전트)
 *
 * 역할: 센서 데이터를 분석하여 현재 상황을 인식하고 이상 여부를 판단
 *
 * 입력: 급이 센서 데이터, 환경 센서 데이터
 * 출력: 상황 요약, 위험 지표, 이상 탐지 결과, 데이터 품질 평가
 *
 * 핵심 알고리즘: EIF (Extended Isolation Forest) 이상탐지
 */

const { EIFDetector } = require('./eif-detector');
const { FeatureExtractor } = require('./feature-extractor');
const { SituationAnalyzer } = require('./situation-analyzer');

class ContextAgent {
  constructor(config = {}) {
    this.config = {
      anomalyThreshold: config.anomalyThreshold || 0.6,
      windowDays: config.windowDays || 7,
      minDataPoints: config.minDataPoints || 7,
      ...config,
    };

    this.eif = new EIFDetector({
      nTrees: config.nTrees || 200,
      sampleSize: config.sampleSize || 256,
      extensionLevel: config.extensionLevel || 1,
    });

    this.featureExtractor = new FeatureExtractor();
    this.situationAnalyzer = new SituationAnalyzer();
    this.isTrained = false;
  }

  /**
   * 과거 정상 데이터로 이상탐지 모델 학습
   * @param {Array} historicalData - 과거 급이 데이터 배열
   */
  train(historicalData) {
    if (historicalData.length < this.config.minDataPoints) {
      throw new Error(`최소 ${this.config.minDataPoints}일 이상의 데이터가 필요합니다.`);
    }

    const features = this.featureExtractor.extractBatch(historicalData);
    this.eif.fit(features);
    this.isTrained = true;

    return {
      status: 'trained',
      dataPoints: historicalData.length,
      features: this.featureExtractor.featureNames,
    };
  }

  /**
   * 메인 분석 실행
   * @param {Object} input - { feedingData, environmentData, farmInfo }
   * @returns {Object} Context Agent 분석 결과
   */
  async analyze(input) {
    const { feedingData, environmentData, farmInfo, livestockInfo } = input;
    const startTime = Date.now();

    // livestockInfo 예시:
    // {
    //   breed: 'LYD',              // 품종
    //   headCount: 1200,           // 사육두수
    //   avgWeight: 95,             // 평균 체중 (kg)
    //   avgAge: 150,               // 평균 일령
    //   vaccinationHistory: [...], // 백신 접종 이력
    //   recentMortality: 0.2,      // 최근 폐사율 (%)
    //   feedType: '비육후기사료',    // 사료 종류
    // }

    // 1. 데이터 품질 평가
    const dataQuality = this._assessDataQuality(feedingData, environmentData);

    // 2. 특징 추출
    const features = this.featureExtractor.extractBatch(feedingData);
    const latestFeatures = this.featureExtractor.extractLatest(feedingData);

    // 3. 이상 탐지 실행
    let anomalyResults;
    if (this.isTrained) {
      anomalyResults = this.eif.predict(features);
    } else {
      // 학습 데이터 없으면 통계 기반 탐지 사용
      anomalyResults = this._statisticalDetection(feedingData);
    }

    // 4. 급이 패턴 분석
    const feedingAnalysis = this._analyzeFeedingPattern(feedingData);

    // 5. 환경 분석
    const envAnalysis = this._analyzeEnvironment(environmentData);

    // 6. 개체/사육정보 결합 분석
    const livestockAnalysis = this._analyzeLivestock(livestockInfo, feedingAnalysis);

    // 7. 위험 지표 도출
    const riskIndicators = this._deriveRiskIndicators(
      feedingAnalysis, envAnalysis, anomalyResults, livestockAnalysis
    );

    // 8. 종합 상황 요약 생성
    const situationSummary = this.situationAnalyzer.generateSummary({
      feedingAnalysis,
      envAnalysis,
      anomalyResults,
      riskIndicators,
      livestockAnalysis,
      farmInfo,
    });

    const duration = Date.now() - startTime;

    return {
      agentId: 'context',
      agentName: 'Context Agent (상황인식)',
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      result: {
        situation_summary: situationSummary,
        risk_indicators: riskIndicators.indicators,
        risk_level: riskIndicators.level,
        anomaly_detection: {
          is_anomaly: anomalyResults.isAnomaly,
          anomaly_score: anomalyResults.latestScore,
          anomaly_days: anomalyResults.anomalyDays,
          anomaly_indices: anomalyResults.anomalyIndices,
        },
        feeding_analysis: feedingAnalysis,
        environment_analysis: envAnalysis,
        livestock_analysis: livestockAnalysis,
        data_quality: dataQuality,
      },
    };
  }

  /**
   * 데이터 품질 평가
   */
  _assessDataQuality(feedingData, environmentData) {
    const issues = [];

    // 급이 데이터 검증
    if (!feedingData || feedingData.length === 0) {
      return { score: 'poor', issues: ['급이 데이터 없음'] };
    }
    if (feedingData.length < this.config.minDataPoints) {
      issues.push(`데이터 부족 (${feedingData.length}일 / 최소 ${this.config.minDataPoints}일)`);
    }

    // 결측값 체크
    const missingCount = feedingData.filter(
      d => d.consumption_kg === null || d.consumption_kg === undefined
    ).length;
    if (missingCount > 0) {
      issues.push(`결측값 ${missingCount}건`);
    }

    // 이상치 체크 (물리적 불가능 값)
    const invalidCount = feedingData.filter(
      d => d.consumption_kg < 0 || d.consumption_kg > 1000
    ).length;
    if (invalidCount > 0) {
      issues.push(`비정상 값 ${invalidCount}건 (0 미만 또는 1000kg 초과)`);
    }

    // 환경 데이터 검증
    if (!environmentData) {
      issues.push('환경 센서 데이터 없음');
    }

    const score = issues.length === 0 ? 'good'
      : issues.length <= 1 ? 'fair'
      : 'poor';

    return { score, issues, dataPoints: feedingData.length };
  }

  /**
   * 급이 패턴 분석
   */
  _analyzeFeedingPattern(feedingData) {
    if (feedingData.length < 2) {
      return { changeRate: 0, trend: 'insufficient_data', pattern: 'unknown' };
    }

    const recent3 = feedingData.slice(-3);
    const recent7 = feedingData.slice(-7);
    const older7 = feedingData.slice(-14, -7);

    const avg3 = this._mean(recent3.map(d => d.consumption_kg));
    const avg7 = this._mean(recent7.map(d => d.consumption_kg));
    const avgOlder = older7.length > 0
      ? this._mean(older7.map(d => d.consumption_kg))
      : avg7;

    // 변화율 계산
    const changeRate3d = avgOlder > 0
      ? ((avg3 - avgOlder) / avgOlder) * 100
      : 0;
    const changeRate7d = avgOlder > 0
      ? ((avg7 - avgOlder) / avgOlder) * 100
      : 0;

    // 추세 판단
    const slopes = [];
    for (let i = 1; i < Math.min(feedingData.length, 7); i++) {
      slopes.push(
        feedingData[feedingData.length - i].consumption_kg -
        feedingData[feedingData.length - i - 1].consumption_kg
      );
    }
    const avgSlope = this._mean(slopes);

    let trend;
    if (avgSlope < -5) trend = 'rapid_decline';
    else if (avgSlope < -2) trend = 'gradual_decline';
    else if (avgSlope > 5) trend = 'rapid_increase';
    else if (avgSlope > 2) trend = 'gradual_increase';
    else trend = 'stable';

    // 변동성 분석
    const volatility = this._coefficientOfVariation(
      recent7.map(d => d.consumption_kg)
    );

    // 패턴 분류
    let pattern;
    if (Math.abs(changeRate3d) < 5 && volatility < 0.05) pattern = 'normal';
    else if (changeRate3d < -20) pattern = 'acute_drop';
    else if (changeRate3d < -10) pattern = 'moderate_drop';
    else if (volatility > 0.15) pattern = 'erratic';
    else pattern = 'mild_change';

    return {
      currentAvg: Math.round(avg3 * 10) / 10,
      baselineAvg: Math.round(avgOlder * 10) / 10,
      changeRate3d: Math.round(changeRate3d * 10) / 10,
      changeRate7d: Math.round(changeRate7d * 10) / 10,
      trend,
      volatility: Math.round(volatility * 1000) / 1000,
      avgSlope: Math.round(avgSlope * 100) / 100,
      pattern,
      latestValue: feedingData[feedingData.length - 1].consumption_kg,
      latestDate: feedingData[feedingData.length - 1].date,
    };
  }

  /**
   * 환경 데이터 분석
   */
  _analyzeEnvironment(envData) {
    if (!envData) {
      return { status: 'no_data', alerts: [] };
    }

    const alerts = [];
    const { temperature, humidity, ammonia_ppm, ventilation_status } = envData;

    // THI (Temperature-Humidity Index) 계산 - 돼지용
    const thi = temperature - (0.55 - 0.0055 * humidity) * (temperature - 14.5);

    // 온도 평가
    let tempStatus = 'normal';
    if (temperature > 32) { tempStatus = 'critical'; alerts.push(`축사 온도 ${temperature}°C - 위험 (기준: 28°C 이하)`); }
    else if (temperature > 28) { tempStatus = 'warning'; alerts.push(`축사 온도 ${temperature}°C - 주의 (기준: 28°C 이하)`); }
    else if (temperature < 10) { tempStatus = 'warning'; alerts.push(`축사 온도 ${temperature}°C - 저온 주의`); }

    // 습도 평가
    let humidityStatus = 'normal';
    if (humidity > 80) { humidityStatus = 'critical'; alerts.push(`습도 ${humidity}% - 과습 (기준: 70% 이하)`); }
    else if (humidity > 70) { humidityStatus = 'warning'; alerts.push(`습도 ${humidity}% - 주의`); }

    // 암모니아 평가
    let ammoniaStatus = 'normal';
    if (ammonia_ppm > 25) { ammoniaStatus = 'critical'; alerts.push(`암모니아 ${ammonia_ppm}ppm - 위험 (기준: 25ppm 이하)`); }
    else if (ammonia_ppm > 20) { ammoniaStatus = 'warning'; alerts.push(`암모니아 ${ammonia_ppm}ppm - 주의`); }

    // THI 평가
    let thiStatus = 'normal';
    if (thi > 84) { thiStatus = 'danger'; alerts.push(`THI ${thi.toFixed(1)} - 위험 구간`); }
    else if (thi > 78) { thiStatus = 'caution'; alerts.push(`THI ${thi.toFixed(1)} - 주의 구간`); }

    const overallStatus = alerts.some(a => a.includes('위험')) ? 'critical'
      : alerts.length > 0 ? 'warning' : 'normal';

    return {
      status: overallStatus,
      temperature: { value: temperature, status: tempStatus },
      humidity: { value: humidity, status: humidityStatus },
      ammonia: { value: ammonia_ppm, status: ammoniaStatus },
      thi: { value: Math.round(thi * 10) / 10, status: thiStatus },
      ventilation_status,
      alerts,
    };
  }

  /**
   * 위험 지표 도출
   */
  /**
   * 개체/사육정보 분석
   */
  _analyzeLivestock(livestockInfo, feedingAnalysis) {
    if (!livestockInfo) {
      return { available: false, alerts: [] };
    }

    const alerts = [];
    const { headCount, avgWeight, avgAge, recentMortality, breed } = livestockInfo;

    // 두당 급이량 계산
    let perHeadConsumption = null;
    if (headCount && headCount > 0 && feedingAnalysis.currentAvg) {
      perHeadConsumption = Math.round((feedingAnalysis.currentAvg / headCount) * 100) / 100;

      // 체중 대비 급이 비율 (정상: 체중의 3~5%)
      if (avgWeight && avgWeight > 0) {
        const feedRatio = (perHeadConsumption / avgWeight) * 100;
        if (feedRatio < 2) {
          alerts.push(`두당 급이 비율 ${feedRatio.toFixed(1)}% - 체중 대비 과소 (정상: 3~5%)`);
        } else if (feedRatio > 6) {
          alerts.push(`두당 급이 비율 ${feedRatio.toFixed(1)}% - 체중 대비 과다`);
        }
      }
    }

    // 폐사율 체크
    if (recentMortality !== undefined && recentMortality > 0.5) {
      alerts.push(`최근 폐사율 ${recentMortality}% - 주의 (기준: 0.5% 이하)`);
    }

    // 일령 기반 급이 기대값 대비 분석
    let expectedConsumption = null;
    if (avgAge && avgWeight) {
      // 비육돈 기준 체중별 예상 일일 급이량 (kg/두)
      if (avgWeight < 30) expectedConsumption = 1.0;
      else if (avgWeight < 60) expectedConsumption = 2.0;
      else if (avgWeight < 90) expectedConsumption = 2.8;
      else expectedConsumption = 3.2;

      if (perHeadConsumption && expectedConsumption) {
        const ratio = perHeadConsumption / expectedConsumption;
        if (ratio < 0.7) {
          alerts.push(`두당 급이량 기대값 대비 ${Math.round(ratio * 100)}% (과소)`);
        }
      }
    }

    return {
      available: true,
      breed: breed || 'unknown',
      headCount,
      perHeadConsumption,
      expectedConsumption,
      alerts,
    };
  }

  _deriveRiskIndicators(feedingAnalysis, envAnalysis, anomalyResults, livestockAnalysis) {
    const indicators = [];
    let severityScore = 0;

    // 급이량 변화 기반 지표
    if (feedingAnalysis.changeRate3d < -30) {
      indicators.push(`급이량 ${Math.abs(feedingAnalysis.changeRate3d)}% 급감 (3일)`);
      severityScore += 40;
    } else if (feedingAnalysis.changeRate3d < -15) {
      indicators.push(`급이량 ${Math.abs(feedingAnalysis.changeRate3d)}% 감소 (3일)`);
      severityScore += 20;
    } else if (feedingAnalysis.changeRate3d < -5) {
      indicators.push(`급이량 ${Math.abs(feedingAnalysis.changeRate3d)}% 소폭 감소 (3일)`);
      severityScore += 5;
    }

    // 추세 기반 지표
    if (feedingAnalysis.trend === 'rapid_decline') {
      indicators.push('급이량 급격 하락 추세');
      severityScore += 20;
    }

    // 변동성 기반 지표
    if (feedingAnalysis.volatility > 0.15) {
      indicators.push(`급이 패턴 변동성 높음 (CV: ${(feedingAnalysis.volatility * 100).toFixed(1)}%)`);
      severityScore += 10;
    }

    // 이상탐지 기반 지표
    if (anomalyResults.isAnomaly) {
      indicators.push(`EIF 이상탐지 경보 (점수: ${anomalyResults.latestScore.toFixed(2)})`);
      severityScore += 15;
    }
    if (anomalyResults.anomalyDays >= 3) {
      indicators.push(`${anomalyResults.anomalyDays}일 연속 이상 감지`);
      severityScore += 15;
    }

    // 환경 기반 지표
    if (envAnalysis.alerts) {
      envAnalysis.alerts.forEach(alert => {
        indicators.push(alert);
        severityScore += alert.includes('위험') ? 15 : 5;
      });
    }

    // 개체/사육정보 기반 지표
    if (livestockAnalysis && livestockAnalysis.alerts) {
      livestockAnalysis.alerts.forEach(alert => {
        indicators.push(alert);
        severityScore += alert.includes('과소') ? 10 : 5;
      });
    }

    // 위험 수준 판정
    let level;
    if (severityScore >= 60) level = 'emergency';
    else if (severityScore >= 40) level = 'danger';
    else if (severityScore >= 20) level = 'caution';
    else level = 'normal';

    return {
      indicators,
      level,
      severityScore: Math.min(100, severityScore),
    };
  }

  /**
   * 통계 기반 이상 탐지 (EIF 미학습 시 폴백)
   */
  _statisticalDetection(feedingData) {
    const values = feedingData.map(d => d.consumption_kg);
    const mean = this._mean(values);
    const std = this._stddev(values);

    if (std === 0) {
      return { isAnomaly: false, latestScore: 0, anomalyDays: 0, anomalyIndices: [] };
    }

    const scores = values.map(v => {
      const zScore = Math.abs((v - mean) / std);
      return 1 / (1 + Math.exp(-(1.8 * zScore - 2.0)));
    });

    const threshold = this.config.anomalyThreshold;
    const anomalyIndices = scores
      .map((s, i) => s > threshold ? i : -1)
      .filter(i => i >= 0);

    // 연속 이상일 수 계산
    let anomalyDays = 0;
    for (let i = scores.length - 1; i >= 0; i--) {
      if (scores[i] > threshold) anomalyDays++;
      else break;
    }

    return {
      isAnomaly: scores[scores.length - 1] > threshold,
      latestScore: Math.round(scores[scores.length - 1] * 1000) / 1000,
      scores,
      anomalyDays,
      anomalyIndices,
    };
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

  _coefficientOfVariation(arr) {
    const m = this._mean(arr);
    if (m === 0) return 0;
    return this._stddev(arr) / m;
  }
}

module.exports = { ContextAgent };
