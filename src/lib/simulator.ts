// =============================================================================
// simulator.ts — LiDAR-based feeding data & environment sensor simulator
// =============================================================================

import type {
  FeedingPatternData,
  EnvironmentData,
  ScenarioType,
} from './types';

// ---------------------------------------------------------------------------
// Seeded PRNG — Mulberry32
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compute the mean of a number array. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Compute the standard deviation of a number array. */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Simple linear regression slope for the given values (x = index). */
function regressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Format a Date to YYYY-MM-DD. */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Determine status from deviation percentage. */
function statusFromDeviation(
  deviationPct: number,
): FeedingPatternData['status'] {
  if (deviationPct > -10) return 'normal';
  if (deviationPct > -20) return 'caution';
  if (deviationPct > -30) return 'danger';
  return 'emergency';
}

// ---------------------------------------------------------------------------
// generateFeedingData
// ---------------------------------------------------------------------------

/**
 * Generate simulated LiDAR feeding pattern data for a given scenario.
 *
 * - **disease_asf**: Normal for ~27 days, then a sharp 35-40% decline
 *   mimicking ASF onset.
 * - **environment_heat**: Normal feeding with environmental stress signals;
 *   slight dip after day 20 due to heat.
 * - **shipment_optimization**: Stable and efficient consumption with a slow
 *   upward trend toward target weight.
 *
 * Derived fields:
 * - `normal_baseline` — 7-day moving average
 * - `deviation_pct` — `((consumption - baseline) / baseline) * 100`
 * - `slope` — linear regression slope over last 3 data points
 * - `volatility` — CV (stddev / mean) over last 5 data points
 * - `status` — thresholds: >-10% normal, >-20% caution, >-30% danger, else emergency
 */
export function generateFeedingData(
  scenario: ScenarioType,
  days: number = 30,
): FeedingPatternData[] {
  const seed =
    scenario === 'disease_asf'
      ? 42
      : scenario === 'environment_heat'
        ? 84
        : 126;
  const rng = mulberry32(seed);

  const baseConsumption = 250; // kg (herd total)
  const normalNoise = 10; // +/- kg random daily variation

  // ------- Phase 1: generate raw consumption values -----------------------
  const rawConsumptions: number[] = [];

  for (let i = 0; i < days; i++) {
    let consumption: number;

    switch (scenario) {
      case 'disease_asf': {
        if (i < 24) {
          // Days 0–23: Normal pattern with small variation
          consumption = baseConsumption + (rng() - 0.5) * 2 * normalNoise;
        } else if (i < 27) {
          // Days 24–26: Gradual onset — 4% decline per day
          const declineFactor = 1 - (i - 23) * 0.04;
          consumption =
            baseConsumption * declineFactor +
            (rng() - 0.5) * 2 * (normalNoise * 0.8);
        } else {
          // Days 27–29: Sharp decline — 12% per day from onset
          const daysSinceOnset = i - 26;
          const declineFactor = 1 - daysSinceOnset * 0.12;
          consumption =
            baseConsumption * declineFactor +
            (rng() - 0.5) * 2 * (normalNoise * 0.5);
        }
        break;
      }

      case 'environment_heat': {
        // Normal consumption overall; slight dip on the hottest days (day 20+)
        const heatEffect = i >= 20 ? (i - 19) * 1.5 : 0;
        consumption =
          baseConsumption - heatEffect + (rng() - 0.5) * 2 * normalNoise;
        break;
      }

      case 'shipment_optimization': {
        // Stable with a gentle upward trend (growing pigs eat more)
        const growthTrend = i * 0.3;
        consumption =
          baseConsumption +
          growthTrend +
          (rng() - 0.5) * 2 * (normalNoise * 0.7);
        break;
      }

      default:
        consumption = baseConsumption + (rng() - 0.5) * 2 * normalNoise;
    }

    // Clamp to a physically reasonable range
    rawConsumptions.push(Math.max(50, Math.round(consumption * 10) / 10));
  }

  // ------- Phase 2: derive statistics & build output ----------------------
  const result: FeedingPatternData[] = [];
  const startDate = new Date('2026-03-10'); // fixed start for reproducibility

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const consumption = rawConsumptions[i];

    // 7-day moving average as baseline
    const windowStart = Math.max(0, i - 6);
    const window = rawConsumptions.slice(windowStart, i + 1);
    const baseline = Math.round(mean(window) * 10) / 10;

    // Deviation percentage
    const deviationPct =
      baseline === 0
        ? 0
        : Math.round(((consumption - baseline) / baseline) * 100 * 10) / 10;

    // Slope over last 3 data points
    const slopeWindow = rawConsumptions.slice(Math.max(0, i - 2), i + 1);
    const slope = Math.round(regressionSlope(slopeWindow) * 100) / 100;

    // Volatility: coefficient of variation over last 5 data points
    const volWindow = rawConsumptions.slice(Math.max(0, i - 4), i + 1);
    const volMean = mean(volWindow);
    const volatility =
      volMean === 0
        ? 0
        : Math.round((stddev(volWindow) / volMean) * 1000) / 1000;

    // Status from deviation thresholds
    const status = statusFromDeviation(deviationPct);

    result.push({
      date: formatDate(date),
      consumption_kg: consumption,
      normal_baseline: baseline,
      deviation_pct: deviationPct,
      slope,
      volatility,
      status,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// generateEnvironmentData
// ---------------------------------------------------------------------------

/**
 * Generate a snapshot of environment sensor data for a given scenario.
 */
export function generateEnvironmentData(
  scenario: ScenarioType,
): EnvironmentData {
  switch (scenario) {
    case 'disease_asf':
      return {
        temperature: 22.5,
        humidity: 65,
        ammonia_ppm: 18,
        ventilation_status: 'normal',
      };

    case 'environment_heat':
      return {
        temperature: 33.2,
        humidity: 82,
        ammonia_ppm: 25,
        ventilation_status: 'critical',
      };

    case 'shipment_optimization':
      return {
        temperature: 21.0,
        humidity: 60,
        ammonia_ppm: 12,
        ventilation_status: 'normal',
      };

    default:
      return {
        temperature: 22.0,
        humidity: 60,
        ammonia_ppm: 15,
        ventilation_status: 'normal',
      };
  }
}
