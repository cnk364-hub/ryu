// =============================================================================
// POST /api/agents/run — Execute the 7-agent pipeline via SSE
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';

import type {
  FeedingPatternData,
  EnvironmentData,
  ScenarioType,
  AgentId,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Agent definitions (id, display name, system prompt)
// ---------------------------------------------------------------------------

interface AgentSpec {
  id: AgentId;
  name: string;
  systemPrompt: string;
}

const AGENTS: readonly AgentSpec[] = [
  {
    id: 'context',
    name: 'Context Agent (상황인식)',
    systemPrompt:
      '당신은 양돈 농장의 상황인식 AI 에이전트입니다. 주어진 LiDAR 급이 데이터를 분석하여 현재 상황을 파악하고 구조화된 상황 요약을 한국어로 작성하십시오. 반드시 아래 JSON 형식으로만 응답하십시오: {"situation_summary": "...", "risk_indicators": [...], "data_quality": "good|moderate|poor", "timestamp": "..."}',
  },
  {
    id: 'risk_trajectory',
    name: 'Risk Trajectory Agent (위험궤적분석)',
    systemPrompt:
      '당신은 HMM(Hidden Markov Model) 기반 위험 궤적 분석 에이전트입니다. Context Agent의 상황 요약을 받아 위험 상태 전이를 분석하십시오. 위험 상태: 정상(K1) → 주의(K2) → 위험(K3) → 긴급(K4). 현재 상태와 다음 상태 전이 확률을 추정하고, 48시간 내 위험 전환 가능성을 계산하십시오. 반드시 아래 JSON 형식으로만 응답하십시오: {"current_state": "K1|K2|K3|K4", "transition_probabilities": {"K1": 0.0, "K2": 0.0, "K3": 0.0, "K4": 0.0}, "risk_timeline_hours": 0, "severity_score": 0.0}',
  },
  {
    id: 'planning',
    name: 'Planning Agent (대응계획)',
    systemPrompt:
      '당신은 CBR(Case-Based Reasoning) 기반 대응계획 에이전트입니다. 위험 궤적 분석 결과를 받아 과거 유사 사례를 참조하여 최적 대응 계획을 수립하십시오. 대응 계획은 즉각조치(0-24h), 단기조치(1-3일), 예방조치(3-7일)로 구분하십시오. 반드시 아래 JSON 형식으로만 응답하십시오: {"action_plan": {"immediate": [...], "short_term": [...], "preventive": [...]}, "similar_cases": [...], "confidence": 0.0}',
  },
  {
    id: 'execution',
    name: 'Execution Agent (조치실행)',
    systemPrompt:
      '당신은 조치실행 에이전트입니다. 대응 계획을 받아 실제 실행 가능한 구체적 지시사항으로 변환하십시오. 농장주가 바로 실행할 수 있는 체크리스트 형태로 작성하십시오. 반드시 아래 JSON 형식으로만 응답하십시오: {"checklist": [{"priority": "high|medium|low", "action": "...", "responsible": "...", "deadline": "..."}], "alert_message": "...", "vet_required": true|false}',
  },
  {
    id: 'monitoring',
    name: 'Monitoring Agent (관찰)',
    systemPrompt:
      '당신은 관찰 에이전트입니다. 조치 실행 후 모니터링 기준과 성공 지표를 설정하십시오. 어떤 데이터 변화를 관찰해야 하는지, 언제 Recovery Agent를 호출해야 하는지 판단하십시오. 반드시 아래 JSON 형식으로만 응답하십시오: {"monitoring_metrics": [...], "success_criteria": [...], "recovery_trigger_conditions": [...], "next_check_hours": 0}',
  },
  {
    id: 'recovery',
    name: 'Recovery Agent (수정복구)',
    systemPrompt:
      '당신은 수정복구 에이전트입니다. 모니터링 결과를 받아 조치가 효과적인지 평가하십시오. 효과 미흡 시 대안 전략을 제시하고 Orchestration Agent에게 재계획을 요청하십시오. 반드시 아래 JSON 형식으로만 응답하십시오: {"effectiveness_score": 0.0, "plan_adjustment_needed": true|false, "alternative_strategies": [...], "escalation_required": true|false}',
  },
  {
    id: 'orchestration',
    name: 'Orchestration Agent (협업오케스트레이션)',
    systemPrompt:
      '당신은 협업 오케스트레이션 에이전트입니다. 모든 에이전트의 실행 결과를 종합하여 최종 의사결정 보고서를 작성하십시오. 농장주와 수의사에게 전달할 최종 알림 메시지를 생성하십시오. 반드시 아래 JSON 형식으로만 응답하십시오: {"final_decision": "...", "alert_level": "normal|caution|danger|emergency", "farmer_message": "...", "vet_notification": "...", "trajectory_log_id": "..."}',
  },
] as const;

// ---------------------------------------------------------------------------
// Scenario labels (for the user message sent to Claude)
// ---------------------------------------------------------------------------

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  disease_asf: 'ASF(아프리카돼지열병) 의심 시나리오',
  environment_heat: '고온 환경 스트레스 시나리오',
  shipment_optimization: '출하 최적화 시나리오',
};

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

