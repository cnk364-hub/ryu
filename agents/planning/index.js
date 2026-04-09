/**
 * Planning Agent (대응계획 에이전트)
 *
 * 역할: 위험 수준과 운영 조건을 고려하여 현장 점검, 조치, 관찰 전략을
 *       포함한 대응 시나리오를 생성하고 우선순위를 결정
 *
 * 핵심 알고리즘: CBR (사례기반추론) + 규칙 기반 조치 생성
 * LLM 연동 준비: generateWithLLM() 인터페이스
 *
 * 입력: 위험 단계, 위험 궤적, 사육 운영 정책, 과거 사례 DB
 * 출력: 조치 후보, 대응우선순위, 권고 메시지, 실행 계획
 */

const { CBREngine } = require('./cbr-engine');

class PlanningAgent {
  constructor(config = {}) {
    this.config = {
      maxSimilarCases: config.maxSimilarCases || 3,
      ...config,
    };
    this.cbr = new CBREngine();
    this.llmEndpoint = config.llmEndpoint || null; // LLM 연동 시 설정
  }

  /**
   * 메인 분석 실행
   *
   * @param {Object} input
   * @param {Object} input.contextResult - Context Agent 결과
   * @param {Object} input.riskResult - Risk Trajectory Agent 결과
   * @param {Object} input.farmPolicy - 농장 운영 정책 (선택)
   * @returns {Object} 대응 계획
   */
  async analyze(input) {
    const { contextResult, riskResult, farmPolicy } = input;
    const startTime = Date.now();

    // 현재 상황 특징 벡터 구성
    const currentFeatures = this._buildFeatureVector(contextResult, riskResult);

    // CBR 1단계: 유사 사례 검색
    const similarCases = this.cbr.retrieve(currentFeatures, this.config.maxSimilarCases);

    // CBR 2단계: 조치안 재사용
    const reusedActions = this.cbr.reuse(similarCases, {
      riskLevel: riskResult?.result?.current_state || 'K1',
    });

    // CBR 3단계: 현재 상황에 맞게 조정
    const riskLevel = riskResult?.result?.current_state || 'K1';
    const envStatus = contextResult?.result?.environment_analysis?.status || 'normal';
    const revisedActions = this.cbr.revise(reusedActions, {
      riskLevel,
      anomalyType: riskResult?.result?.anomaly_classification?.primary_type,
      environmentStatus: envStatus,
      livestockInfo: contextResult?.result?.livestock_analysis,
    });

    // 중복 조치 제거 (유사 의미 통합)
    this._deduplicateActions(revisedActions);

    // 조치 우선순위 최종 정렬 (각 카테고리 최대 5건)
    const actionPlan = this._buildActionPlan(revisedActions, riskLevel);

    // 유사 사례 요약
    const similarCaseSummary = similarCases.map(({ case: c, similarity }) => ({
      id: c.id,
      title: c.title,
      similarity: Math.round(similarity * 100) + '%',
      category: c.category,
      outcome: c.outcome,
      effectiveness: c.effectiveness,
    }));

    // 권고 메시지 생성 (룰 기반 / LLM 교체 가능)
    const recommendation = await this._generateRecommendation(
      riskLevel, actionPlan, similarCases, contextResult, riskResult
    );

    // XAI: 인과관계 설명
    const explanations = this._generateExplanations(
      similarCases, riskResult, contextResult, actionPlan
    );

    const duration = Date.now() - startTime;

    return {
      agentId: 'planning',
      agentName: 'Planning Agent (대응계획)',
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      result: {
        action_plan: actionPlan,
        similar_cases: similarCaseSummary,
        recommendation,
        explanations,
        vet_required: revisedActions.vetRequired,
        confidence: similarCases.length > 0 ? similarCases[0].similarity : 0,
      },
    };
  }

  /**
   * 현재 상황 → CBR 검색용 특징 벡터
   */
  _buildFeatureVector(contextResult, riskResult) {
    const feeding = contextResult?.result?.feeding_analysis || {};
    const env = contextResult?.result?.environment_analysis || {};
    const risk = riskResult?.result || {};

    return {
      feedingChangeRate: feeding.changeRate3d || 0,
      anomalyDays: contextResult?.result?.anomaly_detection?.anomaly_days || 0,
      riskState: risk.current_state || 'K1',
      severityScore: risk.severity_score || 0,
      temperature: env.temperature?.value || 22,
      humidity: env.humidity?.value || 60,
      season: this._getSeason(),
      mortalityRate: contextResult?.result?.livestock_analysis?.recentMortality || 0,
    };
  }

  /**
   * 조치 계획 최종 구성
   */
  _buildActionPlan(revisedActions, riskLevel) {
    return {
      immediate: revisedActions.immediate.map((item, i) => ({
        order: i + 1,
        action: item.action,
        priority: item.priority,
        deadline: this._getDeadline(item.priority),
        responsible: this._getResponsible(item.action),
        sourceCase: item.sourceCase,
        reason: item.reason || null,
      })),
      short_term: revisedActions.shortTerm.map((item, i) => ({
        order: i + 1,
        action: item.action,
        priority: item.priority,
        deadline: this._getDeadline(item.priority, 'short'),
        responsible: this._getResponsible(item.action),
      })),
      preventive: revisedActions.preventive.map((item, i) => ({
        order: i + 1,
        action: item.action,
        priority: item.priority,
      })),
    };
  }

