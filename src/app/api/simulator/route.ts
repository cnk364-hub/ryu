// =============================================================================
// GET /api/simulator — Generate simulated feeding + environment data
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';

import { generateFeedingData, generateEnvironmentData } from '@/lib/simulator';
import { detectAnomalies } from '@/lib/eif';
import type { ScenarioType } from '@/lib/types';

const VALID_SCENARIOS: ReadonlySet<string> = new Set<ScenarioType>([
  'disease_asf',
  'environment_heat',
  'shipment_optimization',
]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const scenario = searchParams.get('scenario');

    if (!scenario || !VALID_SCENARIOS.has(scenario)) {
      return NextResponse.json(
        {
          error: 'Invalid or missing scenario parameter',
          validScenarios: Array.from(VALID_SCENARIOS),
        },
        { status: 400 },
      );
    }

    const scenarioType = scenario as ScenarioType;

    const feedingData = generateFeedingData(scenarioType, 30);
    const environmentData = generateEnvironmentData(scenarioType);
    const anomalyScores = detectAnomalies(feedingData);

    return NextResponse.json({
      feedingData,
      environmentData,
      anomalyScores,
    });
  } catch (error) {
    console.error('[simulator] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
