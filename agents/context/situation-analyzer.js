/**
 * Situation Analyzer - 분석 결과를 종합하여 자연어 상황 요약 생성
 *
 * LLM 연동 전 단계: 룰 기반 템플릿으로 상황 요약 생성
 * LLM 연동 후: 이 모듈의 출력을 LLM 프롬프트의 입력으로 활용
 */

class SituationAnalyzer {
  constructor(config = {}) {
    this.llmEndpoint = config.llmEndpoint || null;
    this.templates = {
      emergency: {
        disease: '최근 {days}일간 급이량이 기준 대비 {changeRate}% 급감하여 가축 질병 감염 의심 상황입니다. {details}',
        environment: '축사 환경이 위험 수준에 도달했습니다. {details}',
      },
      danger: {
        feeding: '급이 패턴에서 유의미한 이상이 감지되었습니다. {details}',
        environment: '축사 환경 조건이 주의 수준을 초과했습니다. {details}',
      },
      caution: {
        feeding: '급이 패턴에 경미한 변화가 감지되었습니다. {details}',
        environment: '환경 일부 지표가 주의 범위에 진입했습니다. {details}',
      },
      normal: {
        default: '현재 급이 패턴 및 축사 환경 모두 정상 범위 내에 있습니다. {details}',
      },
    };
  }

  /**
   * 종합 상황 요약 생성
   * @param {Object} analysis - 전체 분석 결과
   * @returns {string} 자연어 상황 요약
   */
  async generateSummary(analysis) {
    // LLM 연동 시: 구조화된 데이터를 LLM에 전달하여 자연어 생성
    if (this.llmEndpoint) {
      return await this._generateWithLLM(analysis);
    }
    // 룰 기반 템플릿 (폴백)
    return this._generateWithTemplate(analysis);
  }

  /**
   * LLM 기반 자연어 요약 (Sinong 8B 연동 시 활성화)
   */
  async _generateWithLLM(analysis) {
    const { feedingAnalysis, envAnalysis, anomalyResults, riskIndicators } = analysis;
    try {
      const response = await fetch(this.llmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'livestock-llm',
          messages: [
            { role: 'system', content: '당신은 축산 전문 AI입니다. 센서 분석 결과를 농장주가 이해할 수 있는 한국어 상황 요약으로 변환하세요. 3~5문장으로 작성하세요.' },
            { role: 'user', content: JSON.stringify({ feedingAnalysis, envAnalysis, anomalyResults, riskIndicators }) },
          ],
          temperature: 0.3, max_tokens: 512,
        }),
      });
      const result = await response.json();
      return result.choices[0].message.content;
    } catch {
      return this._generateWithTemplate(analysis);
    }
  }

  _generateWithTemplate(analysis) {
    const { feedingAnalysis, envAnalysis, anomalyResults, riskIndicators, farmInfo } = analysis;
    const level = riskIndicators.level;
    const parts = [];

    // 1. 메인 상황 설명
    parts.push(this._generateMainStatement(level, feedingAnalysis, envAnalysis, anomalyResults));

    // 2. 급이 분석 상세
    parts.push(this._generateFeedingDetail(feedingAnalysis));

    // 3. 환경 분석 상세
    if (envAnalysis && envAnalysis.alerts && envAnalysis.alerts.length > 0) {
      parts.push(this._generateEnvDetail(envAnalysis));
    }

    // 4. 이상탐지 결과
    if (anomalyResults.isAnomaly) {
      parts.push(this._generateAnomalyDetail(anomalyResults));
    }

    return parts.filter(Boolean).join(' ');
  }

  /**
   * 메인 상황 문장 생성
   */
  _generateMainStatement(level, feeding, env, anomaly) {
    if (level === 'emergency') {
      if (feeding.changeRate3d < -25) {
        return `최근 3일간 급이량이 기준 대비 ${Math.abs(feeding.changeRate3d)}% 급감하여 ` +
          `가축 질병 감염 의심 상황입니다. ` +
          `현재 일평균 급이량 ${feeding.currentAvg}kg으로 기준선 ${feeding.baselineAvg}kg 대비 ` +
          `심각한 수준의 감소가 확인됩니다.`;
      }
      if (env && env.status === 'critical') {
        return `축사 환경이 위험 수준에 도달했습니다. ` +
          `즉각적인 환경 제어 조치가 필요합니다.`;
      }
      return `다수의 위험 지표가 긴급 수준에 도달했습니다. 즉각적인 확인 및 조치가 필요합니다.`;
    }

    if (level === 'danger') {
      return `급이 패턴에서 유의미한 이상이 감지되었습니다. ` +
        `최근 3일 급이량 변화율 ${feeding.changeRate3d}%로 주의 깊은 모니터링이 필요합니다.`;
    }

    if (level === 'caution') {
      return `급이 패턴에 경미한 변화가 감지되었습니다. ` +
        `현재 급이량 ${feeding.currentAvg}kg으로 기준선 대비 소폭 변동 중입니다.`;
    }

    return `현재 급이 패턴 및 축사 환경 모두 정상 범위 내에 있습니다. ` +
      `일평균 급이량 ${feeding.currentAvg}kg으로 안정적입니다.`;
  }

  /**
   * 급이 분석 상세 문장
   */
  _generateFeedingDetail(feeding) {
    const parts = [];

    // 추세 설명
    const trendText = {
      rapid_decline: '급격한 하락 추세를 보이고 있으며',
      gradual_decline: '점진적 하락 추세를 보이고 있으며',
      rapid_increase: '급격한 상승 추세를 보이고 있으며',
      gradual_increase: '점진적 상승 추세를 보이고 있으며',
      stable: '안정적인 추세를 유지하고 있으며',
    };

    const trend = trendText[feeding.trend] || '';
    if (trend) {
      parts.push(`급이량은 ${trend} 7일 기준 변화율은 ${feeding.changeRate7d}%입니다.`);
    }

    // 패턴 분류 설명
    if (feeding.pattern === 'acute_drop') {
      parts.push('급성 급이량 감소 패턴으로 질병 초기 증상과 유사합니다.');
    } else if (feeding.pattern === 'erratic') {
      parts.push('불규칙한 급이 패턴이 관찰되며 스트레스 요인 확인이 필요합니다.');
    }

    return parts.join(' ');
  }

  /**
   * 환경 분석 상세 문장
   */
  _generateEnvDetail(env) {
    const parts = [];

    if (env.thi && env.thi.status !== 'normal') {
      parts.push(`THI(온습도지수) ${env.thi.value}로 ` +
        `${env.thi.status === 'danger' ? '위험' : '주의'} 구간에 있습니다.`);
    }

    if (env.ventilation_status === 'critical') {
      parts.push('환기 시스템 상태가 비정상입니다.');
    }

    return parts.join(' ');
  }

  /**
   * 이상탐지 상세 문장
   */
  _generateAnomalyDetail(anomaly) {
    const parts = [];
    parts.push(`EIF 이상탐지 알고리즘에서 이상 점수 ${anomaly.latestScore.toFixed(2)}을 기록했습니다.`);

    if (anomaly.anomalyDays >= 3) {
      parts.push(`${anomaly.anomalyDays}일 연속 이상이 탐지되어 즉각적인 확인이 필요합니다.`);
    } else if (anomaly.anomalyDays >= 1) {
      parts.push(`${anomaly.anomalyDays}일간 이상이 탐지되었습니다.`);
    }

    return parts.join(' ');
  }
}

module.exports = { SituationAnalyzer };