  /**
   * 권고 메시지 생성 (LLM 교체 가능 인터페이스)
   */
  async _generateRecommendation(riskLevel, actionPlan, similarCases, contextResult, riskResult) {
    // LLM이 연동되어 있으면 LLM으로 생성
    if (this.llmEndpoint) {
      return await this._generateWithLLM(riskLevel, actionPlan, similarCases, contextResult, riskResult);
    }

    // 룰 기반 템플릿 생성
    return this._generateWithTemplate(riskLevel, actionPlan, similarCases, contextResult, riskResult);
  }

  /**
   * LLM 기반 권고 메시지 (축산전용 LLM 연동 시 활성화)
   */
  async _generateWithLLM(riskLevel, actionPlan, similarCases, contextResult, riskResult) {
    const prompt = this._buildLLMPrompt(riskLevel, actionPlan, similarCases, contextResult, riskResult);

    try {
      const response = await fetch(this.llmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'livestock-llm',
          messages: [
            { role: 'system', content: '당신은 축산 질병 대응 전문가 AI입니다. 농장주가 즉시 실행 가능한 조치 계획을 한국어로 제공하세요.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });
      const result = await response.json();
      return result.choices[0].message.content;
    } catch (err) {
      // LLM 실패 시 템플릿으로 폴백
      return this._generateWithTemplate(riskLevel, actionPlan, similarCases, contextResult, riskResult);
    }
  }

  /**
   * LLM 프롬프트 구성
   */
  _buildLLMPrompt(riskLevel, actionPlan, similarCases, contextResult, riskResult) {
    const feeding = contextResult?.result?.feeding_analysis || {};
    const severity = riskResult?.result?.severity_score || 0;
    const caseSummary = similarCases.slice(0, 2).map(({ case: c, similarity }) =>
      `- ${c.title} (유사도 ${Math.round(similarity * 100)}%): ${c.outcome}`
    ).join('\n');

    return `현재 상황:
- 위험 단계: ${riskLevel}
- 급이량 변화: ${feeding.changeRate3d || 0}% (3일)
- 심각도: ${severity}
- 패턴: ${feeding.pattern || 'unknown'}

유사 과거 사례:
${caseSummary || '해당 없음'}

즉시 조치:
${actionPlan.immediate.map(a => `- ${a.action}`).join('\n')}

위 상황과 사례를 기반으로:
1. 농장주에게 전달할 명확한 권고 메시지를 작성하세요.
2. "왜 이 조치가 필요한가"에 대한 인과관계를 설명하세요.
3. 조치의 예상 효과를 포함하세요.`;
  }

  /**
   * 룰 기반 권고 메시지 생성
   */
  _generateWithTemplate(riskLevel, actionPlan, similarCases, contextResult, riskResult) {
    const feeding = contextResult?.result?.feeding_analysis || {};
    const severity = riskResult?.result?.severity_score || 0;
    const anomalyType = riskResult?.result?.anomaly_classification?.primary_type || 'unknown';

    const stateLabels = { K1: '정상', K2: '주의', K3: '위험', K4: '긴급' };
    const stateLabel = stateLabels[riskLevel] || riskLevel;

    let message = '';

    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      message = `[긴급] 현재 위험 수준이 '${stateLabel}' 단계입니다. `;
      message += `급이량이 ${Math.abs(feeding.changeRate3d || 0)}% 감소하여 즉각적인 대응이 필요합니다.\n\n`;
      message += `즉시 조치 사항:\n`;
      actionPlan.immediate.slice(0, 4).forEach((a, i) => {
        message += `${i + 1}. ${a.action} (${a.deadline})\n`;
      });
    } else if (riskLevel === 'K3' || riskLevel === 'danger') {
      message = `[경고] 위험 수준 '${stateLabel}' 단계로 주의가 필요합니다.\n\n`;
      message += `권장 조치:\n`;
      actionPlan.immediate.slice(0, 3).forEach((a, i) => {
        message += `${i + 1}. ${a.action}\n`;
      });
    } else if (riskLevel === 'K2' || riskLevel === 'caution') {
      message = `[주의] 일부 지표에서 이상이 감지되었습니다. 모니터링을 강화하고 `;
      message += `원인 파악에 나서 주십시오.\n`;
    } else {
      message = `[정상] 현재 급이 패턴 및 환경이 안정적입니다. `;
      message += `정기 모니터링을 유지해 주십시오.`;
    }

    // 유사 사례 근거 추가
    if (similarCases.length > 0 && riskLevel !== 'K1') {
      const topCase = similarCases[0].case;
      message += `\n\n참고 사례: ${topCase.title} (유사도 ${Math.round(similarCases[0].similarity * 100)}%)`;
      message += `\n과거 결과: ${topCase.outcome}`;
      if (topCase.lessonsLearned) {
        message += `\n교훈: ${topCase.lessonsLearned}`;
      }
    }

    return message;
  }

  /**
   * XAI 인과관계 설명 생성
   */
  _generateExplanations(similarCases, riskResult, contextResult, actionPlan) {
    const explanations = [];
    const feeding = contextResult?.result?.feeding_analysis || {};
    const riskLevel = riskResult?.result?.current_state || 'K1';

    // 1. 왜 이 위험 수준인가?
    explanations.push({
      question: '왜 현재 위험 수준이 이렇게 판정되었나요?',
      answer: this._explainRiskLevel(riskLevel, feeding, riskResult),
    });

    // 2. 왜 이 조치가 필요한가?
    if (actionPlan.immediate.length > 0) {
      explanations.push({
        question: '왜 이 조치들이 필요한가요?',
        answer: this._explainActions(actionPlan, similarCases, feeding),
      });
    }

    // 3. 유사 사례와의 비교
    if (similarCases.length > 0) {
      explanations.push({
        question: '과거에 비슷한 상황이 있었나요?',
        answer: this._explainSimilarCases(similarCases),
      });
    }

    return explanations;
  }

  _explainRiskLevel(riskLevel, feeding, riskResult) {
    const severity = riskResult?.result?.severity_score || 0;
    const trajectory = riskResult?.result?.risk_timeline_description || '';

    if (riskLevel === 'K4') {
      return `급이량이 기준 대비 ${Math.abs(feeding.changeRate3d || 0)}% 감소하고, ` +
        `심각도 점수가 ${severity}으로 매우 높습니다. ` +
        `HMM 모델 분석 결과 긴급 상태로 판정되었습니다. ${trajectory}`;
    }
    if (riskLevel === 'K3') {
      return `급이 패턴에서 유의미한 이상이 지속되고 있으며, ` +
        `심각도 ${severity}로 위험 수준입니다.`;
    }
    if (riskLevel === 'K2') {
      return `일부 지표에서 경미한 이상이 감지되어 주의 단계입니다. ` +
        `급이량 변화율 ${feeding.changeRate3d || 0}%.`;
    }
    return '모든 지표가 정상 범위 내에 있습니다.';
  }

  _explainActions(actionPlan, similarCases, feeding) {
    const parts = [];

    if (feeding.pattern === 'acute_drop') {
      parts.push('급이량이 급격히 감소하는 패턴은 질병 초기 증상과 일치하므로, 격리 및 신고가 최우선입니다.');
    }

    if (similarCases.length > 0) {
      const topCase = similarCases[0].case;
      parts.push(`과거 유사 사례(${topCase.title})에서 ${topCase.lessonsLearned || '동일 조치를 시행하여 효과가 있었습니다.'}`);
    }

    parts.push(`조치의 예상 효과: 과거 유사 사례 기준 평균 효과도 ${
      similarCases.length > 0 ? Math.round(similarCases.reduce((s, c) => s + (c.case.effectiveness || 0), 0) / similarCases.length * 100) + '%' : '데이터 부족'
    }`);

    return parts.join(' ');
  }

  _explainSimilarCases(similarCases) {
    return similarCases.map(({ case: c, similarity }) =>
      `${c.title} (유사도 ${Math.round(similarity * 100)}%): ${c.outcome}`
    ).join('\n');
  }

  /**
   * 중복/유사 조치 제거
   */
  _deduplicateActions(actions) {
    const keywords = ['격리', '신고', '소독', '환기', '검사', '사료', '체온', '출하', '쿨링', '음수'];

    for (const phase of ['immediate', 'shortTerm', 'preventive']) {
      if (!actions[phase]) continue;
      const seen = new Set();
      actions[phase] = actions[phase].filter(item => {
        // 키워드 기반 중복 체크
        const matchedKeyword = keywords.find(kw => item.action.includes(kw));
        const key = matchedKeyword || item.action.slice(0, 10);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // 최대 5건
      actions[phase] = actions[phase].slice(0, 5);
    }
  }

  // --- 유틸리티 ---
  _getDeadline(priority, phase) {
    if (priority === 'critical') return '즉시 (30분 이내)';
    if (priority === 'high') return phase === 'short' ? '4시간 이내' : '1시간 이내';
    if (priority === 'medium') return phase === 'short' ? '당일' : '2시간 이내';
    return '24시간 이내';
  }

  _getResponsible(action) {
    if (action.includes('신고')) return '농장주';
    if (action.includes('격리') || action.includes('소독')) return '방역 담당자';
    if (action.includes('검사') || action.includes('체온')) return '수의사/관리자';
    if (action.includes('환기') || action.includes('쿨링') || action.includes('팬')) return '시설 관리자';
    if (action.includes('사료') || action.includes('급이')) return '사양 관리자';
    return '농장 관리자';
  }

  _getSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }
}

module.exports = { PlanningAgent };
