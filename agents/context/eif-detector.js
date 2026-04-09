/**
 * EIF (Extended Isolation Forest) 이상탐지 엔진
 *
 * 기존 Isolation Forest를 확장하여 경사면(slope) 기반 분할을 사용.
 * 축산 급이 데이터의 다차원 이상 패턴을 탐지.
 *
 * 참고: Liu et al. (2008) "Isolation Forest"
 *       Hariri et al. (2019) "Extended Isolation Forest"
 */

class EIFDetector {
  constructor(config = {}) {
    this.nTrees = config.nTrees || 200;
    this.sampleSize = config.sampleSize || 256;
    this.extensionLevel = config.extensionLevel || 1; // 0=기본IF, 1=EIF
    this.trees = [];
    this.trained = false;
  }

  /**
   * 학습: 정상 데이터로 고립 트리 생성
   * @param {Array<Array<number>>} data - 2D 배열 [샘플수 x 특징수]
   */
  fit(data) {
    if (data.length === 0) throw new Error('학습 데이터가 비어있습니다.');

    this.nFeatures = data[0].length;
    this.trees = [];

    // c(n): 평균 경로 길이 보정값
    this.avgPathLength = this._averagePathLength(this.sampleSize);

    for (let i = 0; i < this.nTrees; i++) {
      const sample = this._subsample(data, this.sampleSize);
      const heightLimit = Math.ceil(Math.log2(this.sampleSize));
      const tree = this._buildTree(sample, 0, heightLimit);
      this.trees.push(tree);
    }

    this.trained = true;
    return this;
  }

  /**
   * 예측: 각 데이터 포인트의 이상 점수 계산
   * @param {Array<Array<number>>} data
   * @returns {Object} { isAnomaly, latestScore, scores, anomalyDays, anomalyIndices }
   */
  predict(data, threshold = 0.6) {
    if (!this.trained) throw new Error('모델이 학습되지 않았습니다. fit()을 먼저 실행하세요.');

    const scores = data.map(point => this._anomalyScore(point));

    const anomalyIndices = scores
      .map((s, i) => s > threshold ? i : -1)
      .filter(i => i >= 0);

    // 연속 이상일 수
    let anomalyDays = 0;
    for (let i = scores.length - 1; i >= 0; i--) {
      if (scores[i] > threshold) anomalyDays++;
      else break;
    }

    return {
      isAnomaly: scores.length > 0 && scores[scores.length - 1] > threshold,
      latestScore: scores.length > 0 ? scores[scores.length - 1] : 0,
      scores,
      anomalyDays,
      anomalyIndices,
    };
  }

  /**
   * 단일 포인트의 이상 점수 계산
   * @param {Array<number>} point
   * @returns {number} 0~1 사이의 이상 점수 (1에 가까울수록 이상)
   */
  _anomalyScore(point) {
    const pathLengths = this.trees.map(tree => this._pathLength(point, tree, 0));
    const avgPath = pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length;

    // s(x, n) = 2^(-E(h(x)) / c(n))
    const score = Math.pow(2, -avgPath / this.avgPathLength);
    return Math.round(score * 1000) / 1000;
  }

  /**
   * 고립 트리 구축 (재귀)
   */
  _buildTree(data, currentHeight, heightLimit) {
    if (currentHeight >= heightLimit || data.length <= 1) {
      return { type: 'leaf', size: data.length };
    }

    if (this.extensionLevel === 0) {
      // 기본 Isolation Forest: 단일 축 분할
      return this._buildStandardSplit(data, currentHeight, heightLimit);
    } else {
      // Extended IF: 경사면 기반 분할
      return this._buildExtendedSplit(data, currentHeight, heightLimit);
    }
  }

  /**
   * 기본 IF 분할: 랜덤 특징 + 랜덤 분할점
   */
  _buildStandardSplit(data, currentHeight, heightLimit) {
    const featureIdx = Math.floor(Math.random() * this.nFeatures);
    const values = data.map(d => d[featureIdx]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
      return { type: 'leaf', size: data.length };
    }

    const splitValue = min + Math.random() * (max - min);
    const left = data.filter(d => d[featureIdx] < splitValue);
    const right = data.filter(d => d[featureIdx] >= splitValue);

    return {
      type: 'node',
      featureIdx,
      splitValue,
      left: this._buildTree(left, currentHeight + 1, heightLimit),
      right: this._buildTree(right, currentHeight + 1, heightLimit),
    };
  }

  /**
   * EIF 분할: 랜덤 경사면(hyperplane) 기반
   */
  _buildExtendedSplit(data, currentHeight, heightLimit) {
    // 랜덤 법선 벡터 생성
    const normal = Array.from({ length: this.nFeatures }, () => this._randn());
    const norm = Math.sqrt(normal.reduce((s, v) => s + v * v, 0));
    const normalizedNormal = normal.map(v => v / (norm || 1));

    // 데이터를 법선 벡터에 투영
    const projections = data.map(d =>
      d.reduce((s, v, i) => s + v * normalizedNormal[i], 0)
    );
    const minProj = Math.min(...projections);
    const maxProj = Math.max(...projections);

    if (minProj === maxProj) {
      return { type: 'leaf', size: data.length };
    }

    const splitValue = minProj + Math.random() * (maxProj - minProj);
    const left = data.filter((d, i) => projections[i] < splitValue);
    const right = data.filter((d, i) => projections[i] >= splitValue);

    return {
      type: 'node',
      normal: normalizedNormal,
      splitValue,
      left: this._buildTree(left, currentHeight + 1, heightLimit),
      right: this._buildTree(right, currentHeight + 1, heightLimit),
    };
  }

  /**
   * 경로 길이 계산 (재귀)
   */
  _pathLength(point, node, currentHeight) {
    if (node.type === 'leaf') {
      return currentHeight + this._averagePathLength(node.size);
    }

    let goLeft;
    if (node.normal) {
      // EIF: 경사면 기반 분할
      const projection = point.reduce((s, v, i) => s + v * node.normal[i], 0);
      goLeft = projection < node.splitValue;
    } else {
      // 기본 IF: 단일 축 분할
      goLeft = point[node.featureIdx] < node.splitValue;
    }

    return goLeft
      ? this._pathLength(point, node.left, currentHeight + 1)
      : this._pathLength(point, node.right, currentHeight + 1);
  }

  /**
   * 평균 경로 길이 c(n) - BST 기반 추정
   */
  _averagePathLength(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    const H = Math.log(n - 1) + 0.5772156649; // 오일러-마스케로니 상수
    return 2 * H - (2 * (n - 1) / n);
  }

  /**
   * 서브샘플링
   */
  _subsample(data, size) {
    if (data.length <= size) return data.slice();
    const shuffled = data.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  /**
   * 표준 정규 분포 난수 (Box-Muller)
   */
  _randn() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

module.exports = { EIFDetector };
