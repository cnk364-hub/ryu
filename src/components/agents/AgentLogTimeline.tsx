'use client';

import { getAgentColor, formatTimestamp, formatDuration } from '@/lib/utils';
import type { AgentLogEntry } from '@/lib/types';

interface AgentLogTimelineProps {
  logs: AgentLogEntry[];
  maxHeight?: string;
}

export default function AgentLogTimeline({ logs, maxHeight = '400px' }: AgentLogTimelineProps) {
  const sortedLogs = [...logs].reverse();

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30">
      <div className="border-b border-gray-700 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-300">에이전트 실행 로그</h3>
      </div>
      <div className="overflow-y-auto p-2" style={{ maxHeight }}>
        {sortedLogs.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            시나리오를 실행하면 에이전트 로그가 여기에 표시됩니다.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedLogs.map((log) => {
              const color = getAgentColor(log.agentId);
              return (
                <div
                  key={log.id}
                  className="rounded-md border border-gray-700/50 bg-gray-900/50 p-3 transition-all"
                  style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-semibold" style={{ color }}>
                        {log.agentName}
                      </span>
                      {log.status === 'running' && (
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                          실행 중...
                        </span>
                      )}
                      {log.status === 'error' && (
                        <span className="text-xs text-red-400">오류</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      {log.duration_ms > 0 && (
                        <span>{formatDuration(log.duration_ms)}</span>
                      )}
                      <span>{formatTimestamp(log.timestamp)}</span>
                    </div>
                  </div>
                  <div className="text-xs leading-relaxed text-gray-400">
                    {log.content.length > 200
                      ? log.content.slice(0, 200) + '...'
                      : log.content}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
