'use client';

import { getAgentColor, formatDuration } from '@/lib/utils';
import type { AgentDefinition, AgentPerformance } from '@/lib/types';

interface AgentCardProps {
  agent: AgentDefinition;
  performance?: AgentPerformance;
}

export default function AgentCard({ agent, performance }: AgentCardProps) {
  const color = getAgentColor(agent.id);

  return (
    <div
      className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 transition-all hover:border-gray-600"
      style={{ borderTopColor: color, borderTopWidth: '3px' }}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {agent.nameKo.charAt(0)}
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">{agent.name}</h3>
          <p className="text-xs text-gray-400">{agent.nameKo}</p>
        </div>
      </div>

      <div className="mb-3 text-xs text-gray-400">
        <span className="inline-block rounded bg-gray-700/50 px-2 py-0.5 text-gray-300">
          {agent.technology}
        </span>
      </div>

      {performance && (
        <div className="space-y-2 border-t border-gray-700 pt-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">실행 횟수</span>
            <span className="text-gray-300">{performance.executionCount}회</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">평균 응답시간</span>
            <span className="text-gray-300">{formatDuration(performance.avgResponseTime)}</span>
          </div>
          {performance.lastDecision && (
            <div className="mt-2 rounded bg-gray-900/50 p-2">
              <div className="mb-1 text-[10px] font-medium text-gray-500">최근 판단</div>
              <div className="text-xs leading-relaxed text-gray-400">
                {performance.lastDecision.length > 150
                  ? performance.lastDecision.slice(0, 150) + '...'
                  : performance.lastDecision}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
