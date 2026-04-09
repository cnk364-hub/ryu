import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function getRiskColor(level: string): string {
  switch (level) {
    case 'normal': return '#22C55E';
    case 'caution': return '#EAB308';
    case 'danger': return '#F97316';
    case 'emergency': return '#EF4444';
    default: return '#6B7280';
  }
}

export function getRiskLabel(level: string): string {
  switch (level) {
    case 'normal': return '정상';
    case 'caution': return '주의';
    case 'danger': return '위험';
    case 'emergency': return '긴급';
    default: return '알 수 없음';
  }
}

export function getAgentColor(agentId: string): string {
  switch (agentId) {
    case 'context': return '#3B82F6';
    case 'risk_trajectory': return '#F97316';
    case 'planning': return '#8B5CF6';
    case 'execution': return '#22C55E';
    case 'monitoring': return '#14B8A6';
    case 'recovery': return '#EF4444';
    case 'orchestration': return '#EAB308';
    default: return '#6B7280';
  }
}
