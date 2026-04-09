/**
 * CBR Engine - 사례기반추론 (Case-Based Reasoning)
 *
 * 4단계 CBR 사이클:
 *   1. Retrieve: 유사 사례 검색 (가중 유클리디안 거리)
 *   2. Reuse: 유사 사례의 조치안 재사용
 *   3. Revise: 현재 상황에 맞게 조정
 *   4. Retain: 새로운 사례 저장 (학습)
 */

const { CASE_DATABASE } = require('./case-database');

class CBREngine {
  constructor() {
    this.caseBase = CASE_DATABASE.slice();

    // 유사도 계산 시 특징별 가중치
    this.featureWeights = {
      feedingChangeRate: 0.25,  // 급이 변화율 (가장 중요)
      riskState: 0.20,          // 위험 상태
      severityScore: 0.15,      // 심각도
      anomalyDays: 0.10,        // 이상 지속일수
      temperature: 0.08,        // 온도
      humidity: 0.07,           // 습도
      season: 0.08,             // 계절
      mortalityRate: 0.07,      // 폐사율
    };

    // 특징별 정규화 범위
    this.featureRanges = {
      feedingChangeRate: { min: -50, max: 10 },
      severityScore: { min: 0, max: 1 },
      anomalyDays: { min: 0, max: 30 },
      temperature: { min: -10, max: 45 },
      humidity: { min: 20, max: 100 },
      mortalityRate: { min: 0, max: 20 },
    };
  }

  /**
   * 1단계: Retrieve - 유사 사례 검색
   *
   * @param {Object} currentFeatures - 현재 상황 특징
   * @param {number} topK - 반환할 최대 사례 수
   * @returns {Array} 유사도 순으로 정렬된 사례 목록
   */
  retrieve(currentFeatures, topK = 3) {
    const scored = this.caseBase.map(caseItem => {
      const similarity = this._calculateSimilarity(currentFeatures, caseItem.features);
      return { case: caseItem, similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * 2단계: Reuse - 유사 사례의 조치안 재사용
   *
   * @param {Array} retrievedCases - 검색된 유사 사례
   * @param {Object} currentContext - 현재 상황 컨텍스트
   * @returns {Object} 재사용된 조치안
   */
  reuse(retrievedCases, currentContext) {
    if (retrievedCases.length === 0) {
      return this._getDefaultActions(currentContext.riskLevel);
    }

    // 가중 병합: 유사도가 높은 사례일수록 영향력 큼
    const mergedActions = { immediate: [], shortTerm: [], preventive: [] };
    const seenActions = new Set();
    const totalSim = retrievedCases.reduce((s, r) => s + r.similarity, 0);

    for (const { case: c, similarity } of retrievedCases) {
      const weight = totalSim > 0 ? similarity / totalSim : 1 / retrievedCases.length;

      for (const phase of ['immediate', 'shortTerm', 'preventive']) {
        if (c.actions[phase]) {
          for (const action of c.actions[phase]) {
            if (!seenActions.has(action)) {
              seenActions.add(action);
              mergedActions[phase].push({
                action,
                sourceCase: c.id,
                sourceSimilarity: Math.round(similarity * 100),
                weight: Math.round(weight * 100),
              });
            }
          }
        }
      }
    }

    return mergedActions;
  }

  /**
   * 3단계: Revise - 현재 상황에 맞게 조정
   *
   * @param {Object} reusedActions - 재사용된 조치안
   * @param {Object} currentContext - 현재 상황
   * @returns {Object} 조정된 조치안
   */
  revise(reusedActions, currentContext) {
    const revised = {
      immediate: [],
      shortTerm: [],
      preventive: [],
    };

    const { riskLevel, anomalyType, environmentStatus, livestockInfo } = currentContext;

    // 위험 단계별 조치 필터링 및 우선순위 부여
    for (const phase of ['immediate', 'shortTerm', 'preventive']) {
      let actions = reusedActions[phase] || [];

      // 위험 단계에 따른 필터링
      if (riskLevel === 'normal' || riskLevel === 'K1') {
        // 정상: 예방 조치만
        if (phase === 'immediate') actions = [];
      }

      // 우선순위 부여
      actions = actions.map(item => ({
        ...item,
        priority: this._assignPriority(item.action, riskLevel, phase),
      }));

      // 우선순위 정렬
      actions.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] || 3) - (order[b.priority] || 3);
      });

      revised[phase] = actions;
    }

    // 환경 상태에 따른 추가 조치
    if (environmentStatus === 'critical') {
      revised.immediate.unshift({
        action: '환기 시스템 즉시 점검 및 최대 가동',
        priority: 'critical',
        sourceCase: 'RULE-ENV',
        sourceSimilarity: 100,
        reason: '환경 센서 이상 감지에 따른 자동 추가',
      });
    }

    // 수의사 필요 여부 판단
    revised.vetRequired = riskLevel === 'K3' || riskLevel === 'K4' ||
      riskLevel === 'danger' || riskLevel === 'emergency';

    return revised;
  }

