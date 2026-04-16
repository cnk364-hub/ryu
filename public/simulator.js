// =============================================================================
// simulator.js — Browser-compatible feeding/environment data simulator
// Ported from mock-data/simulator.js (CommonJS → browser global).
// Exposes window.Simulator for use in public/app.js.
// =============================================================================

(function (global) {
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  }

  function regressionSlope(vals) {
    const n = vals.length;
    if (n < 2) return 0;
    const xm = (n - 1) / 2;
    const ym = mean(vals);
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xm) * (vals[i] - ym);
      den += (i - xm) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function statusFromDeviation(dev) {
    if (dev > -10) return 'normal';
    if (dev > -20) return 'caution';
    if (dev > -30) return 'danger';
    return 'emergency';
  }

  function generateFeedingData(scenario, days) {
    days = days || 30;
    const seed =
      scenario === 'disease_asf' ? 42 : scenario === 'environment_heat' ? 84 : 126;
    const rng = mulberry32(seed);
    const base = 250;
    const noise = 10;
    const raw = [];

    for (let i = 0; i < days; i++) {
      let c;
      if (scenario === 'disease_asf') {
        if (i < 24) c = base + (rng() - 0.5) * 2 * noise;
        else if (i < 27) c = base * (1 - (i - 23) * 0.04) + (rng() - 0.5) * 2 * noise * 0.8;
        else c = base * (1 - (i - 26) * 0.12) + (rng() - 0.5) * 2 * noise * 0.5;
      } else if (scenario === 'environment_heat') {
        const heat = i >= 20 ? (i - 19) * 1.5 : 0;
        c = base - heat + (rng() - 0.5) * 2 * noise;
      } else {
        c = base + i * 0.3 + (rng() - 0.5) * 2 * noise * 0.7;
      }
      raw.push(Math.max(50, Math.round(c * 10) / 10));
    }

    const result = [];
    const startDate = new Date('2026-03-10');

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const consumption = raw[i];
      const window = raw.slice(Math.max(0, i - 6), i + 1);
      const baseline = Math.round(mean(window) * 10) / 10;
      const deviation_pct =
        baseline === 0
          ? 0
          : Math.round(((consumption - baseline) / baseline) * 100 * 10) / 10;
      const slopeW = raw.slice(Math.max(0, i - 2), i + 1);
      const slope = Math.round(regressionSlope(slopeW) * 100) / 100;
      const volW = raw.slice(Math.max(0, i - 4), i + 1);
      const vm = mean(volW);
      const volatility = vm === 0 ? 0 : Math.round((stddev(volW) / vm) * 1000) / 1000;
      const status = statusFromDeviation(deviation_pct);

      result.push({
        date: formatDate(date),
        consumption_kg: consumption,
        normal_baseline: baseline,
        deviation_pct,
        slope,
        volatility,
        status,
      });
    }
    return result;
  }

  function generateEnvironmentData(scenario) {
    if (scenario === 'disease_asf')
      return { temperature: 22.5, humidity: 65, ammonia_ppm: 18, ventilation_status: 'normal' };
    if (scenario === 'environment_heat')
      return { temperature: 33.2, humidity: 82, ammonia_ppm: 25, ventilation_status: 'critical' };
    return { temperature: 21.0, humidity: 60, ammonia_ppm: 12, ventilation_status: 'normal' };
  }

  function generateData(scenario) {
    return {
      feedingData: generateFeedingData(scenario),
      environmentData: generateEnvironmentData(scenario),
    };
  }

  global.Simulator = { generateData, generateFeedingData, generateEnvironmentData };
})(window);
