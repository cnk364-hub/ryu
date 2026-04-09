// =============================================================================
// types.ts — Core type definitions for Livestock Disease Early Warning AI System
// =============================================================================

/** Feeding pattern data derived from LiDAR simulator */
export interface FeedingPatternData {
  date: string;
  consumption_kg: number;
  normal_baseline: number;
  deviation_pct: number;
  slope: number;
  volatility: number;
  status: 'normal' | 'caution' | 'danger' | 'emergency';
}

/** Environment sensor data */
export interface EnvironmentData {
  temperature: number;
  humidity: number;
  ammonia_ppm: number;
  ventilation_status: 'normal' | 'warning' | 'critical';
}

/** Available simulation scenario types */
export type ScenarioType = 'disease_asf' | 'environment_heat' | 'shipment_optimization';

/** Risk classification levels */
export type RiskLevel = 'normal' | 'caution' | 'danger' | 'emergency';

/** Identifiers for each agent in the pipeline */
export type AgentId =
  | 'context'
  | 'risk_trajectory'
  | 'planning'
  | 'execution'
  | 'monitoring'
  | 'recovery'
  | 'orchestration';

/** Static definition of an agent (UI metadata + system prompt) */
export interface AgentDefinition {
  id: AgentId;
  name: string;
  nameKo: string;
  role: string;
  technology: string;
  color: string;
  iconName: string;
}

/** A single log entry produced while an agent is running */
export interface AgentLogEntry {
  id: string;
  agentId: AgentId;
  agentName: string;
  content: string;
  timestamp: string;
  duration_ms: number;
  status: 'running' | 'completed' | 'error';
}

/** Result returned after an agent finishes execution */
export interface AgentResult {
  agentId: AgentId;
  response: Record<string, unknown>;
  rawText: string;
  timestamp: string;
  duration_ms: number;
}

/** Overall state of the multi-agent pipeline */
export interface PipelineState {
  isRunning: boolean;
  currentAgent: AgentId | null;
  completedAgents: AgentId[];
  results: AgentResult[];
  scenario: ScenarioType | null;
  startedAt: string | null;
}

/** Summary metrics displayed on the dashboard */
export interface DashboardMetrics {
  feedingChangeRate: number;
  anomalyDays: number;
  estimatedRiskHours: number;
  riskLevel: RiskLevel;
}

/** Server-Sent Events pushed to the client */
export interface SSEEvent {
  type:
    | 'agent_start'
    | 'agent_complete'
    | 'agent_error'
    | 'pipeline_complete'
    | 'metrics_update';
  data: Record<string, unknown>;
}

/** Scenario card shown in the UI */
export interface ScenarioDefinition {
  id: ScenarioType;
  title: string;
  description: string;
  icon: string;
  details: string[];
}

/** Per-agent performance statistics for the monitoring tab */
export interface AgentPerformance {
  agentId: AgentId;
  executionCount: number;
  avgResponseTime: number;
  lastDecision: string;
}
