/**
 * Risk Trajectory Agent (위험궤적분석 에이전트)
 *
 * 역할: 이상 징후의 시간적 전이를 분석하여 질병 위험 진행을 추적하고
 *       단계별 위험도를 추정
 *
 * 핵심 알고리즘: HMM (Hidden Markov Model)
 *
 * 입력: 이상점수 시계열, 상태 시퀀스, 과거 질병/이상 이력
 * 출력: 위험 단계, 전이 확률, 위험 궤적, 단기 예측 상태
 */

const { HMM } = require('./hmm');
const { TrajectoryVisualizer } = require('./trajectory-visualizer');
const { AnomalyClassifier } = require('./anomaly-classifier');

class RiskTrajectoryAgent {
  constructor(config = {}) {
    this.config = {
      predictionHorizon: config.predictionHorizon || 7,   // 미래 예측 일수
      persistenceWeight: config.persistenceWeight || 0.3,  // 상태 지속성 가중치
      trendWeight: config.trendWeight || 0.3,              // 추세 가중치
      ...config,
    };

    this.hmm = new HMM(config.hmmConfig);
    this.visualizer = new TrajectoryVisualizer();
    this.classifier = new AnomalyClassifier();
  }

  /**
   * 과거 발병 사례로 전이 확률 학습
   * @param {Array<Array<string>>} historicalCases - 과거 상태 시퀀스 배열
   */
  learnFromHistory(historicalCases) {
    this.hmm.learnFromCases(historicalCases);
    return { status: 'learned', cases: historicalCases.length };
  }

  /**
   * 메인 분석 실행
   *
   * @param {Object} input
   * @param {Array<number>} input.anomalyScores - 이상 점수 시계열 (0~1)
   * @param {Object} input.contextResult - Context Agent 분석 결과
   * @param {Array} input.feedingData - 급이 데이터
   * @param {Array} input.diseaseHistory - 과거 질병/이상 이력 (선택)
   * @returns {Object} 위험궤적 분석 결과
   */
  async analyze(input) {
    const { anomalyScores, contextResult, feedingData, diseaseHistory } = input;
    const startTime = Date.now();

    // 1. 이상 점수를 관측 시퀀스로 변환
    const obsSequence = anomalyScores.map(s => this.hmm.scoreToObservation(s));

    // 2. Viterbi: 최적 상태 경로 추정 (Gaussian emission 사용)
    const viterbiResult = this.hmm.viterbi(obsSequence, anomalyScores);

    // 3. Forward: 현재 상태 확률 분포 (Gaussian emission 사용)
    const forwardResult = this.hmm.forward(obsSequence, anomalyScores);

    // 4. 상태 지속성 및 추세 반영하여 보정
    const adjustedDistribution = this._adjustDistribution(
      forwardResult.currentDistribution,
      viterbiResult.path,
      anomalyScores
    );

    // 5. 현재 상태 판정
    const currentState = this._determineCurrentState(adjustedDistribution);

    // 6. 미래 상태 예측
    const futurePredictions = this.hmm.predictFuture(
      adjustedDistribution,
      this.config.predictionHorizon
    );

    // 7. 이상 유형 분류 (질병/환경/사료/계절/장비)
    const contextFeedingAnalysis = contextResult && contextResult.feeding_analysis;
    const contextEnvAnalysis = contextResult && contextResult.environment_analysis;
    const anomalyClassification = this.classifier.classify({
      feedingAnalysis: contextFeedingAnalysis || this._basicFeedingAnalysis(feedingData),
      envAnalysis: contextEnvAnalysis || null,
      anomalyResult: { isAnomaly: viterbiResult.path.slice(-1)[0] !== 'K1', anomalyDays: this._countTrailingState(viterbiResult.path, viterbiResult.path.slice(-1)[0]) },
      livestockInfo: input.livestockInfo,
      season: this._getCurrentSeason(),
    });

    // 8. 위험 타임라인 (K3/K4 도달 예상 시간)
    const riskTimeline = this._estimateRiskTimeline(adjustedDistribution, futurePredictions);

    // 8. 심각도 점수 계산
    const severityScore = this._calculateSeverity(adjustedDistribution, viterbiResult.path);

    // 9. 시각화 데이터 생성 (XAI)
    const visualization = this.visualizer.generate({
      statePath: viterbiResult.path,
      feedingData: feedingData || [],
      anomalyScores,
      futurePredictions,
    });

    const duration = Date.now() - startTime;

    return {
      agentId: 'risk_trajectory',
      agentName: 'Risk Trajectory Agent (위험궤적분석)',
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      result: {
        current_state: currentState.state,
        current_state_label: currentState.label,
        transition_probabilities: {
          K1: Math.round(adjustedDistribution[0] * 100) / 100,
          K2: Math.round(adjustedDistribution[1] * 100) / 100,
          K3: Math.round(adjustedDistribution[2] * 100) / 100,
          K4: Math.round(adjustedDistribution[3] * 100) / 100,
        },
        severity_score: severityScore,
        risk_timeline_hours: riskTimeline.hoursToRisk,
        risk_timeline_description: riskTimeline.description,
        optimal_path: {
          states: viterbiResult.path,
          labels: viterbiResult.stateLabels,
        },
        future_predictions: futurePredictions.map(p => ({
          step: p.step,
          label: `+${p.step}일`,
          most_likely: p.mostLikelyState,
          distribution: p.distribution,
        })),
        anomaly_classification: anomalyClassification,
        trajectory_visualization: visualization,
      },
    };
  }

