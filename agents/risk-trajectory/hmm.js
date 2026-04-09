/**
 * HMM (Hidden Markov Model) - 상태전이 모델
 *
 * 가축 건강 상태를 은닉 상태로 모델링:
 *   K1(정상) → K2(주의) → K3(위험) → K4(긴급)
 *
 * - 전이 확률 행렬 (A): 상태 간 전이 확률
 * - 방출 확률 행렬 (B): 각 상태에서 관측값(이상점수 구간) 출현 확률
 * - 초기 확률 벡터 (π): 시작 상태 분포
 *
 * Viterbi 알고리즘: 관측 시퀀스로부터 최적 상태 경로 추정
 * Forward 알고리즘: 미래 상태 전이 확률 예측
 */

class HMM {
  constructor(config = {}) {
    // 상태 정의: K1=정상, K2=주의, K3=위험, K4=긴급
    this.states = ['K1', 'K2', 'K3', 'K4'];
    this.stateLabels = { K1: '정상', K2: '주의', K3: '위험', K4: '긴급' };
    this.N = this.states.length;

    // 관측값 구간: 이상점수를 5개 구간으로 이산화
    // O1: [0, 0.2), O2: [0.2, 0.4), O3: [0.4, 0.6), O4: [0.6, 0.8), O5: [0.8, 1.0]
    this.observations = ['O1', 'O2', 'O3', 'O4', 'O5'];
    this.M = this.observations.length;

    // 초기 확률 벡터 π (대부분 정상 상태에서 시작)
    this.pi = config.pi || [0.70, 0.20, 0.08, 0.02];

    // 전이 확률 행렬 A (상태 간 전이)
    // 축산 도메인: 점진적 악화가 일반적, 급격한 전이도 가능
    this.A = config.A || [
      // K1     K2     K3     K4     (to)
      [0.85,  0.12,  0.025, 0.005],  // from K1 (정상)
      [0.10,  0.70,  0.17,  0.03 ],  // from K2 (주의)
      [0.03,  0.10,  0.67,  0.20 ],  // from K3 (위험)
      [0.01,  0.04,  0.15,  0.80 ],  // from K4 (긴급)
    ];

    // 방출 확률 행렬 B (이산 구간 방식 - 폴백용)
    this.B = config.B || [
      [0.60,  0.25,  0.10,  0.04,  0.01],  // K1
      [0.10,  0.30,  0.35,  0.20,  0.05],  // K2
      [0.03,  0.07,  0.20,  0.45,  0.25],  // K3
      [0.01,  0.03,  0.06,  0.30,  0.60],  // K4
    ];

    // Gaussian Emission 파라미터: P(X|S) ~ N(mu, sigma²)
    // 각 상태별 이상점수의 평균(mu)과 표준편차(sigma)
    // Gaussian Emission 파라미터 (σ를 넓혀서 오판 방지)
    this.gaussianEmission = config.gaussianEmission || [
      { mu: 0.12, sigma: 0.12 },  // K1 (정상): 이상점수 낮음
      { mu: 0.38, sigma: 0.14 },  // K2 (주의): 이상점수 중간
      { mu: 0.68, sigma: 0.12 },  // K3 (위험): 이상점수 높음
      { mu: 0.88, sigma: 0.08 },  // K4 (긴급): 이상점수 매우 높음
    ];

    // Emission 모드: 'ensemble' (이산+Gaussian 결합), 'gaussian', 'discrete'
    this.emissionMode = config.emissionMode || 'ensemble';
    this.ensembleWeight = config.ensembleWeight || 0.6; // Gaussian 비중

    this._validateModel();
  }

  /**
   * 모델 유효성 검증 (확률 합 = 1)
   */
  _validateModel() {
    const eps = 0.001;
    const piSum = this.pi.reduce((a, b) => a + b, 0);
    if (Math.abs(piSum - 1) > eps) throw new Error(`π 합이 1이 아닙니다: ${piSum}`);

    for (let i = 0; i < this.N; i++) {
      const aSum = this.A[i].reduce((a, b) => a + b, 0);
      if (Math.abs(aSum - 1) > eps) throw new Error(`A[${i}] 합이 1이 아닙니다: ${aSum}`);
      const bSum = this.B[i].reduce((a, b) => a + b, 0);
      if (Math.abs(bSum - 1) > eps) throw new Error(`B[${i}] 합이 1이 아닙니다: ${bSum}`);
    }
  }

