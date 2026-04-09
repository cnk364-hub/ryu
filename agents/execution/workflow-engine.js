/**
 * Workflow Engine - 워크플로우 엔진
 *
 * 대응 계획을 실행 가능한 워크플로우로 변환하고 순차/병렬 실행 관리
 *
 * 기능:
 * - 조치 계획 → 실행 워크플로우 변환
 * - 단계별 상태 추적 (pending → running → completed/failed/skipped)
 * - 조건부 분기 (위험 단계별 다른 경로)
 * - 타임아웃 및 에스컬레이션
 * - 반복 업무 자동화 (알림 워크플로우)
 */

class WorkflowEngine {
  constructor() {
    this.workflows = new Map();  // 활성 워크플로우
    this.history = [];           // 완료된 워크플로우 이력
  }

  /**
   * 조치 계획 → 실행 워크플로우 생성
   *
   * @param {Object} actionPlan - Planning Agent의 조치 계획
   * @param {Object} context - 현재 상황 컨텍스트
   * @returns {Object} 워크플로우 정의
   */
  createWorkflow(actionPlan, context) {
    const workflowId = 'WF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const riskLevel = context.riskLevel || 'K1';

    // 조치를 워크플로우 스텝으로 변환
    const steps = [];
    let stepOrder = 0;

    // 즉시 조치 → 병렬 실행 가능한 그룹으로 분류
    const immediateGroups = this._groupByDependency(actionPlan.immediate || []);
    for (const group of immediateGroups) {
      stepOrder++;
      steps.push({
        stepId: `STEP-${stepOrder}`,
        phase: 'immediate',
        parallel: group.length > 1,
        tasks: group.map((action, i) => this._createTask(action, stepOrder, i, riskLevel)),
        status: 'pending',
        startedAt: null,
        completedAt: null,
      });
    }

    // 단기 조치 → 순차 실행
    for (const action of (actionPlan.short_term || [])) {
      stepOrder++;
      steps.push({
        stepId: `STEP-${stepOrder}`,
        phase: 'short_term',
        parallel: false,
        tasks: [this._createTask(action, stepOrder, 0, riskLevel)],
        status: 'pending',
        startedAt: null,
        completedAt: null,
      });
    }

    // 예방 조치
    for (const action of (actionPlan.preventive || [])) {
      stepOrder++;
      steps.push({
        stepId: `STEP-${stepOrder}`,
        phase: 'preventive',
        parallel: false,
        tasks: [this._createTask(action, stepOrder, 0, riskLevel)],
        status: 'pending',
        startedAt: null,
        completedAt: null,
      });
    }

    // 조건부 분기 추가
    const conditionalSteps = this._addConditionalBranches(riskLevel, context);
    steps.push(...conditionalSteps);

    const workflow = {
      workflowId,
      riskLevel,
      status: 'created',
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      steps,
      totalTasks: steps.reduce((s, step) => s + step.tasks.length, 0),
      completedTasks: 0,
      currentStep: null,
      escalation: this._getEscalationRules(riskLevel),
    };

    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  /**
   * 워크플로우 실행 시작
   */
  startWorkflow(workflowId) {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`워크플로우 ${workflowId} 없음`);

    wf.status = 'running';
    wf.startedAt = new Date().toISOString();

    // 첫 번째 스텝 시작
    if (wf.steps.length > 0) {
      wf.currentStep = wf.steps[0].stepId;
      wf.steps[0].status = 'running';
      wf.steps[0].startedAt = new Date().toISOString();
      wf.steps[0].tasks.forEach(t => { t.status = 'running'; t.startedAt = new Date().toISOString(); });
    }

    return wf;
  }

  /**
   * 태스크 완료 처리
   */
  completeTask(workflowId, taskId, result) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return null;

    for (const step of wf.steps) {
      const task = step.tasks.find(t => t.taskId === taskId);
      if (task) {
        task.status = result.success ? 'completed' : 'failed';
        task.completedAt = new Date().toISOString();
        task.result = result;
        wf.completedTasks++;

        // 스텝의 모든 태스크 완료 확인
        const allDone = step.tasks.every(t => t.status === 'completed' || t.status === 'failed' || t.status === 'skipped');
        if (allDone) {
          step.status = step.tasks.some(t => t.status === 'failed') ? 'partial' : 'completed';
          step.completedAt = new Date().toISOString();
          this._advanceWorkflow(wf);
        }
        break;
      }
    }

