'use client';

import { getAgentColor } from '@/lib/utils';
import type { AgentId } from '@/lib/types';

const AGENTS: { id: AgentId; label: string; shortLabel: string }[] = [
  { id: 'context', label: '상황인식', shortLabel: 'CTX' },
  { id: 'risk_trajectory', label: '위험궤적', shortLabel: 'RSK' },
  { id: 'planning', label: '대응계획', shortLabel: 'PLN' },
  { id: 'execution', label: '조치실행', shortLabel: 'EXE' },
  { id: 'monitoring', label: '관찰', shortLabel: 'MON' },
  { id: 'recovery', label: '수정복구', shortLabel: 'RCV' },
  { id: 'orchestration', label: '오케스트레이션', shortLabel: 'ORC' },
];

interface AgentLoopVisualProps {
  currentAgent: AgentId | null;
  completedAgents: AgentId[];
}

export default function AgentLoopVisual({ currentAgent, completedAgents }: AgentLoopVisualProps) {
  const cx = 120;
  const cy = 120;
  const radius = 85;
  const nodeRadius = 24;

  return (
    <div className="flex items-center justify-center">
      <svg width={240} height={240} viewBox="0 0 240 240">
        {/* Connection arrows */}
        {AGENTS.map((agent, i) => {
          const nextI = (i + 1) % AGENTS.length;
          const angle1 = (i * 360) / AGENTS.length - 90;
          const angle2 = (nextI * 360) / AGENTS.length - 90;
          const x1 = cx + radius * Math.cos((angle1 * Math.PI) / 180);
          const y1 = cy + radius * Math.sin((angle1 * Math.PI) / 180);
          const x2 = cx + radius * Math.cos((angle2 * Math.PI) / 180);
          const y2 = cy + radius * Math.sin((angle2 * Math.PI) / 180);

          const isActive = currentAgent === agent.id || (
            completedAgents.includes(agent.id) &&
            (currentAgent === AGENTS[nextI]?.id || completedAgents.includes(AGENTS[nextI]?.id))
          );

          return (
            <line
              key={`arrow-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isActive ? getAgentColor(agent.id) : '#374151'}
              strokeWidth={isActive ? 2 : 1}
              strokeDasharray={isActive ? undefined : '4 4'}
              opacity={isActive ? 1 : 0.4}
            />
          );
        })}

        {/* Agent nodes */}
        {AGENTS.map((agent, i) => {
          const angle = (i * 360) / AGENTS.length - 90;
          const x = cx + radius * Math.cos((angle * Math.PI) / 180);
          const y = cy + radius * Math.sin((angle * Math.PI) / 180);
          const color = getAgentColor(agent.id);
          const isActive = currentAgent === agent.id;
          const isCompleted = completedAgents.includes(agent.id);

          return (
            <g key={agent.id}>
              {/* Pulse effect for active agent */}
              {isActive && (
                <circle
                  cx={x}
                  cy={y}
                  r={nodeRadius + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.5}
                >
                  <animate
                    attributeName="r"
                    from={String(nodeRadius + 2)}
                    to={String(nodeRadius + 12)}
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.6"
                    to="0"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {/* Node circle */}
              <circle
                cx={x}
                cy={y}
                r={nodeRadius}
                fill={isActive || isCompleted ? `${color}30` : '#1F2937'}
                stroke={isActive ? color : isCompleted ? color : '#4B5563'}
                strokeWidth={isActive ? 3 : isCompleted ? 2 : 1}
              />
              {/* Checkmark for completed */}
              {isCompleted && !isActive && (
                <text
                  x={x}
                  y={y - 4}
                  textAnchor="middle"
                  fill={color}
                  fontSize={14}
                  fontWeight="bold"
                >
                  ✓
                </text>
              )}
              {/* Agent short label */}
              <text
                x={x}
                y={isCompleted && !isActive ? y + 10 : y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isActive || isCompleted ? color : '#9CA3AF'}
                fontSize={9}
                fontWeight={isActive ? 'bold' : 'normal'}
              >
                {agent.shortLabel}
              </text>
              {/* Label below */}
              <text
                x={x}
                y={y + nodeRadius + 12}
                textAnchor="middle"
                fill={isActive ? color : '#6B7280'}
                fontSize={8}
              >
                {agent.label}
              </text>
            </g>
          );
        })}

        {/* Center text */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fill="#9CA3AF"
          fontSize={10}
          fontWeight="bold"
        >
          Agentic
        </text>
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          fill="#9CA3AF"
          fontSize={10}
          fontWeight="bold"
        >
          Loop
        </text>
      </svg>
    </div>
  );
}
