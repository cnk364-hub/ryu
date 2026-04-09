// =============================================================================
// eif.ts — Simplified Extended Isolation Forest anomaly detection
// =============================================================================
//
// Provides client-side anomaly scoring inspired by EIF principles.
// Uses a combination of z-score analysis, slope contribution, and volatility
// weighting to produce a 0–1 anomaly score for each data point.
//
// A score > 0.6 triggers anomaly detection.
// =============================================================================

import type { FeedingPatternData } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Sigmoid normalisation: maps any real number to (0, 1). */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result for a single data point. */
export interface AnomalyResult {
  /** Index in the original data array. */
  index: number;
  /** Anomaly score in [0, 1]. */
  score: number;
  /** Whether this point exceeds the anomaly threshold. */
  isAnomaly: boolean;
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Calculate anomaly scores for an array of feeding pattern data.
 *
 * For each data point the score is composed of three weighted factors:
 *
 *   1. **Deviation z-score** (60 %) — how far the current `deviation_pct`
 *      is from the running mean of deviations.  Negative deviations
 *      (consumption drops) produce higher scores.
 *   2. **Slope factor** (25 %) — a steep negative slope amplifies the score,
 *      indicating rapid deterioration.
 *   3. **Volatility factor** (15 %) — high volatility adds additional signal,
 *      indicating unstable feeding behaviour.
 *
 * The weighted combination is passed through a sigmoid and clamped to [0, 1].
 *
 * @param data Array of FeedingPatternData (at least 1 element).
 * @returns Array of anomaly scores in [0, 1], one per data point.
 */
export function calculateAnomalyScore(data: FeedingPatternData[]): number[] {
  if (data.length === 0) return [];

  // Global statistics across all deviation values
  const deviations = data.map((d) => d.deviation_pct);
  const globalMeanDev = mean(deviations);
  const globalStdDev = stddev(deviations) || 1; // avoid division by zero

  // Component weights
  const W_DEVIATION = 0.60;
  const W_SLOPE = 0.25;
  const W_VOLATILITY = 0.15;

  // Sigmoid tuning
  const SENSITIVITY = 1.8;
  const OFFSET = -1.0; // centres "normal" data around 0.15–0.20

  return data.map((point) => {
    // 1. Deviation z-score — negative deviation (drop) → positive z
    const zDeviation = -(point.deviation_pct - globalMeanDev) / globalStdDev;

    // 2. Slope factor — negative slope → positive contribution
    const slopeFactor = -point.slope / 5; // -5 kg/day maps to 1.0

    // 3. Volatility factor
    const volFactor = point.volatility / 0.1; // volatility 0.1 maps to 1.0

    // Composite raw score
    const raw =
      W_DEVIATION * zDeviation +
      W_SLOPE * slopeFactor +
      W_VOLATILITY * volFactor;

    // Normalise through sigmoid
    const score = sigmoid(SENSITIVITY * raw + OFFSET);

    return Math.round(clamp(score, 0, 1) * 1000) / 1000;
  });
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

/**
 * Detect anomalies in feeding pattern data.
 *
 * @param data      Array of FeedingPatternData.
 * @param threshold Score above which a point is classified as anomalous
 *                  (default `0.6`).
 * @returns An array of {@link AnomalyResult}, one per data point.
 */
export function detectAnomalies(
  data: FeedingPatternData[],
  threshold: number = 0.6,
): AnomalyResult[] {
  const scores = calculateAnomalyScore(data);

  return scores.map((score, index) => ({
    index,
    score,
    isAnomaly: score > threshold,
  }));
}

// ---------------------------------------------------------------------------
// Convenience aggregations
// ---------------------------------------------------------------------------

/**
 * Count the number of anomaly days in the dataset.
 */
export function countAnomalyDays(
  data: FeedingPatternData[],
  threshold: number = 0.6,
): number {
  return detectAnomalies(data, threshold).filter((r) => r.isAnomaly).length;
}

/**
 * Return the maximum anomaly score across the entire dataset.
 */
export function maxAnomalyScore(data: FeedingPatternData[]): number {
  const scores = calculateAnomalyScore(data);
  return scores.length === 0 ? 0 : Math.max(...scores);
}

/**
 * Return the index of the first anomaly detection point,
 * or `-1` if no anomaly is detected.
 */
export function firstAnomalyIndex(
  data: FeedingPatternData[],
  threshold: number = 0.6,
): number {
  const results = detectAnomalies(data, threshold);
  const first = results.find((r) => r.isAnomaly);
  return first ? first.index : -1;
}
