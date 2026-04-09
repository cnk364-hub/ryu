'use client';

import { useCallback } from 'react';
import { useAgentStore } from '@/store/agentStore';
import ScenarioCard from '@/components/scenarios/ScenarioCard';
import ExecutionStepper from '@/components/scenarios/ExecutionStepper';
import { SCENARIOS } from '@/lib/agents';
import { generateFeedingData, generateEnvironmentData } from '@/lib/simulator';
import type { ScenarioType, AgentId, AgentLogEntry, AgentResult } from '@/lib/types';

const AGENT_ORDER: AgentId[] = [
  'context', 'risk_trajectory', 'planning', 'execution', 'monitoring', 'recovery', 'orchestration',
];

const AGENT_NAMES: Record<AgentId, string> = {
  context: 'Context Agent (상황인식)',
  risk_trajectory: 'Risk Trajectory Agent (위험궤적분석)',
  planning: 'Planning Agent (대응계획)',
  execution: 'Execution Agent (조치실행)',
  monitoring: 'Monitoring Agent (관찰)',
  recovery: 'Recovery Agent (수정복구)',
  orchestration: 'Orchestration Agent (협업오케스트레이션)',
};

export default function ScenariosTab() {
  const {
    pipeline,
    startPipeline,
    setCurrentAgent,
    completeAgent,
    addLogEntry,
    updateLogEntry,
    completePipeline,
    setFeedingData,
    setEnvironmentData,
    setMetrics,
    setRiskLevel,
    setRecommendation,
    setActiveTab,
    updateAgentPerformance,
  } = useAgentStore();

  const runScenario = useCallback(async (scenarioId: string) => {
    const scenario = scenarioId as ScenarioType;
    startPipeline(scenario);

    // Generate simulation data
    const feedingData = generateFeedingData(scenario);
    const environmentData = generateEnvironmentData(scenario);
    setFeedingData(feedingData);
    setEnvironmentData(environmentData);

    // Update metrics based on scenario
    if (scenario === 'disease_asf') {
      setMetrics({
        feedingChangeRate: -35.2,
        anomalyDays: 3,
        estimatedRiskHours: 12,
        riskLevel: 'emergency',
      });
    } else if (scenario === 'environment_heat') {
      setMetrics({
        feedingChangeRate: -5.3,
        anomalyDays: 0,
        estimatedRiskHours: 48,
        riskLevel: 'caution',
      });
    } else {
      setMetrics({
        feedingChangeRate: 2.1,
        anomalyDays: 0,
        estimatedRiskHours: 999,
        riskLevel: 'normal',
      });
    }

    try {
      // Call the agent pipeline API via SSE
      const response = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          feedingData: feedingData.slice(-7), // Last 7 days
          environmentData,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              handleSSEEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } catch (error) {
      console.error('Pipeline error:', error);
      // Add error log
      addLogEntry({
        id: `error-${Date.now()}`,
        agentId: pipeline.currentAgent || 'orchestration',
        agentName: 'System',
        content: `파이프라인 오류: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        status: 'error',
      });
      completePipeline();
    }
  }, [startPipeline, setFeedingData, setEnvironmentData, setMetrics, addLogEntry, completePipeline, pipeline.currentAgent, setRiskLevel, setRecommendation, setActiveTab, updateAgentPerformance, setCurrentAgent, completeAgent, updateLogEntry]);

  function handleSSEEvent(event: { type: string; data: Record<string, unknown> }) {
    switch (event.type) {
      case 'agent_start': {
        const agentId = event.data.agentId as AgentId;
        setCurrentAgent(agentId);
        const logId = `log-${agentId}-${Date.now()}`;
        addLogEntry({
          id: logId,
          agentId,
          agentName: AGENT_NAMES[agentId] || agentId,
          content: `${AGENT_NAMES[agentId]} 분석 시작...`,
          timestamp: event.data.timestamp as string,
          duration_ms: 0,
          status: 'running',
        });
        break;
      }
      case 'agent_complete': {
        const agentId = event.data.agentId as AgentId;
        const result: AgentResult = {
          agentId,
          response: event.data.response as Record<string, unknown>,
          rawText: event.data.rawText as string,
          timestamp: event.data.timestamp as string,
          duration_ms: event.data.duration_ms as number,
        };
        completeAgent(agentId, result);

        // Update log
        const logContent = summarizeAgentResult(agentId, result);
        addLogEntry({
          id: `log-${agentId}-complete-${Date.now()}`,
          agentId,
          agentName: AGENT_NAMES[agentId] || agentId,
          content: logContent,
          timestamp: result.timestamp,
          duration_ms: result.duration_ms,
          status: 'completed',
        });

        // Update performance
        updateAgentPerformance({
          agentId,
          executionCount: 1,
          avgResponseTime: result.duration_ms,
          lastDecision: logContent,
        });

        // If orchestration is done, update risk level and recommendation
        if (agentId === 'orchestration') {
          const resp = result.response;
          if (resp.alert_level) {
            setRiskLevel(resp.alert_level as 'normal' | 'caution' | 'danger' | 'emergency');
          }
          if (resp.farmer_message) {
            setRecommendation(resp.farmer_message as string);
          }
        }
        break;
      }
      case 'agent_error': {
        const agentId = event.data.agentId as AgentId;
        addLogEntry({
          id: `log-${agentId}-error-${Date.now()}`,
          agentId,
          agentName: AGENT_NAMES[agentId] || agentId,
          content: `오류 발생: ${event.data.error}. 재시도 중...`,
          timestamp: event.data.timestamp as string,
          duration_ms: 0,
          status: 'error',
        });
        break;
      }
      case 'pipeline_complete': {
        completePipeline();
        // Switch to dashboard to see results
        setTimeout(() => setActiveTab('dashboard'), 500);
        break;
      }
    }
  }

  function summarizeAgentResult(agentId: AgentId, result: AgentResult): string {
    const resp = result.response;
    switch (agentId) {
      case 'context':
        return (resp.situation_summary as string) || '상황 분석 완료';
      case 'risk_trajectory':
        return `현재 상태: ${resp.current_state || 'N/A'}, 심각도: ${resp.severity_score || 'N/A'}, 위험 전환 예상: ${resp.risk_timeline_hours || 'N/A'}시간`;
      case 'planning':
        return `대응 계획 수립 완료. 신뢰도: ${resp.confidence || 'N/A'}`;
      case 'execution':
        return (resp.alert_message as string) || '실행 체크리스트 생성 완료';
      case 'monitoring':
        return `모니터링 설정 완료. 다음 점검: ${resp.next_check_hours || 'N/A'}시간 후`;
      case 'recovery':
        return `효과 점수: ${resp.effectiveness_score || 'N/A'}, 대안 필요: ${resp.plan_adjustment_needed ? '예' : '아니오'}`;
      case 'orchestration':
        return (resp.farmer_message as string) || '최종 보고서 생성 완료';
      default:
        return '완료';
    }
  }

  const durations: Record<string, number> = {};
  pipeline.results.forEach((r) => {
    durations[r.agentId] = r.duration_ms;
  });

  return (
    <div className="space-y-6">
      {/* Scenario Cards */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-white">시나리오 선택</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {SCENARIOS.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              isActive={pipeline.scenario === scenario.id}
              isRunning={pipeline.isRunning}
              onSelect={runScenario}
            />
          ))}
        </div>
      </div>

      {/* Execution Progress */}
      {(pipeline.isRunning || pipeline.completedAgents.length > 0) && (
        <ExecutionStepper
          currentAgent={pipeline.currentAgent}
          completedAgents={pipeline.completedAgents}
          durations={durations}
        />
      )}
    </div>
  );
}
