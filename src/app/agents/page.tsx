'use client';

import { useAgentStore } from '@/store/agentStore';
import AgentCard from '@/components/agents/AgentCard';
import { AGENT_DEFINITIONS } from '@/lib/agents';

const PERFORMANCE_TARGETS = [
  { label: '응답 정확도', target: 85, current: 87.3, unit: '%' },
  { label: '응답 일관성', target: 90, current: 91.2, unit: '%' },
  { label: '환각 발생률', target: 5, current: 3.2, unit: '%', inverse: true },
];

export default function AgentsTab() {
  const { agentPerformances } = useAgentStore();

  return (
    <div className="space-y-6">
      {/* Agent Cards Grid */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-white">에이전트 상세 정보</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {AGENT_DEFINITIONS.map((agent) => {
            const perf = agentPerformances.find((p) => p.agentId === agent.id);
            return <AgentCard key={agent.id} agent={agent} performance={perf} />;
          })}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-6">
        <h2 className="mb-4 text-lg font-bold text-white">시스템 성과 지표</h2>
        <div className="space-y-4">
          {PERFORMANCE_TARGETS.map((metric) => {
            const isGood = metric.inverse
              ? metric.current <= metric.target
              : metric.current >= metric.target;
            const percentage = metric.inverse
              ? Math.max(0, 100 - (metric.current / metric.target) * 100 + 100)
              : (metric.current / 100) * 100;

            return (
              <div key={metric.label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-gray-400">{metric.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      목표: {metric.target}{metric.unit}{metric.inverse ? ' 이하' : ' 이상'}
                    </span>
                    <span className={`text-sm font-bold ${isGood ? 'text-green-400' : 'text-red-400'}`}>
                      {metric.current}{metric.unit}
                    </span>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-gray-700">
                  <div
                    className={`h-2.5 rounded-full transition-all ${
                      isGood ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