    return wf;
  }

  /**
   * 워크플로우 진행 (다음 스텝)
   */
  _advanceWorkflow(wf) {
    const nextStep = wf.steps.find(s => s.status === 'pending');
    if (nextStep) {
      wf.currentStep = nextStep.stepId;
      nextStep.status = 'running';
      nextStep.startedAt = new Date().toISOString();
      nextStep.tasks.forEach(t => {
        if (t.condition && !this._evaluateCondition(t.condition, wf)) {
          t.status = 'skipped';
        } else {
          t.status = 'running';
          t.startedAt = new Date().toISOString();
        }
      });
    } else {
      wf.status = 'completed';
      wf.completedAt = new Date().toISOString();
      wf.currentStep = null;
      this.history.push({ ...wf });
    }
  }

  /**
   * 워크플로우 현재 상태 조회
   */
  getStatus(workflowId) {
    const wf = this.workflows.get(workflowId);
    if (!wf) return null;

    const progress = wf.totalTasks > 0 ? Math.round((wf.completedTasks / wf.totalTasks) * 100) : 0;

    return {
      workflowId: wf.workflowId,
      status: wf.status,
      progress,
      currentStep: wf.currentStep,
      totalTasks: wf.totalTasks,
      completedTasks: wf.completedTasks,
      steps: wf.steps.map(s => ({
        stepId: s.stepId,
        phase: s.phase,
        status: s.status,
        tasksTotal: s.tasks.length,
        tasksCompleted: s.tasks.filter(t => t.status === 'completed').length,
      })),
    };
  }

  /**
   * 태스크 생성
   */
  _createTask(action, stepOrder, taskIndex, riskLevel) {
    const actionText = typeof action === 'string' ? action : action.action;
    const priority = action.priority || 'medium';

    return {
      taskId: `TASK-${stepOrder}-${taskIndex}`,
      action: actionText,
      priority,
      responsible: action.responsible || this._inferResponsible(actionText),
      deadline: action.deadline || this._inferDeadline(priority),
      status: 'pending',
      startedAt: null,
      completedAt: null,
      result: null,
      notifications: this._getNotificationTargets(actionText, riskLevel),
      condition: null,
    };
  }

  /**
   * 조건부 분기 (위험 단계별 추가 워크플로우)
   */
  _addConditionalBranches(riskLevel, context) {
    const branches = [];
    let stepOrder = 100;

    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      stepOrder++;
      branches.push({
        stepId: `STEP-${stepOrder}`,
        phase: 'escalation',
        parallel: false,
        tasks: [{
          taskId: `TASK-${stepOrder}-0`,
          action: '수의사 긴급 출동 요청',
          priority: 'critical',
          responsible: '농장주',
          deadline: '즉시',
          status: 'pending',
          notifications: [{ type: 'sms', target: 'vet' }, { type: 'call', target: 'vet' }],
          condition: { riskLevel: ['K4', 'emergency'] },
          startedAt: null, completedAt: null, result: null,
        }, {
          taskId: `TASK-${stepOrder}-1`,
          action: '방역 당국 정밀검사 요청',
          priority: 'critical',
          responsible: '농장주',
          deadline: '1시간 이내',
          status: 'pending',
          notifications: [{ type: 'system', target: 'quarantine_authority' }],
          condition: { riskLevel: ['K4', 'emergency'] },
          startedAt: null, completedAt: null, result: null,
        }],
        status: 'pending',
        startedAt: null, completedAt: null,
      });
    }

    if (riskLevel === 'K3' || riskLevel === 'K4' || riskLevel === 'danger' || riskLevel === 'emergency') {
      stepOrder++;
      branches.push({
        stepId: `STEP-${stepOrder}`,
        phase: 'monitoring_setup',
        parallel: false,
        tasks: [{
          taskId: `TASK-${stepOrder}-0`,
          action: '모니터링 주기 강화 (6시간 → 1시간)',
          priority: 'high',
          responsible: '시스템',
          deadline: '즉시',
          status: 'pending',
          notifications: [],
          condition: { riskLevel: ['K3', 'K4', 'danger', 'emergency'] },
          startedAt: null, completedAt: null, result: null,
        }],
        status: 'pending',
        startedAt: null, completedAt: null,
      });
    }

    return branches;
  }

  /**
   * 에스컬레이션 규칙
   */
  _getEscalationRules(riskLevel) {
    if (riskLevel === 'K4' || riskLevel === 'emergency') {
      return {
        timeoutMinutes: 30,
        escalateTo: ['farm_owner', 'vet', 'quarantine_authority'],
        autoNotify: true,
        repeatInterval: 15,
      };
    }
    if (riskLevel === 'K3' || riskLevel === 'danger') {
      return { timeoutMinutes: 120, escalateTo: ['farm_owner', 'vet'], autoNotify: true, repeatInterval: 60 };
    }
    return { timeoutMinutes: 480, escalateTo: ['farm_owner'], autoNotify: false, repeatInterval: null };
  }

  /**
   * 의존성 기반 그룹화 (병렬 실행 가능 태스크 묶음)
   */
  _groupByDependency(actions) {
    if (actions.length === 0) return [];

    // critical은 한 그룹, 나머지는 한 그룹
    const critical = actions.filter(a => a.priority === 'critical');
    const others = actions.filter(a => a.priority !== 'critical');

    const groups = [];
    if (critical.length > 0) groups.push(critical);
    if (others.length > 0) groups.push(others);
    return groups;
  }

  /**
   * 알림 대상 추론
   */
  _getNotificationTargets(action, riskLevel) {
    const targets = [];
    if (action.includes('신고')) targets.push({ type: 'sms', target: 'quarantine_authority' });
    if (action.includes('수의사') || action.includes('검사')) targets.push({ type: 'sms', target: 'vet' });
    if (action.includes('격리') || action.includes('소독')) targets.push({ type: 'push', target: 'farm_staff' });
    if (riskLevel === 'K4' || riskLevel === 'emergency') targets.push({ type: 'sms', target: 'farm_owner' });
    return targets;
  }

  _inferResponsible(action) {
    if (action.includes('신고')) return '농장주';
    if (action.includes('격리') || action.includes('소독')) return '방역 담당자';
    if (action.includes('검사') || action.includes('체온')) return '수의사/관리자';
    if (action.includes('환기') || action.includes('쿨링')) return '시설 관리자';
    return '농장 관리자';
  }

  _inferDeadline(priority) {
    if (priority === 'critical') return '즉시 (30분 이내)';
    if (priority === 'high') return '1시간 이내';
    if (priority === 'medium') return '당일';
    return '24시간 이내';
  }

  _evaluateCondition(condition, wf) {
    if (!condition) return true;
    if (condition.riskLevel && !condition.riskLevel.includes(wf.riskLevel)) return false;
    return true;
  }
}

module.exports = { WorkflowEngine };