  /**
   * 이상 점수를 관측 인덱스로 변환
   * @param {number} score - 0~1 이상 점수
   * @returns {number} 관측 인덱스 (0~4)
   */
  scoreToObservation(score) {
    if (score < 0.2) return 0;
    if (score < 0.4) return 1;
    if (score < 0.6) return 2;
    if (score < 0.8) return 3;
    return 4;
  }

  /**
   * Gaussian 방출 확률 P(X|S) 계산
   * @param {number} score - 연속 이상 점수 (0~1)
   * @param {number} stateIdx - 상태 인덱스 (0~3)
   * @returns {number} 확률 밀도
   */
  gaussianEmit(score, stateIdx) {
    const { mu, sigma } = this.gaussianEmission[stateIdx];
    const diff = score - mu;
    return (1 / (sigma * Math.sqrt(2 * Math.PI))) *
      Math.exp(-0.5 * (diff / sigma) ** 2);
  }

  /**
   * 상태별 방출 확률 반환 (모드에 따라 Gaussian 또는 이산)
   * @param {number} obs - 관측값 (이산 인덱스 또는 연속 점수)
   * @param {number} stateIdx - 상태 인덱스
   * @param {number} rawScore - 원본 연속 점수 (Gaussian 모드용)
   */
  emitProb(obs, stateIdx, rawScore) {
    if (this.emissionMode === 'ensemble' && rawScore !== undefined) {
      // 앙상블: Gaussian과 이산 모델의 가중 평균
      const gProb = this.gaussianEmit(rawScore, stateIdx);
      const dProb = this.B[stateIdx][obs];
      const w = this.ensembleWeight;
      return w * gProb + (1 - w) * dProb;
    }
    if (this.emissionMode === 'gaussian' && rawScore !== undefined) {
      return this.gaussianEmit(rawScore, stateIdx);
    }
    return this.B[stateIdx][obs];
  }

