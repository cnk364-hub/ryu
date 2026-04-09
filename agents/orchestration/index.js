/**
 * Orchestration Agent (협업 오케스트레이션 에이전트)
 *
 * 역할: 에이전트 간 협업을 조율하여 조기탐지→위험판단→대응→관찰→
 *       개선의 전 주기 루프를 통합 운영하고 시나리오별 흐름을 동적으로 제어
 *
 * 핵심 기술: LangGraph (상태머신), State Machine, LLM
 *
 * 입력: 각 에이전트 출력, 시스템 상태, 목표 조건
 * 출력: 루프 제어 신호, 호출 흐름, 통합 상태, 운영 로그
 */

const { StateMachine } = require('./state-machine');
const { SCENARIO_PROFILES, detectScenario } = require('../scenario-profiles');

// 에이전트 모듈 로드
const { ContextAgent } = require('../context/index');
const { RiskTrajectoryAgent } = require('../risk-trajectory/index');
const { PlanningAgent } = require('../planning/index');
const { ExecutionAgent } = require('../execution/index');
const { MonitoringAgent } = require('../monitoring/index');
const { RecoveryAgent } = require('../recovery/index');

class OrchestrationAgent {
  constructor(config = {}) {
    this.config = {
      maxLoops: config.maxLoops || 3,
      autoRun: config.autoRun !== false,
      ...config,
    };

    // 상태 머신
    this.stateMachine = new StateMachine();
    this.stateMachine.maxLoops = this.config.maxLoops;

    // 에이전트 인스턴스
    this.agents = {
      context: new ContextAgent(config.contextConfig),
      risk_trajectory: new RiskTrajectoryAgent(config.riskConfig),
      planning: new PlanningAgent(config.planningConfig),
      execution: new ExecutionAgent(config.executionConfig),
      monitoring: new MonitoringAgent(config.monitoringConfig),
      recovery: new RecoveryAgent(config.recoveryConfig),
    };

    // 파이프라인 결과 저장
    this.pipelineResults = {};
    this.operationLog = [];
    this.llmEndpoint = config.llmEndpoint || null;
  }

