// Seeded PRNG - Mulberry32
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
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
  let num = 0, den = 0;
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

// ============================================================================
// 랜덤 변형 파라미터 생성
// 매 호출마다 다른 시나리오 변형을 생성
// ============================================================================

function generateVariation(scenario) {
  const r = Math.random;

  if (scenario === 'disease_asf') {
    return {
      baseConsumption: 220 + r() * 60,          // 220~280 kg
      noise: 8 + r() * 6,                        // 노이즈 8~14
      onsetDay: 20 + Math.floor(r() * 7),        // 발병 시작일 20~26일
      mildDeclineRate: 0.03 + r() * 0.03,        // 초기 감소율 3~6%/일
      severeDeclineRate: 0.08 + r() * 0.10,       // 급성 감소율 8~18%/일
      mildDays: 2 + Math.floor(r() * 3),          // 초기 감소 기간 2~4일
      severity: ['mild', 'moderate', 'severe'][Math.floor(r() * 3)],
    };
  }

  if (scenario === 'environment_heat') {
    return {
      baseConsumption: 230 + r() * 40,
      noise: 8 + r() * 5,
      heatOnsetDay: 15 + Math.floor(r() * 10),   // 고온 시작일 15~24일
      heatRate: 1.0 + r() * 2.0,                  // 급이감소 속도 1~3 kg/일
      temperature: 30 + r() * 6,                   // 온도 30~36°C
      humidity: 70 + r() * 20,                     // 습도 70~90%
      ammonia: 15 + r() * 15,                      // 암모니아 15~30ppm
      ventilation: r() > 0.5 ? 'critical' : 'warning',
    };
  }

  // shipment_optimization
  return {
    baseConsumption: 240 + r() * 30,
    noise: 5 + r() * 5,
    growthTrend: 0.1 + r() * 0.5,                 // 일당 증가 0.1~0.6 kg
    avgWeight: 108 + r() * 10,                     // 현재 체중 108~118 kg
    fcr: 2.8 + r() * 0.6,                          // FCR 2.8~3.4
    marketPrice: 4500 + r() * 700,                 // 도매가 4500~5200원/kg
  };
}

// ============================================================================
// 급이 데이터 생성 (랜덤 모드 지원)
// ============================================================================

