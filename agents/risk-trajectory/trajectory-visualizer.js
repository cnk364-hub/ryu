/**
 * Trajectory Visualizer - 위험 궤적 시각화 데이터 생성
 *
 * XAI(설명 가능한 AI) 관점에서 농장주가 직관적으로 파악할 수 있는
 * 위험 경로 시각화 데이터를 생성
 *
 * 출력:
 * - 시간별 상태 경로 (Viterbi 최적 경로)
 * - 상태 전이 확률 변화 추이
 * - 위험 단계 진행 타임라인
 * - 주요 전환점 (상태가 변한 시점과 원인)
 */

class TrajectoryVisualizer {
  constructor() {
    this.stateColors = {
      K1: '#22C55E',  // 녹색 (정상)
      K2: '#EAB308',  // 노란색 (주의)
      K3: '#F97316',  // 주황색 (위험)
      K4: '#EF4444',  // 빨간색 (긴급)
    };
    this.stateLabels = { K1: '정상', K2: '주의', K3: '위험', K4: '긴급' };
  }

  /**
   * 위험 궤적 시각화 데이터 생성
   *
   * @param {Object} params
   * @param {Array<string>} params.statePath - Viterbi 최적 상태 경로
   * @param {Array<Object>} params.feedingData - 급이 데이터
   * @param {Array<number>} params.anomalyScores - 이상 점수 배열
   * @param {Array<Object>} params.futurePredictions - 미래 예측 결과
   * @returns {Object} 시각화 데이터
   */
  generate(params) {
    const { statePath, feedingData, anomalyScores, futurePredictions } = params;

    // 1. 타임라인 데이터 (일별 상태 + 급이량 + 이상점수)
    const timeline = this._buildTimeline(statePath, feedingData, anomalyScores);

    // 2. 상태 전환점 탐지
    const transitions = this._detectTransitions(statePath, feedingData);

    // 3. 위험 진행 요약
    const progressionSummary = this._summarizeProgression(statePath, transitions);

    // 4. 미래 예측 시각화 데이터
    const futureTimeline = this._buildFutureTimeline(futurePredictions);

    // 5. XAI 설명 데이터
    const explanations = this._generateExplanations(transitions, feedingData, anomalyScores);

    return {
      timeline,
      transitions,
      progressionSummary,
      futureTimeline,
      explanations,
    };
  }

  /**
   * 일별 타임라인 구성
   */
  _buildTimeline(statePath, feedingData, anomalyScores) {
    return feedingData.map((d, i) => ({
      date: d.date,
      state: statePath[i] || 'K1',
      stateLabel: this.stateLabels[statePath[i]] || '정상',
      stateColor: this.stateColors[statePath[i]] || '#22C55E',
      stateIndex: ['K1', 'K2', 'K3', 'K4'].indexOf(statePath[i] || 'K1'),
      consumption: d.consumption_kg,
      anomalyScore: anomalyScores[i] || 0,
      deviation: d.deviation_pct,
    }));
  }

  /**
   * 상태 전환점 탐지
   */
  _detectTransitions(statePath, feedingData) {
    const transitions = [];

    for (let i = 1; i < statePath.length; i++) {
      if (statePath[i] !== statePath[i - 1]) {
        const fromIdx = ['K1', 'K2', 'K3', 'K4'].indexOf(statePath[i - 1]);
        const toIdx = ['K1', 'K2', 'K3', 'K4'].indexOf(statePath[i]);
        const isEscalation = toIdx > fromIdx;

        transitions.push({
          day: i,
          date: feedingData[i] ? feedingData[i].date : `day-${i}`,
          from: statePath[i - 1],
          to: statePath[i],
          fromLabel: this.stateLabels[statePath[i - 1]],
          toLabel: this.stateLabels[statePath[i]],
          direction: isEscalation ? 'escalation' : 'recovery',
          consumption: feedingData[i] ? feedingData[i].consumption_kg : null,
          consumptionChange: feedingData[i] && feedingData[i - 1]
            ? Math.round((feedingData[i].consumption_kg - feedingData[i - 1].consumption_kg) * 10) / 10
            : null,
        });
      }
    }

    return transitions;
  }

