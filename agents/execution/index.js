/**
 * Execution Agent (조치실행 에이전트)
 *
 * 역할: 생성된 대응계획을 기반으로 경보 발송, 작업 지시, 시스템 연계를
 *       통해 현장 조치를 실행하고 대응 프로세스를 자동화
 *
 * 핵심 기술: 워크플로우 엔진, API Orchestration, 룰 기반 제어
 *
 * 입력: 조치 계획, 경보 조건, 사용자/시스템 정보
 * 출력: 경보 발송 결과, 작업지시, 실행 로그, 조치 이력
 */

const { WorkflowEngine } = require('./workflow-engine');
const { AlertService } = require('./alert-service');

class ExecutionAgent {
  constructor(config = {}) {
    this.config = config;
    this.workflowEngine = new WorkflowEngine();
    this.alertService = new AlertService(config.alertConfig);
    this.executionLog = [];
    this.llmEndpoint = config.llmEndpoint || null;
  }

  /**
   * 메인 실행
   *
   * @param {Object} input
   * @param {Object} input.planningResult - Planning Agent 결과
   * @param {Object} input.contextResult - Context Agent 결과
   * @param {Object} input.riskResult - Risk Trajectory Agent 결과
   * @param {Object} input.farmInfo - 농장 정보
   * @param {Object} input.contacts - 연락처 정보
   * @returns {Object} 실행 결과
   */
  async analyze(input) {
    const { planningResult, contextResult, riskResult, farmInfo, contacts } = input;
    const startTime = Date.now();

    const riskLevel = riskResult?.result?.current_state || 'K1';
    const actionPlan = planningResult?.result?.action_plan || {};
    const situation = contextResult?.result?.situation_summary || '';

    // 1. 워크플로우 생성
    const workflow = this.workflowEngine.createWorkflow(actionPlan, { riskLevel });

    // 2. 경보 메시지 생성
    const alerts = this.alertService.generateAlerts({
      riskLevel,
      situation,
      actions: actionPlan.immediate || [],
      farmInfo: farmInfo || {},
      contacts: contacts || {},
    });

    // 3. 경보 전송
    const alertResults = [];
    for (const alert of alerts) {
      const result = await this.alertService.sendAlert(alert);
      alertResults.push(result);
    }

    // 4. 워크플로우 실행 시작
    const startedWorkflow = this.workflowEngine.startWorkflow(workflow.workflowId);

    // 5. 실행 체크리스트 생성
    const checklist = this._buildChecklist(actionPlan, riskLevel);

    // 6. 외부 시스템 연동 조치 (시뮬레이션)
    const systemActions = this._executeSystemActions(riskLevel, contextResult);

    // 7. 실행 로그 기록
    const logEntry = this._createLogEntry(riskLevel, workflow, alertResults, systemActions);
    this.executionLog.push(logEntry);

    const duration = Date.now() - startTime;

    return {
      agentId: 'execution',
      agentName: 'Execution Agent (조치실행)',
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      result: {
        alert_results: alertResults.map(r => ({
          alertId: r.alertId,
          target: r.target,
          status: r.status,
          priority: r.priority,
          channels: r.deliveryResults.map(d => d.channel),
          message_preview: r.message.slice(0, 100) + (r.message.length > 100 ? '...' : ''),
        })),
        workflow: {
          workflowId: startedWorkflow.workflowId,
          status: startedWorkflow.status,
          totalTasks: startedWorkflow.totalTasks,
          steps: startedWorkflow.steps.map(s => ({
            stepId: s.stepId,
            phase: s.phase,
            status: s.status,
            tasks: s.tasks.map(t => ({
              taskId: t.taskId,
              action: t.action,
              priority: t.priority,
              responsible: t.responsible,
              deadline: t.deadline,
              status: t.status,
            })),
          })),
          escalation: startedWorkflow.escalation,
        },
        checklist,
        system_actions: systemActions,
        execution_log: logEntry,
        vet_required: ['K3', 'K4', 'danger', 'emergency'].includes(riskLevel),
      },
    };
  }

  /**
   * 실행 체크리스트 생성
   */
  _buildChecklist(actionPlan, riskLevel) {
    const items = [];
    let order = 0;

    for (const action of (actionPlan.immediate || [])) {
      order++;
      const text = typeof action === 'string' ? action : action.action;
      items.push({
        order,
        action: text,
        priority: action.priority || (riskLevel === 'K4' ? 'high' : 'medium'),
        responsible: action.responsible || '농장 관리자',
        deadline: action.deadline || '당일',
        checked: false,
      });
    }

    for (const action of (actionPlan.short_term || [])) {
      order++;
      const text = typeof action === 'string' ? action : action.action;
      items.push({
        order,
        action: text,
        priority: action.priority || 'medium',
        responsible: action.responsible || '농장 관리자',
        deadline: action.deadline || '24시간 이내',
        checked: false,
      });
    }

    return items;
  }

  /**
   * 외부 시스템 연동 (시뮬레이션)
   * 실제 운영 시: CCTV, IoT 제어, ERP 등 연동
   */
  _executeSystemActions(riskLevel, contextResult) {
    const actions = [];

    // 모니터링 주기 조정
    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      actions.push({ system: 'monitoring', action: '센서 수집 주기 변경: 5분 → 1분', status: 'executed' });
      actions.push({ system: 'cctv', action: 'CCTV 녹화 모드 전환: 연속 녹화', status: 'executed' });
      actions.push({ system: 'access_control', action: '출입문 자동 잠금', status: 'executed' });
    } else if (riskLevel === 'K3' || riskLevel === 'danger') {
      actions.push({ system: 'monitoring', action: '센서 수집 주기 변경: 5분 → 2분', status: 'executed' });
    }

    // 환경 제어
    const envStatus = contextResult?.result?.environment_analysis?.status;
    if (envStatus === 'critical') {
      actions.push({ system: 'hvac', action: '환기 시스템 최대 출력 전환', status: 'executed' });
      actions.push({ system: 'cooling', action: '쿨링 패드 자동 가동', status: 'executed' });
    }

    return actions;
  }

  /**
   * 실행 로그 생성
   */
  _createLogEntry(riskLevel, workflow, alertResults, systemActions) {
    return {
      logId: 'LOG-' + Date.now(),
      timestamp: new Date().toISOString(),
      riskLevel,
      workflowId: workflow.workflowId,
      alertsSent: alertResults.length,
      alertsDelivered: alertResults.filter(r => r.status === 'delivered').length,
      systemActions: systemActions.length,
      totalTasks: workflow.totalTasks,
    };
  }
}

module.exports = { ExecutionAgent };
