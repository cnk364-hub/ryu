'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/store/agentStore';
import FeedingPatternChart from '@/components/charts/FeedingPatternChart';
import AgentLoopVisual from '@/components/charts/AgentLoopVisual';
import AgentLogTimeline from '@/components/agents/AgentLogTimeline';
import MetricCard from '@/components/dashboard/MetricCard';
import RecommendationBox from '@/components/dashboard/RecommendationBox';
import { generateFeedingData } from '@/lib/simulator';
import { detectAnomalies } from '@/lib/eif';

export default function DashboardTab() {
  const {
    feedingData,
    setFeedingData,
    metrics,
    setMetrics,
    riskLevel,
    pipeline,
    logs,
    recommendation,
  } = useAgentStore();

  // Initialize with normal data on first load
  useEffect(() => {
    if (feedingData.length === 0) {
      const data = generateFeedingData('disease_asf');
      // Initially show only normal data (first 25 days)
      const normalData = data.slice(0, 25);
      setFeedingData(normalData);
      setMetrics({
        feedingChangeRate: -2.1,
        anomalyDays: 0,
        estimatedRiskHours: 999,
        riskLevel: 'normal',
      });
    }
  }, [feedingData.length, setFeedingData, setMetrics]);

  const anomalyResults = detectAnomalies(feedingData);
  const anomalyIndices = anomalyResults
    .filter((r) => r.isAnomaly)
    .map((r) => r.index);

  return (
    <div className="flex gap-4">
      {/* Left side - 2/3 width */}
      <div className="flex-1 space-y-4" style={{ flex: '2' }}>
        {/* Feeding Pattern Chart */}
        <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">
              급이패턴 실시간 모니터링
            </h2>
            <span className="text-xs text-gray-500">
              최근 {feedingData.length}일 데이터
            </span>
          </div>
          <FeedingPatternChart data={feedingData} anomalyIndices={anomalyIndices} />
        </div>

        {/* Agent Execution Log */}
        <AgentLogTimeline logs={logs} maxHeight="350px" />
      </div>

      {/* Right side - 1/3 width */}
      <div className="space-y-4" style={{ flex: '1' }}>
        {/* Metric Cards */}
        <div className="space-y-3">
          <MetricCard
            title="급이량 변화율"
            value={metrics.feedingChangeRate}
            unit="%"
            description="오늘 vs 7일 평균"
            trend={metrics.feedingChangeRate < -10 ? 'down' : metrics.feedingChangeRate > 5 ? 'up' : 'stable'}
            alert={metrics.feedingChangeRate < -20}
          />
          <MetricCard
            title="이상 지속일수"
            value={metrics.anomalyDays}
            unit="일"
            description="연속 이상 탐지 일수"
            alert={metrics.anomalyDays > 2}
          />
          <MetricCard
            title="위험 전환 예상"
            value={metrics.estimatedRiskHours > 100 ? '∞' : metrics.estimatedRiskHours}
            unit={metrics.estimatedRiskHours > 100 ? '' : '시간'}
            description="HMM 모델 추정"
            alert={metrics.estimatedRiskHours < 24}
          />
        </div>

        {/* AI Recommendation */}
        <RecommendationBox text={recommendation} riskLevel={riskLevel} />

        {/* Agentic Loop Visualization */}
        <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
          <h3 className="mb-2 text-center text-sm font-semibold text-gray-300">
            Agentic Loop 상태
          </h3>
          <AgentLoopVisual
            currentAgent={pipeline.currentAgent}
            completedAgents={pipeline.completedAgents}
          />
        </div>
      </div>
    </div>
  );
}