function generateFeedingData(scenario, days, options) {
  days = days || 30;
  options = options || {};

  // randomize=true이면 매번 다른 데이터, false이면 기존 고정 시드
  const randomize = options.randomize !== false;

  const seed = randomize
    ? Math.floor(Math.random() * 1000000)
    : (scenario === 'disease_asf' ? 42 : scenario === 'environment_heat' ? 84 : 126);

  const rng = mulberry32(seed);
  const variation = randomize ? generateVariation(scenario) : null;

  const base = variation ? variation.baseConsumption : 250;
  const noise = variation ? variation.noise : 10;
  const raw = [];

  for (let i = 0; i < days; i++) {
    let c;
    if (scenario === 'disease_asf') {
      const onset = variation ? variation.onsetDay : 24;
      const mildRate = variation ? variation.mildDeclineRate : 0.04;
      const severeRate = variation ? variation.severeDeclineRate : 0.12;
      const mildDays = variation ? variation.mildDays : 3;

      if (i < onset) {
        c = base + (rng() - 0.5) * 2 * noise;
      } else if (i < onset + mildDays) {
        c = base * (1 - (i - onset + 1) * mildRate) + (rng() - 0.5) * 2 * noise * 0.8;
      } else {
        const daysSevere = i - (onset + mildDays);
        c = base * (1 - mildDays * mildRate - (daysSevere + 1) * severeRate) + (rng() - 0.5) * 2 * noise * 0.5;
      }
    } else if (scenario === 'environment_heat') {
      const heatDay = variation ? variation.heatOnsetDay : 20;
      const heatRate = variation ? variation.heatRate : 1.5;
      const heat = i >= heatDay ? (i - heatDay + 1) * heatRate : 0;
      c = base - heat + (rng() - 0.5) * 2 * noise;
    } else {
      const growthTrend = variation ? variation.growthTrend : 0.3;
      c = base + i * growthTrend + (rng() - 0.5) * 2 * noise * 0.7;
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
    const deviation_pct = baseline === 0 ? 0 : Math.round(((consumption - baseline) / baseline) * 100 * 10) / 10;
    const slopeW = raw.slice(Math.max(0, i - 2), i + 1);
    const slope = Math.round(regressionSlope(slopeW) * 100) / 100;
    const volW = raw.slice(Math.max(0, i - 4), i + 1);
    const vm = mean(volW);
    const volatility = vm === 0 ? 0 : Math.round((stddev(volW) / vm) * 1000) / 1000;
    const status = statusFromDeviation(deviation_pct);

    result.push({ date: formatDate(date), consumption_kg: consumption, normal_baseline: baseline, deviation_pct, slope, volatility, status });
  }

  // 변형 메타데이터 첨부
  if (result.length > 0 && variation) {
    result._variation = variation;
    result._seed = seed;
  }

  return result;
}

// ============================================================================
// 환경 데이터 생성 (랜덤 모드 지원)
// ============================================================================

function generateEnvironmentData(scenario, options) {
  options = options || {};
  const randomize = options.randomize !== false;

  if (!randomize) {
    // 기존 고정값
    if (scenario === 'disease_asf') return { temperature: 22.5, humidity: 65, ammonia_ppm: 18, ventilation_status: 'normal' };
    if (scenario === 'environment_heat') return { temperature: 33.2, humidity: 82, ammonia_ppm: 25, ventilation_status: 'critical' };
    return { temperature: 21.0, humidity: 60, ammonia_ppm: 12, ventilation_status: 'normal' };
  }

  const r = Math.random;

  if (scenario === 'disease_asf') {
    // 질병: 환경은 대체로 정상 (급이 감소가 질병 때문)
    return {
      temperature: 18 + r() * 10,          // 18~28°C
      humidity: 50 + r() * 25,              // 50~75%
      ammonia_ppm: 10 + r() * 12,           // 10~22ppm
      ventilation_status: r() > 0.9 ? 'warning' : 'normal',
    };
  }

  if (scenario === 'environment_heat') {
    return {
      temperature: 30 + r() * 7,            // 30~37°C
      humidity: 70 + r() * 20,              // 70~90%
      ammonia_ppm: 18 + r() * 15,           // 18~33ppm
      ventilation_status: r() > 0.3 ? 'critical' : 'warning',
    };
  }

  // shipment: 정상 환경
  return {
    temperature: 18 + r() * 8,              // 18~26°C
    humidity: 50 + r() * 20,                // 50~70%
    ammonia_ppm: 8 + r() * 10,             // 8~18ppm
    ventilation_status: 'normal',
  };
}

function detectAnomalies(data, threshold = 0.6) {
  if (!data.length) return [];
  const devs = data.map(d => d.deviation_pct);
  const gm = mean(devs);
  const gs = stddev(devs) || 1;

  return data.map((p, i) => {
    const zDev = -(p.deviation_pct - gm) / gs;
    const slopeFactor = -p.slope / 5;
    const volFactor = p.volatility / 0.1;
    const raw = 0.60 * zDev + 0.25 * slopeFactor + 0.15 * volFactor;
    const score = Math.round((1 / (1 + Math.exp(-(1.8 * raw - 1.0)))) * 1000) / 1000;
    return { index: i, score: Math.max(0, Math.min(1, score)), isAnomaly: score > threshold };
  });
}

function generateData(scenario, options) {
  const feedingData = generateFeedingData(scenario, 30, options);
  const environmentData = generateEnvironmentData(scenario, options);
  const anomalyScores = detectAnomalies(feedingData);
  return { feedingData, environmentData, anomalyScores };
}

module.exports = { generateData, generateFeedingData, generateEnvironmentData, detectAnomalies };