  /**
   * 위험 진행 요약
   */
  _summarizeProgression(statePath, transitions) {
    // 각 상태 체류 일수
    const stateDuration = { K1: 0, K2: 0, K3: 0, K4: 0 };
    statePath.forEach(s => { stateDuration[s] = (stateDuration[s] || 0) + 1; });

    // 현재 상태 연속 일수
    let currentStreakDays = 1;
    const currentState = statePath[statePath.length - 1];
    for (let i = statePath.length - 2; i >= 0; i--) {
      if (statePath[i] === currentState) currentStreakDays++;
      else break;
    }

    // 최고 위험 도달 상태
    const maxStateIdx = Math.max(...statePath.map(s => ['K1', 'K2', 'K3', 'K4'].indexOf(s)));
    const peakState = ['K1', 'K2', 'K3', 'K4'][maxStateIdx];

    // 악화 속도 (정상→현재 상태까지 걸린 일수)
    let escalationDays = null;
    if (currentState !== 'K1') {
      for (let i = statePath.length - 1; i >= 0; i--) {
        if (statePath[i] === 'K1') {
          escalationDays = statePath.length - 1 - i;
          break;
        }
      }
    }

    return {
      currentState,
      currentStateLabel: this.stateLabels[currentState],
      currentStreakDays,
      peakState,
      peakStateLabel: this.stateLabels[peakState],
      escalationDays,
      totalTransitions: transitions.length,
      escalations: transitions.filter(t => t.direction === 'escalation').length,
      recoveries: transitions.filter(t => t.direction === 'recovery').length,
      stateDuration,
    };
  }

  /**
   * 미래 예측 타임라인
   */
  _buildFutureTimeline(futurePredictions) {
    if (!futurePredictions) return [];

    return futurePredictions.map(pred => {
      const maxProb = Math.max(...pred.distribution);
      const maxIdx = pred.distribution.indexOf(maxProb);
      const states = ['K1', 'K2', 'K3', 'K4'];

      return {
        step: pred.step,
        label: `+${pred.step}일`,
        distribution: {
          K1: pred.distribution[0],
          K2: pred.distribution[1],
          K3: pred.distribution[2],
          K4: pred.distribution[3],
        },
        mostLikely: states[maxIdx],
        mostLikelyLabel: this.stateLabels[states[maxIdx]],
        mostLikelyProb: Math.round(maxProb * 100),
        dangerProb: Math.round((pred.distribution[2] + pred.distribution[3]) * 100),
      };
    });
  }

  /**
   * XAI 설명 데이터 생성
   * 농장주가 이해할 수 있는 언어로 상태 전이 원인 설명
   */
  _generateExplanations(transitions, feedingData, anomalyScores) {
    return transitions.map(t => {
      const reasons = [];

      if (t.direction === 'escalation') {
        if (t.consumptionChange && t.consumptionChange < -10) {
          reasons.push(`급이량이 전일 대비 ${Math.abs(t.consumptionChange)}kg 감소`);
        }
        if (feedingData[t.day]) {
          const dev = feedingData[t.day].deviation_pct;
          if (dev < -15) {
            reasons.push(`기준선 대비 ${Math.abs(dev)}% 하회`);
          }
        }
        if (anomalyScores[t.day] > 0.7) {
          reasons.push(`이상탐지 점수 ${anomalyScores[t.day].toFixed(2)}로 높음`);
        }
      } else {
        if (t.consumptionChange && t.consumptionChange > 5) {
          reasons.push(`급이량이 전일 대비 ${t.consumptionChange}kg 회복`);
        }
        reasons.push('급이 패턴 안정화 추세');
      }

      return {
        date: t.date,
        transition: `${t.fromLabel} → ${t.toLabel}`,
        direction: t.direction === 'escalation' ? '악화' : '회복',
        reasons: reasons.length > 0 ? reasons : ['복합적 요인'],
        description: t.direction === 'escalation'
          ? `${t.date}에 상태가 ${t.fromLabel}에서 ${t.toLabel}로 악화되었습니다. ${reasons.join(', ')}.`
          : `${t.date}에 상태가 ${t.fromLabel}에서 ${t.toLabel}로 개선되었습니다. ${reasons.join(', ')}.`,
      };
    });
  }
}

module.exports = { TrajectoryVisualizer };