  /**
   * 전체 파이프라인 실행
   *
   * @param {Object} input
   * @param {string} input.scenario - 시나리오 ID
   * @param {Array} input.feedingData - 급이 데이터
   * @param {Object} input.environmentData - 환경 데이터
   * @param {Object} input.farmInfo - 농장 정보
   * @param {Object} input.livestockInfo - 사육 정보
   * @param {Function} input.onStep - 단계별 콜백 (선택)
   * @returns {Object} 통합 결과
   */
  async runPipeline(input) {
    const pipelineStart = Date.now();
    this.stateMachine.reset();
    this.pipelineResults = {};
    this.operationLog = [];

    const { feedingData, environmentData, farmInfo, livestockInfo, onStep } = input;

    // 시나리오 감지 및 프로필 로드
    const scenarioId = input.scenario || detectScenario(feedingData, environmentData);
    const profile = SCENARIO_PROFILES[scenarioId] || SCENARIO_PROFILES.disease_asf;
    this.currentProfile = profile;

    this._log('pipeline_start', `파이프라인 시작 — 시나리오: ${profile.name}`);

    // IDLE → CONTEXT
    this.stateMachine.transition();

    // === CONTEXT Agent ===
    this._log('agent_start', `Context Agent 시작 (${profile.context.analysisScope})`);
    this.agents.context.config.anomalyThreshold = profile.context.anomalyThreshold;
    const contextResult = await this.agents.context.analyze({
      feedingData, environmentData, farmInfo, livestockInfo,
      scenarioProfile: profile.context,
    });
    this.pipelineResults.context = contextResult;
    this._log('agent_complete', 'Context Agent 완료', { duration: contextResult.duration_ms });
    if (onStep) onStep('context', contextResult);

    // CONTEXT → RISK
    this.stateMachine.transition();

    // === RISK TRAJECTORY Agent ===
    this._log('agent_start', 'Risk Trajectory Agent 시작');
    const anomalyScores = contextResult.result.anomaly_detection.anomaly_indices
      ? feedingData.map((_, i) => {
          const score = contextResult.result.anomaly_detection.anomaly_score || 0.5;
          return contextResult.result.anomaly_detection.anomaly_indices.includes(i) ? Math.min(1, score + 0.1) : Math.max(0, score - 0.2);
        })
      : feedingData.map(() => 0.3);

    const riskResult = await this.agents.risk_trajectory.analyze({
      anomalyScores,
      feedingData,
      contextResult: contextResult.result,
    });
    this.pipelineResults.risk_trajectory = riskResult;
    this._log('agent_complete', 'Risk Trajectory Agent 완료', { state: riskResult.result.current_state });
    if (onStep) onStep('risk_trajectory', riskResult);

    // RISK → PLANNING
    this.stateMachine.transition();

    // === PLANNING Agent ===
    this._log('agent_start', 'Planning Agent 시작');
    const planningResult = await this.agents.planning.analyze({
      contextResult, riskResult, farmPolicy: input.farmPolicy,
    });
    this.pipelineResults.planning = planningResult;
    this._log('agent_complete', 'Planning Agent 완료', { actions: planningResult.result.action_plan.immediate.length });
    if (onStep) onStep('planning', planningResult);

    // PLANNING → EXECUTION
    this.stateMachine.transition();

    // === EXECUTION Agent ===
    this._log('agent_start', 'Execution Agent 시작');
    const executionResult = await this.agents.execution.analyze({
      planningResult, contextResult, riskResult, farmInfo,
    });
    this.pipelineResults.execution = executionResult;
    this._log('agent_complete', 'Execution Agent 완료', { alerts: executionResult.result.alert_results.length });
    if (onStep) onStep('execution', executionResult);

    // EXECUTION → MONITORING
    this.stateMachine.transition();

    // === MONITORING Agent ===
    this._log('agent_start', 'Monitoring Agent 시작');
    const monitoringResult = await this.agents.monitoring.analyze({
      beforeData: feedingData.slice(0, -3),
      afterData: feedingData.slice(-7),
      beforeScores: anomalyScores.slice(0, -3),
      afterScores: anomalyScores.slice(-5),
      beforeState: riskResult.result.current_state,
      afterState: riskResult.result.current_state,
      responseTimeHours: 2,
    });
    this.pipelineResults.monitoring = monitoringResult;
    this._log('agent_complete', 'Monitoring Agent 완료', { score: monitoringResult.result.action_effectiveness.overall_score });
    if (onStep) onStep('monitoring', monitoringResult);

    // MONITORING → 분기 (RECOVERY or COMPLETE or HUMAN_REVIEW)
    const transition = this.stateMachine.transition({
      monitoringResult: monitoringResult.result,
      riskLevel: riskResult.result.current_state,
    });

    // === 루프: RECOVERY → MONITORING ===
    if (transition.currentState === 'RECOVERY') {
      this._log('loop_start', `복구 루프 시작 (${this.stateMachine.loopCount}회차)`);

      const recoveryResult = await this.agents.recovery.analyze({
        monitoringResult, riskResult, hoursElapsed: 6,
        currentContext: { envStatus: contextResult.result.environment_analysis?.status || 'normal' },
      });
      this.pipelineResults.recovery = recoveryResult;
      this._log('agent_complete', 'Recovery Agent 완료', { strategy: recoveryResult.result.recovery_strategy.strategy });
      if (onStep) onStep('recovery', recoveryResult);

      // RECOVERY → MONITORING (루프백)
      this.stateMachine.transition();
      this._log('loop_end', `복구 루프 ${this.stateMachine.loopCount}회차 완료`);

      // 루프 후 COMPLETE로 전이 (데모: 1회 루프 후 종료)
      this.stateMachine.forceState('COMPLETE', '데모 모드 — 1회 루프 후 종료');
    }

    if (transition.currentState === 'HUMAN_REVIEW') {
      this._log('human_review', '관리자 확인 필요', { reason: transition.reason });
    }

    // === 통합 보고서 생성 ===
    const finalReport = this._generateFinalReport(input);
    const pipelineDuration = Date.now() - pipelineStart;

    this._log('pipeline_complete', `파이프라인 완료 (${pipelineDuration}ms)`);

    return {
      agentId: 'orchestration',
      agentName: 'Orchestration Agent (협업오케스트레이션)',
      timestamp: new Date().toISOString(),
      duration_ms: pipelineDuration,
      result: {
        scenario: { id: profile.id, name: profile.name, trigger: profile.trigger },
        final_report: finalReport,
        pipeline_state: this.stateMachine.getState(),
        agent_results: Object.fromEntries(
          Object.entries(this.pipelineResults).map(([k, v]) => [k, {
            agentId: v.agentId,
            duration_ms: v.duration_ms,
            summary: this._summarizeResult(k, v),
          }])
        ),
        loop_count: this.stateMachine.loopCount,
        operation_log: this.operationLog,
      },
    };
  }