  /**
   * Viterbi 알고리즘 - 최적 상태 경로 추정
   *
   * @param {Array<number>} obsSequence - 관측 인덱스 시퀀스
   * @param {Array<number>} rawScores - 원본 연속 점수 (Gaussian 모드용, 선택)
   * @returns {Object} { path, probability, stateLabels }
   */
  viterbi(obsSequence, rawScores) {
    const T = obsSequence.length;
    if (T === 0) return { path: [], probability: 0, stateLabels: [] };

    const dp = Array.from({ length: T }, () => new Float64Array(this.N));
    const backpointer = Array.from({ length: T }, () => new Int32Array(this.N));

    // 초기화 (t=0)
    for (let j = 0; j < this.N; j++) {
      const ep = this.emitProb(obsSequence[0], j, rawScores ? rawScores[0] : undefined);
      dp[0][j] = Math.log(this.pi[j] + 1e-300) + Math.log(ep + 1e-300);
      backpointer[0][j] = 0;
    }

    // 재귀 (t=1 ~ T-1)
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < this.N; j++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        for (let i = 0; i < this.N; i++) {
          const val = dp[t - 1][i] + Math.log(this.A[i][j] + 1e-300);
          if (val > maxVal) { maxVal = val; maxIdx = i; }
        }
        const ep = this.emitProb(obsSequence[t], j, rawScores ? rawScores[t] : undefined);
        dp[t][j] = maxVal + Math.log(ep + 1e-300);
        backpointer[t][j] = maxIdx;
      }
    }

    // 종료: 최종 시점에서 최대 확률 상태
    let bestLastState = 0;
    let bestProb = dp[T - 1][0];
    for (let j = 1; j < this.N; j++) {
      if (dp[T - 1][j] > bestProb) {
        bestProb = dp[T - 1][j];
        bestLastState = j;
      }
    }

    // 역추적
    const path = new Array(T);
    path[T - 1] = bestLastState;
    for (let t = T - 2; t >= 0; t--) {
      path[t] = backpointer[t + 1][path[t + 1]];
    }

    return {
      path: path.map(i => this.states[i]),
      pathIndices: path,
      probability: Math.exp(bestProb),
      stateLabels: path.map(i => this.stateLabels[this.states[i]]),
    };
  }

  /**
   * Forward 알고리즘 - 현재 상태 확률 분포 계산
   *
   * @param {Array<number>} obsSequence - 관측 인덱스 시퀀스
   * @param {Array<number>} rawScores - 원본 연속 점수 (Gaussian 모드용, 선택)
   * @returns {Object} { currentDistribution, logLikelihood }
   */
  forward(obsSequence, rawScores) {
    const T = obsSequence.length;
    if (T === 0) return { currentDistribution: this.pi.slice(), logLikelihood: 0 };

    let alpha = new Array(this.N);

    // 초기화
    let scale = 0;
    for (let j = 0; j < this.N; j++) {
      const ep = this.emitProb(obsSequence[0], j, rawScores ? rawScores[0] : undefined);
      alpha[j] = this.pi[j] * ep;
      scale += alpha[j];
    }
    // 스케일링 (언더플로 방지)
    let logLikelihood = Math.log(scale + 1e-300);
    for (let j = 0; j < this.N; j++) alpha[j] /= (scale || 1);

    // 재귀
    for (let t = 1; t < T; t++) {
      const newAlpha = new Array(this.N);
      scale = 0;
      for (let j = 0; j < this.N; j++) {
        let sum = 0;
        for (let i = 0; i < this.N; i++) {
          sum += alpha[i] * this.A[i][j];
        }
        const ep = this.emitProb(obsSequence[t], j, rawScores ? rawScores[t] : undefined);
        newAlpha[j] = sum * ep;
        scale += newAlpha[j];
      }
      logLikelihood += Math.log(scale + 1e-300);
      for (let j = 0; j < this.N; j++) newAlpha[j] /= (scale || 1);
      alpha = newAlpha;
    }

    return {
      currentDistribution: alpha,
      logLikelihood,
    };
  }

  /**
   * 미래 상태 전이 확률 예측
   *
   * @param {Array<number>} currentDist - 현재 상태 확률 분포
   * @param {number} steps - 예측할 시간 단계 수
   * @returns {Array<Array<number>>} 각 시간 단계별 상태 확률 분포
   */
  predictFuture(currentDist, steps) {
    const predictions = [];
    let dist = currentDist.slice();

    for (let s = 0; s < steps; s++) {
      const newDist = new Array(this.N).fill(0);
      for (let j = 0; j < this.N; j++) {
        for (let i = 0; i < this.N; i++) {
          newDist[j] += dist[i] * this.A[i][j];
        }
      }
      dist = newDist;
      predictions.push({
        step: s + 1,
        distribution: dist.map(v => Math.round(v * 1000) / 1000),
        mostLikelyState: this.states[dist.indexOf(Math.max(...dist))],
      });
    }

    return predictions;
  }

  /**
   * 과거 사례 데이터로 전이 확률 학습 (Baum-Welch 간이 버전)
   * 실제 발병 사례의 상태 시퀀스로 A, B 매트릭스 업데이트
   *
   * @param {Array<Array<string>>} stateSequences - 상태 시퀀스 배열 [['K1','K1','K2','K3',...], ...]
   */
  learnFromCases(stateSequences) {
    if (!stateSequences || stateSequences.length === 0) return;

    // 전이 횟수 카운팅
    const transCount = Array.from({ length: this.N }, () => new Array(this.N).fill(0));
    const stateCount = new Array(this.N).fill(0);

    for (const seq of stateSequences) {
      for (let t = 0; t < seq.length - 1; t++) {
        const from = this.states.indexOf(seq[t]);
        const to = this.states.indexOf(seq[t + 1]);
        if (from >= 0 && to >= 0) {
          transCount[from][to]++;
          stateCount[from]++;
        }
      }
    }

    // 전이 확률 업데이트 (스무딩 적용)
    const smoothing = 0.01;
    for (let i = 0; i < this.N; i++) {
      const total = stateCount[i] + smoothing * this.N;
      if (total > 0) {
        for (let j = 0; j < this.N; j++) {
          this.A[i][j] = (transCount[i][j] + smoothing) / total;
        }
      }
    }
  }
}

module.exports = { HMM };
