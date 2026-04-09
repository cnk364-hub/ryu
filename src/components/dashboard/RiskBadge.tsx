'use client';

import { getRiskColor, getRiskLabel } from '@/lib/utils';
import type { RiskLevel } from '@/lib/types';

interface RiskBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
}

export default function RiskBadge({ level, size = 'md' }: RiskBadgeProps) {
  const color = getRiskColor(level);
  const label = getRiskLabel(level);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses[size]} ${
        level === 'emergency' ? 'animate-pulse' : ''
      }`}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      <span
        className={`mr-1.5 h-2 w-2 rounded-full ${level === 'emergency' ? 'animate-ping' : ''}`}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
