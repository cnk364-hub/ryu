'use client';

import { getAgentColor, formatDuration } from '@/lib/utils';
import type { AgentId } from '@/lib/types';

const STEPS: { id: AgentId; label: string; description: string }[] = [
  { id: 'context', label: '데이터 수집 & Context 분석', description: 'LiDAR 급이 데이터 분석 및 상황 파악' },
  { id: 'risk_trajectory', label: '위험 궤적 분석', description: 'HMM 기반 위험 상태 전이 분석' },
  { id: 'planning', label: '대응 계획 수립', description: 'CBR 기반 최적 대응 계획 생성' },
  { id: 'execution', label: '조치 실행', description: '실행 가능한 체크리스트 생성' },
  { id: 'monitoring', label: '모니터링 설정', description: '모니터링 기준 및 성공 지표 설정' },
  { id: 'recovery', label: '효과 평가', description: '조치 효과 평가 및 대안 전략' },
  { id: 'orchestration', label: '최종 보고', description: '종합 의사결정 보고서 생성' },
];

interface ExecutionStepperProps {
  currentAgent: AgentId | null;
  completedAgents: AgentId[];
  durations: Record<string, number>;
}

export default function ExecutionStepper({ currentAgent, completedAgents, durations }: ExecutionStepperProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-300">에이전트 실행 진행 상황</h3>
      <div className="space-y-1">
        {STEPS.map((step, index) => {
          const isCompleted = completedAgents.includes(step.id);
          const isCurrent = currentAgent === step.id;
          const isPending = !isCompleted && !isCurrent;
          const color = getAgentColor(step.id);

          return (
            <div key={step.id} className="flex items-center gap-3">
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    isCompleted
                      ? 'border-transparent text-white'
                      : isCurrent
                      ? 'border-current bg-transparent'
                      : 'border-gray-600 bg-transparent text-gray-600'
                  }`}
                  style={
                    isCompleted
                      ? { backgroundColor: color }
                      : isCurrent
                      ? { borderColor: color, color }
                      : undefined
                  }
                >
                  {isCompleted ? '✓' : index + 1}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className="h-4 w-0.5"
                    style={{
                      backgroundColor: isCompleted ? color : '#4B5563',
                    }}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      isPending ? 'text-gray-500' : 'text-white'
                    }`}
                    style={isCurrent ? { color } : undefined}
                  >
                    {step.label}
                  </span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-xs" style={{ color }}>
                      <span
                        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      처리 중...
                    </span>
                  )}
                  {isCompleted && durations[step.id] && (
                    <span className="text-[10px] text-gray-500">
                      {formatDuration(durations[step.id])}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{step.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