  /**
   * 간이 급이 분석 (Context Agent 결과가 없을 때)
   */
  _basicFeedingAnalysis(feedingData) {
    if (!feedingData || feedingData.length < 2) {
      return { changeRate3d: 0, trend: 'stable', pattern: 'normal', volatility: 0 };
    }
    const recent3 = feedingData.slice(-3).map(d => d.consumption_kg);
    const older = feedingData.slice(-10, -3).map(d => d.consumption_kg);
    const avg3 = recent3.reduce((a, b) => a + b, 0) / recent3.length;
    const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avg3;
    const changeRate3d = avgOlder > 0 ? ((avg3 - avgOlder) / avgOlder) * 100 : 0;

    const vals = feedingData.slice(-7).map(d => d.consumption_kg);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    const volatility = mean > 0 ? std / mean : 0;

    let trend = 'stable';
    if (changeRate3d < -15) trend = 'rapid_decline';
    else if (changeRate3d < -5) trend = 'gradual_decline';

    let pattern = 'normal';
    if (changeRate3d < -20) pattern = 'acute_drop';
    else if (volatility > 0.15) pattern = 'erratic';

    return { changeRate3d: Math.round(changeRate3d * 10) / 10, trend, pattern, volatility: Math.round(volatility * 1000) / 1000 };
  }

  _countTrailingState(path, state) {
    let count = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] === state) count++;
      else break;
    }
    return count;
  }

  _getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }

  /**
   * 상태 확률 분포 보정
   * Forward 알고리즘 결과에 상태 지속성과 추세를 반영
   */
  _adjustDistribution(rawDist, statePath, anomalyScores) {
    const adjusted = rawDist.slice();
    const { persistenceWeight, trendWeight } = this.config;

    // 1. 상태 지속성 반영 (최근 상태가 계속될 가능성)
    if (statePath.length >= 3) {
      const recentStates = statePath.slice(-3);
      const lastState = recentStates[recentStates.length - 1];
      const stateIdx = ['K1', 'K2', 'K3', 'K4'].indexOf(lastState);

      // 같은 상태가 연속되면 해당 상태 확률 증가
      const consecutive = recentStates.filter(s => s === lastState).length;
      if (consecutive >= 2 && stateIdx >= 0) {
        adjusted[stateIdx] += persistenceWeight * (consecutive / 3);
      }
    }

    // 2. 추세 반영 (이상 점수가 증가 추세면 악화 방향 가중)
    if (anomalyScores.length >= 3) {
      const recent = anomalyScores.slice(-5);
      const trend = this._calculateTrend(recent);

      if (trend > 0.05) {
        // 악화 추세: K3, K4 확률 증가
        adjusted[2] += trendWeight * trend;
        adjusted[3] += trendWeight * trend * 0.5;
      } else if (trend < -0.05) {
        // 개선 추세: K1, K2 확률 증가
        adjusted[0] += trendWeight * Math.abs(trend);
        adjusted[1] += trendWeight * Math.abs(trend) * 0.5;
      }
    }

    // 정규화
    const sum = adjusted.reduce((a, b) => a + b, 0);
    return adjusted.map(v => v / (sum || 1));
  }

  /**
   * 현재 상태 판정
   */
  _determineCurrentState(distribution) {
    const states = ['K1', 'K2', 'K3', 'K4'];
    const labels = { K1: '정상', K2: '주의', K3: '위험', K4: '긴급' };

    let maxIdx = 0;
    for (let i = 1; i < distribution.length; i++) {
      if (distribution[i] > distribution[maxIdx]) maxIdx = i;
    }

    return {
      state: states[maxIdx],
      label: labels[states[maxIdx]],
      confidence: Math.round(distribution[maxIdx] * 100),
    };
  }

  /**
   * 위험 단계 도달 예상 시간 계산
   */
  _estimateRiskTimeline(currentDist, futurePredictions) {
    // K3+K4 확률이 50% 이상이 되는 시점 찾기
    const dangerThreshold = 0.50;
    const currentDanger = currentDist[2] + currentDist[3];

    if (currentDanger >= dangerThreshold) {
      return {
        hoursToRisk: 0,
        description: '현재 위험/긴급 상태에 있습니다.',
      };
    }

    for (const pred of futurePredictions) {
      const dangerProb = pred.distribution[2] + pred.distribution[3];
      if (dangerProb >= dangerThreshold) {
        const hours = pred.step * 24;
        return {
          hoursToRisk: hours,
          description: `약 ${pred.step}일(${hours}시간) 후 위험 단계 진입 예상 (확률 ${Math.round(dangerProb * 100)}%)`,
        };
      }
    }

    return {
      hoursToRisk: 999,
      description: `${this.config.predictionHorizon}일 내 위험 단계 전환 가능성 낮음`,
    };
  }

  /**
   * 심각도 점수 계산 (0~1)
   */
  _calculateSeverity(distribution, statePath) {
    // 가중 합: K1=0, K2=0.33, K3=0.67, K4=1.0
    const weights = [0, 0.33, 0.67, 1.0];
    let score = 0;
    for (let i = 0; i < distribution.length; i++) {
      score += distribution[i] * weights[i];
    }

    // 연속 악화 보너스
    if (statePath.length >= 3) {
      const last3 = statePath.slice(-3).map(s => ['K1', 'K2', 'K3', 'K4'].indexOf(s));
      if (last3[2] > last3[1] && last3[1] > last3[0]) {
        score = Math.min(1, score + 0.1); // 연속 악화 시 +0.1
      }
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * 추세 계산 (선형 회귀 기울기)
   */
  _calculateTrend(values) {
    const n = values.length;
    if (n < 2) return 0;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }
}

module.exports = { RiskTrajectoryAgent };
