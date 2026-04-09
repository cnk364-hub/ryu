import { create } from 'zustand';
import type {
  FeedingPatternData,
  EnvironmentData,
  DashboardMetrics,
  PipelineState,
  AgentLogEntry,
  AgentResult,
  RiskLevel,
  AgentPerformance,
  ScenarioType,
  AgentId,
} from '../lib/types';

interface AgentState {
  // --- State ---
  feedingData: FeedingPatternData[];
  environmentData: EnvironmentData | null;
  metrics: DashboardMetrics;
  pipeline: PipelineState;
  logs: AgentLogEntry[];
  activeTab: 'dashboard' | 'scenarios' | 'agents';
  riskLevel: RiskLevel;
  agentPerformances: AgentPerformance[];
  recommendation: string;

  // --- Actions ---
  setFeedingData: (data: FeedingPatternData[]) => void;
  setEnvironmentData: (data: EnvironmentData | null) => void;
  setMetrics: (metrics: DashboardMetrics) => void;
  setRiskLevel: (level: RiskLevel) => void;
  setActiveTab: (tab: 'dashboard' | 'scenarios' | 'agents') => void;
  setRecommendation: (text: string) => void;
  startPipeline: (scenario: ScenarioType) => void;
  setCurrentAgent: (agentId: AgentId | null) => void;
  completeAgent: (agentId: AgentId, result: AgentResult) => void;
  addLogEntry: (entry: AgentLogEntry) => void;
  updateLogEntry: (id: string, updates: Partial<AgentLogEntry>) => void;
  completePipeline: () => void;
  resetPipeline: () => void;
  updateAgentPerformance: (perf: AgentPerformance) => void;
}

const initialPipelineState: PipelineState = {
  isRunning: false,
  currentAgent: null,
  completedAgents: [],
  results: [],
  scenario: null,
  startedAt: null,
};

const initialMetrics: DashboardMetrics = {
  feedingChangeRate: 0,
  anomalyDays: 0,
  estimatedRiskHours: 0,
  riskLevel: 'normal',
};

export const useAgentStore = create<AgentState>((set) => ({
  // --- Initial State ---
  feedingData: [],
  environmentData: null,
  metrics: initialMetrics,
  pipeline: initialPipelineState,
  logs: [],
  activeTab: 'dashboard',
  riskLevel: 'normal',
  agentPerformances: [],
  recommendation: '',

  // --- Actions ---
  setFeedingData: (data) => set({ feedingData: data }),

  setEnvironmentData: (data) => set({ environmentData: data }),

  setMetrics: (metrics) => set({ metrics }),

  setRiskLevel: (level) => set({ riskLevel: level }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setRecommendation: (text) => set({ recommendation: text }),

  startPipeline: (scenario) =>
    set({
      pipeline: {
        isRunning: true,
        currentAgent: null,
        completedAgents: [],
        results: [],
        scenario,
        startedAt: new Date().toISOString(),
      },
    }),

  setCurrentAgent: (agentId) =>
    set((state) => ({
      pipeline: { ...state.pipeline, currentAgent: agentId },
    })),

  completeAgent: (agentId, result) =>
    set((state) => ({
      pipeline: {
        ...state.pipeline,
        completedAgents: [...state.pipeline.completedAgents, agentId],
        results: [...state.pipeline.results, result],
      },
    })),

  addLogEntry: (entry) =>
    set((state) => ({
      logs: [...state.logs, entry],
    })),

  updateLogEntry: (id, updates) =>
    set((state) => ({
      logs: state.logs.map((entry) =>
        entry.id === id ? { ...entry, ...updates } : entry
      ),
    })),

  completePipeline: () =>
    set((state) => ({
      pipeline: {
        ...state.pipeline,
        isRunning: false,
        currentAgent: null,
      },
    })),

  resetPipeline: () =>
    set({
      pipeline: initialPipelineState,
      logs: [],
    }),

  updateAgentPerformance: (perf) =>
    set((state) => {
      const existing = state.agentPerformances.findIndex(
        (p) => p.agentId === perf.agentId
      );
      if (existing >= 0) {
        const updated = [...state.agentPerformances];
        updated[existing] = perf;
        return { agentPerformances: updated };
      }
      return { agentPerformances: [...state.agentPerformances, perf] };
    }),
}));
