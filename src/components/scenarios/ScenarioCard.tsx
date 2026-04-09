'use client';

import type { ScenarioDefinition } from '@/lib/types';

interface ScenarioCardProps {
  scenario: ScenarioDefinition;
  isActive: boolean;
  isRunning: boolean;
  onSelect: (id: string) => void;
}

const iconMap: Record<string, JSX.Element> = {
  disease: (
    <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" fill="#FEE2E2" stroke="#EF4444" strokeWidth="2" />
      <circle cx="12" cy="13" r="2" fill="#EF4444" />
      <circle cx="20" cy="13" r="2" fill="#EF4444" />
      <ellipse cx="16" cy="20" rx="4" ry="2.5" fill="#FECACA" stroke="#EF4444" strokeWidth="1.5" />
      <circle cx="14" cy="19.5" r="0.8" fill="#EF4444" />
      <circle cx="18" cy="19.5" r="0.8" fill="#EF4444" />
    </svg>
  ),
  environment: (
    <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />
      <rect x="14" y="8" width="4" height="12" rx="2" fill="#F59E0B" />
      <circle cx="16" cy="22" r="3" fill="#F59E0B" />
      <path d="M10 6L12 8M22 6L20 8M8 14H10M22 14H24" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  shipment: (
    <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2" />
      <path d="M10 20L14 12L18 16L22 10" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="10" r="2" fill="#3B82F6" />
    </svg>
  ),
};

export default function ScenarioCard({ scenario, isActive, isRunning, onSelect }: ScenarioCardProps) {
  const iconKey = scenario.id.includes('disease')
    ? 'disease'
    : scenario.id.includes('environment')
    ? 'environment'
    : 'shipment';

  return (
    <button
      onClick={() => !isRunning && onSelect(scenario.id)}
      disabled={isRunning}
      className={`w-full rounded-xl border p-5 text-left transition-all ${
        isActive
          ? 'border-blue-500 bg-blue-950/30 shadow-lg shadow-blue-500/10'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800'
      } ${isRunning ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <div className="mb-3 flex items-center gap-3">
        {iconMap[iconKey]}
        <h3 className="text-base font-bold text-white">{scenario.title}</h3>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-gray-400">{scenario.description}</p>
      <div className="space-y-1">
        {scenario.details.map((detail, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
            <span className="mt-0.5 text-gray-600">•</span>
            <span>{detail}</span>
          </div>
        ))}
      </div>
      {isActive && isRunning && (
        <div className="mt-3 flex items-center gap-2 text-xs text-blue-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          에이전트 실행 중...
        </div>
      )}
    </button>
  );
}