  /**
   * 최종 통합 보고서 생성
   */
  _generateFinalReport(input) {
    const ctx = this.pipelineResults.context?.result || {};
    const risk = this.pipelineResults.risk_trajectory?.result || {};
    const plan = this.pipelineResults.planning?.result || {};
    const exec = this.pipelineResults.execution?.result || {};
    const mon = this.pipelineResults.monitoring?.result || {};
    const rec = this.pipelineResults.recovery?.result || {};

    const riskLevel = risk.current_state || 'K1';
    const labels = { K1: '정상', K2: '주의', K3: '위험', K4: '긴급' };
    const alertLevels = { K1: 'normal', K2: 'caution', K3: 'danger', K4: 'emergency' };

    // 시나리오별 농장주 메시지
    const profile = this.currentProfile || {};
    let farmerMessage;
    if (profile.id === 'shipment_optimization') {
      const feeding = ctx.feeding_analysis || {};
      farmerMessage = `[출하 분석] 현재 급이량 ${feeding.currentAvg || 0}kg, ` +
        `추세 ${feeding.trend === 'stable' ? '안정적' : feeding.trend || '확인중'}. ` +
        `${plan.recommendation || 'FCR 및 성장 데이터 기반 출하 최적 시기를 분석 중입니다.'}`;
    } else {
      farmerMessage = plan.recommendation || ctx.situation_summary || '현재 상태가 정상입니다.';
    }

    // 수의사 통보
    let vetNotification = null;
    if (['K3', 'K4'].includes(riskLevel)) {
      vetNotification = `${exec.vet_required ? '긴급' : '참고'} 통보: ${input.farmInfo?.name || '농장'} ` +
        `${labels[riskLevel]} 상태. ${ctx.situation_summary || ''} ` +
        `심각도 ${risk.severity_score || 0}. ${riskLevel === 'K4' ? '즉시 현장 방문 요청.' : '상황 미개선 시 방문 요청 예정.'}`;
    }

    return {
      final_decision: `${labels[riskLevel] || riskLevel} 단계 — ${this._getDecisionText(riskLevel, mon)}`,
      alert_level: alertLevels[riskLevel] || 'normal',
      risk_state: riskLevel,
      severity_score: risk.severity_score || 0,
      farmer_message: farmerMessage,
      vet_notification: vetNotification,
      key_metrics: {
        feeding_change: ctx.feeding_analysis?.changeRate3d || 0,
        anomaly_score: ctx.anomaly_detection?.anomaly_score || 0,
        risk_timeline: risk.risk_timeline_description || '',
        action_count: (plan.action_plan?.immediate?.length || 0),
        alerts_sent: exec.alert_results?.length || 0,
        effectiveness: mon.action_effectiveness?.overall_score || 0,
      },
      trajectory_log_id: `TRJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-3)}`,
    };
  }

  /**
   * 의사결정 텍스트
   */
  _getDecisionText(riskLevel, monResult) {
    const effectiveness = monResult?.action_effectiveness?.overall_score || 0;
    if (riskLevel === 'K4') return '긴급 방역 조치 시행';
    if (riskLevel === 'K3') return '위험 경고 — 집중 모니터링 및 대응 조치 시행';
    if (riskLevel === 'K2') return '주의 단계 — 모니터링 강화 및 원인 파악';
    return '정상 — 정기 모니터링 유지';
  }

  /**
   * 에이전트 결과 요약
   */
  _summarizeResult(agentId, result) {
    const r = result.result;
    switch (agentId) {
      case 'context': return r.situation_summary?.slice(0, 80) || '';
      case 'risk_trajectory': return `상태: ${r.current_state}, 심각도: ${r.severity_score}`;
      case 'planning': return `조치 ${r.action_plan?.immediate?.length || 0}건, 유사사례 ${r.similar_cases?.length || 0}건`;
      case 'execution': return `경보 ${r.alert_results?.length || 0}건, 시스템조치 ${r.system_actions?.length || 0}건`;
      case 'monitoring': return `효과 ${r.action_effectiveness?.overall_score || 0}, ${r.state_change?.description || ''}`;
      case 'recovery': return `전략: ${r.recovery_strategy?.strategy || ''}, 수정조치 ${r.revised_actions?.length || 0}건`;
      default: return '';
    }
  }

  /**
   * 운영 로그 기록
   */
  _log(type, message, data = {}) {
    this.operationLog.push({
      timestamp: new Date().toISOString(),
      type,
      message,
      state: this.stateMachine.currentState,
      ...data,
    });
  }
}

module.exports = { OrchestrationAgent };