interface RunRequestBody {
  scenario: ScenarioType;
  feedingData: FeedingPatternData[];
  environmentData: EnvironmentData;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Try to parse JSON from text that may be wrapped in markdown code fences.
 */
function extractJSON(text: string): Record<string, unknown> {
  // 1. Try direct parse
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. Try extracting from ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Try extracting first { ... } block
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // continue
    }
  }

  // 4. Return raw text wrapped in an object
  return { raw_response: trimmed };
}

function buildUserMessage(
  scenario: ScenarioType,
  feedingData: FeedingPatternData[],
  environmentData: EnvironmentData,
  previousResults: Array<{ agentId: AgentId; response: Record<string, unknown> }>,
): string {
  const last7 = feedingData.slice(-7);

  const feedingSummary = last7
    .map(
      (d) =>
        `  ${d.date}: 섭취량 ${d.consumption_kg}kg (편차 ${d.deviation_pct}%, 상태: ${d.status})`,
    )
    .join('\n');

  let message = `## 시나리오: ${SCENARIO_LABELS[scenario]}

## 최근 7일 급이 데이터
${feedingSummary}

## 환경 데이터
- 온도: ${environmentData.temperature}°C
- 습도: ${environmentData.humidity}%
- 암모니아: ${environmentData.ammonia_ppm}ppm
- 환기 상태: ${environmentData.ventilation_status}
`;

  if (previousResults.length > 0) {
    message += '\n## 이전 에이전트 분석 결과\n';
    for (const prev of previousResults) {
      message += `\n### ${prev.agentId}\n\`\`\`json\n${JSON.stringify(prev.response, null, 2)}\n\`\`\`\n`;
    }
  }

  return message;
}

/** Call the Anthropic API with retries. */
async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      // Extract text from response content blocks
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return text;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // --- Validate request body ---
  let body: RunRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { scenario, feedingData, environmentData } = body;

  if (!scenario || !feedingData?.length || !environmentData) {
    return new Response(
      JSON.stringify({
        error: 'Missing required fields: scenario, feedingData, environmentData',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // --- Initialise Anthropic client (picks up ANTHROPIC_API_KEY from env) ---
  const anthropic = new Anthropic();

  // --- Build SSE stream ---
  const encoder = new TextEncoder();
  const pipelineStart = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const results: Array<{
        agentId: AgentId;
        response: Record<string, unknown>;
        rawText: string;
        duration_ms: number;
      }> = [];

      for (const agent of AGENTS) {
        const timestamp = new Date().toISOString();

        // --- agent_start ---
        controller.enqueue(
          encoder.encode(
            sseEncode('message', {
              type: 'agent_start',
              data: {
                agentId: agent.id,
                agentName: agent.name,
                timestamp,
              },
            }),
          ),
        );

        const agentStart = Date.now();

        try {
          const userMessage = buildUserMessage(
            scenario,
            feedingData,
            environmentData,
            results.map((r) => ({ agentId: r.agentId, response: r.response })),
          );

          const rawText = await callClaude(
            anthropic,
            agent.systemPrompt,
            userMessage,
          );

          const response = extractJSON(rawText);
          const duration_ms = Date.now() - agentStart;

          results.push({
            agentId: agent.id,
            response,
            rawText,
            duration_ms,
          });

          // --- agent_complete ---
          controller.enqueue(
            encoder.encode(
              sseEncode('message', {
                type: 'agent_complete',
                data: {
                  agentId: agent.id,
                  agentName: agent.name,
                  response,
                  rawText,
                  duration_ms,
                  timestamp: new Date().toISOString(),
                },
              }),
            ),
          );
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown error';

          console.error(
            `[agents/run] Agent ${agent.id} failed:`,
            errorMessage,
          );

          // --- agent_error ---
          controller.enqueue(
            encoder.encode(
              sseEncode('message', {
                type: 'agent_error',
                data: {
                  agentId: agent.id,
                  agentName: agent.name,
                  error: errorMessage,
                  timestamp: new Date().toISOString(),
                },
              }),
            ),
          );

          // Push a placeholder result so downstream agents still receive context
          results.push({
            agentId: agent.id,
            response: { error: errorMessage },
            rawText: '',
            duration_ms: Date.now() - agentStart,
          });
        }
      }

      // --- pipeline_complete ---
      const totalDuration = Date.now() - pipelineStart;
      controller.enqueue(
        encoder.encode(
          sseEncode('message', {
            type: 'pipeline_complete',
            data: {
              results: results.map((r) => ({
                agentId: r.agentId,
                response: r.response,
                rawText: r.rawText,
                duration_ms: r.duration_ms,
              })),
              totalDuration,
              timestamp: new Date().toISOString(),
            },
          }),
        ),
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering if proxied
    },
  });
}
