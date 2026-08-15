'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAgentStore } from '@/store/agentStore';
import RiskBadge from '@/components/dashboard/RiskBadge';
import DashboardTab from '@/app/dashboard/page';
import ScenariosTab from '@/app/scenarios/page';
import AgentsTab from '@/app/agents/page';

const TABS = [
  { id: 'dashboard', label: '실시간 모니터링' },
  { id: 'scenarios', label: '시나리오 실행' },
  { id: 'agents', label: '에이전트 상세' },
] as const;

export default function Home() {
  const { riskLevel, pipeline, activeTab, setActiveTab } = useAgentStore();
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      setCurrentTime(
        new Date().toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const runningCount = pipeline.isRunning ? pipeline.completedAgents.length + 1 : 7;
  const riskBorderClass =
    riskLevel === 'emergency'
      ? 'risk-border-emergency'
      : riskLevel === 'danger'
      ? 'risk-border-danger'
      : riskLevel === 'caution'
      ? 'risk-border-caution'
      : '';

  return (
    <div className={`min-h-screen ${riskBorderClass}`}>
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-white">
                <span className="text-blue-400">MANSA</span> 축산 AI 에이전트 데모
              </h1>
              <p className="text-xs text-gray-500">제일축산영농조합법인 1호동</p>
            </div>
            <RiskBadge level={riskLevel} size="lg" />
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/vrb"
              className="rounded-md border border-blue-700/60 bg-blue-900/20 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-900/40"
            >
              VRB 손익 자동산출
            </Link>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  pipeline.isRunning ? 'animate-pulse bg-yellow-400' : 'bg-green-400'
                }`}
              />
              에이전트 {runningCount}/7 가동 중
            </div>
            <div className="text-xs tabular-nums text-gray-500">
              {currentTime}
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-gray-800 bg-gray-900/50">
        <div className="mx-auto flex max-w-[1400px] px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-5 py-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="mx-auto max-w-[1400px] p-4">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'scenarios' && <ScenariosTab />}
        {activeTab === 'agents' && <AgentsTab />}
      </main>
    </div>
  );
}