  /**
   * 4단계: Retain - 새 사례 저장
   *
   * @param {Object} newCase - 새 사례
   */
  retain(newCase) {
    this.caseBase.push(newCase);
    return { status: 'retained', totalCases: this.caseBase.length };
  }

  /**
   * 가중 유사도 계산 (0~1)
   */
  _calculateSimilarity(current, caseFeatures) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [feature, weight] of Object.entries(this.featureWeights)) {
      const curVal = current[feature];
      const caseVal = caseFeatures[feature];

      if (curVal === undefined || caseVal === undefined) continue;

      let sim;
      if (feature === 'riskState') {
        sim = this._categoricalSimilarity(curVal, caseVal);
      } else if (feature === 'season') {
        sim = this._seasonSimilarity(curVal, caseVal);
      } else {
        sim = this._numericSimilarity(curVal, caseVal, feature);
      }

      weightedSum += weight * sim;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
  }

  /**
   * 수치형 유사도 (정규화된 거리 기반)
   */
  _numericSimilarity(val1, val2, feature) {
    const range = this.featureRanges[feature];
    if (!range) return 1 - Math.min(Math.abs(val1 - val2) / 100, 1);

    const span = range.max - range.min;
    if (span === 0) return 1;

    const dist = Math.abs(val1 - val2) / span;
    return Math.max(0, 1 - dist);
  }

  /**
   * 범주형 유사도 (위험 상태)
   */
  _categoricalSimilarity(state1, state2) {
    const stateOrder = { K1: 0, K2: 1, K3: 2, K4: 3, normal: 0, caution: 1, danger: 2, emergency: 3 };
    const idx1 = stateOrder[state1] !== undefined ? stateOrder[state1] : 0;
    const idx2 = stateOrder[state2] !== undefined ? stateOrder[state2] : 0;
    return 1 - Math.abs(idx1 - idx2) / 3;
  }

  /**
   * 계절 유사도
   */
  _seasonSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    const adjacent = {
      spring: ['winter', 'summer'],
      summer: ['spring', 'fall'],
      fall: ['summer', 'winter'],
      winter: ['fall', 'spring'],
    };
    if (adjacent[s1] && adjacent[s1].includes(s2)) return 0.5;
    return 0.0;
  }

  /**
   * 우선순위 부여
   */
  _assignPriority(action, riskLevel, phase) {
    const isUrgent = riskLevel === 'K4' || riskLevel === 'K3' ||
      riskLevel === 'emergency' || riskLevel === 'danger';

    if (phase === 'immediate') {
      if (action.includes('격리') || action.includes('신고') || action.includes('긴급')) return 'critical';
      if (action.includes('소독') || action.includes('통제')) return 'high';
      return isUrgent ? 'high' : 'medium';
    }
    if (phase === 'shortTerm') {
      if (action.includes('검사') || action.includes('백신')) return 'high';
      return 'medium';
    }
    return 'low';
  }

  /**
   * 기본 조치안 (사례 없을 때)
   */
  _getDefaultActions(riskLevel) {
    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      return {
        immediate: [{ action: '의심 구역 즉시 격리', priority: 'critical' }, { action: '방역 당국 신고', priority: 'critical' }],
        shortTerm: [{ action: '수의사 긴급 호출', priority: 'high' }],
        preventive: [{ action: '인접 농가 경보', priority: 'medium' }],
      };
    }
    return {
      immediate: [{ action: '모니터링 강화', priority: 'medium' }],
      shortTerm: [{ action: '원인 조사', priority: 'medium' }],
      preventive: [{ action: '예방 조치 검토', priority: 'low' }],
    };
  }
}

module.exports = { CBREngine };
