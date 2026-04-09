/**
 * LiDAR Time Series Generator
 *
 * LiDAR 기반 사료빈 재고 데이터를 급이 소모량 시계열로 변환
 *
 * 흐름:
 *   LiDAR 센서 → 사료빈 높이(mm) → 부피(L) → 무게(kg) → 일일 소모량 시계열
 *
 * 사료빈 규격 (원통형 기준):
 *   - 직경: 2.0m, 높이: 3.0m
 *   - 최대 용량: 약 9,420L (사료 비중 0.6 → 약 5,652kg)
 */

class LiDARTimeSeries {
  constructor(config = {}) {
    // 사료빈 규격
    this.binDiameter = config.binDiameter || 2.0;     // m
    this.binHeight = config.binHeight || 3.0;          // m
    this.feedDensity = config.feedDensity || 0.6;      // kg/L (사료 비중)

    // 계산값
    this.binRadius = this.binDiameter / 2;
    this.binArea = Math.PI * this.binRadius ** 2;      // m²
    this.maxVolume = this.binArea * this.binHeight * 1000; // L
    this.maxWeight = this.maxVolume * this.feedDensity;    // kg

    // 센서 설정
    this.sensorInterval = config.sensorInterval || 300; // 초 (5분)
    this.sensorNoise = config.sensorNoise || 2;         // mm (측정 노이즈)
    this.refillThreshold = config.refillThreshold || 0.15; // 15% 이하 시 리필 감지
  }

  /**
   * LiDAR 원시 데이터 → 일일 소모량 시계열 변환
   *
   * @param {Array<Object>} rawReadings - LiDAR 센서 측정값 배열
   *   각 항목: { timestamp, distance_mm } (빈 상단에서 사료 표면까지 거리)
   * @returns {Array<Object>} 일별 급이 소모량 시계열
   */
  convertToTimeSeries(rawReadings) {
    if (!rawReadings || rawReadings.length === 0) return [];

    // 1. 거리 → 사료 잔량(kg) 변환
    const weightReadings = rawReadings.map(r => ({
      timestamp: r.timestamp,
      distance_mm: r.distance_mm,
      feedLevel_mm: (this.binHeight * 1000) - r.distance_mm, // 사료 높이
      weight_kg: this._distanceToWeight(r.distance_mm),
    }));

    // 2. 노이즈 필터링 (이동중앙값 필터)
    const filtered = this._medianFilter(weightReadings, 5);

    // 3. 리필 이벤트 감지 및 제거
    const cleanedSegments = this._detectAndRemoveRefills(filtered);

    // 4. 일별 소모량 집계
    const dailyConsumption = this._aggregateDaily(cleanedSegments);

    return dailyConsumption;
  }

  /**
   * 실시간 단일 측정값 처리 (Edge AI용)
   *
   * @param {Object} reading - { timestamp, distance_mm }
   * @param {Object} prevState - 이전 상태 (누적 소모량 등)
   * @returns {Object} 처리된 측정값 + 상태
   */
  processRealtime(reading, prevState = {}) {
    const weight = this._distanceToWeight(reading.distance_mm);
    const prevWeight = prevState.lastWeight || weight;
    const consumption = prevWeight - weight;

    // 리필 감지 (무게 급증 = 사료 투입)
    const isRefill = consumption < -50; // 50kg 이상 증가 = 리필

    const newState = {
      lastWeight: weight,
      lastTimestamp: reading.timestamp,
      dailyTotal: isRefill ? (prevState.dailyTotal || 0) : (prevState.dailyTotal || 0) + Math.max(0, consumption),
      readingCount: (prevState.readingCount || 0) + 1,
      isRefill,
    };

    return {
      weight_kg: Math.round(weight * 10) / 10,
      consumption_kg: isRefill ? 0 : Math.round(Math.max(0, consumption) * 10) / 10,
      daily_total_kg: Math.round(newState.dailyTotal * 10) / 10,
      is_refill: isRefill,
      state: newState,
    };
  }

  /**
   * LiDAR 원시 데이터 시뮬레이션 (테스트용)
   *
   * @param {Array<Object>} feedingData - 기존 급이 데이터 (일별)
   * @returns {Array<Object>} 시뮬레이션된 LiDAR 측정값 (5분 간격)
   */
  simulateLiDARReadings(feedingData) {
    const readings = [];
    let currentWeight = this.maxWeight * 0.8; // 80% 차있는 상태에서 시작

    for (const day of feedingData) {
      const dailyConsumption = day.consumption_kg;
      const readingsPerDay = Math.floor(86400 / this.sensorInterval); // 288회/일

      // 급이는 주로 아침(7~9시)과 저녁(17~19시)에 집중
      for (let r = 0; r < readingsPerDay; r++) {
        const hour = (r * this.sensorInterval / 3600) % 24;
        const date = new Date(day.date + 'T00:00:00');
        date.setSeconds(date.getSeconds() + r * this.sensorInterval);

        // 시간대별 소모 비율
        let consumptionRate = 0;
        if (hour >= 7 && hour < 9) consumptionRate = 0.35 / (readingsPerDay * 2 / 24);  // 오전 35%
        else if (hour >= 12 && hour < 14) consumptionRate = 0.15 / (readingsPerDay * 2 / 24); // 점심 15%
        else if (hour >= 17 && hour < 19) consumptionRate = 0.35 / (readingsPerDay * 2 / 24); // 저녁 35%
        else consumptionRate = 0.15 / (readingsPerDay * 20 / 24); // 나머지 15%

        const consumed = dailyConsumption * consumptionRate;
        currentWeight = Math.max(0, currentWeight - consumed);

        // 리필 (20% 이하로 떨어지면)
        if (currentWeight < this.maxWeight * this.refillThreshold) {
          currentWeight = this.maxWeight * 0.85; // 85%로 리필
        }

        // LiDAR 거리 = 빈 높이 - 사료 높이 + 노이즈
        const feedHeight = this._weightToHeight(currentWeight);
        const distance = (this.binHeight * 1000) - feedHeight + (Math.random() - 0.5) * 2 * this.sensorNoise;

        readings.push({
          timestamp: date.toISOString(),
          distance_mm: Math.round(Math.max(0, distance)),
          simulated: true,
        });
      }
    }

    return readings;
  }

  // === 내부 변환 함수 ===

  /**
   * LiDAR 거리(mm) → 사료 무게(kg)
   */
  _distanceToWeight(distanceMm) {
    const feedHeightM = this.binHeight - (distanceMm / 1000);
    if (feedHeightM <= 0) return 0;
    const volumeL = this.binArea * feedHeightM * 1000;
    return volumeL * this.feedDensity;
  }

  /**
   * 무게(kg) → 사료 높이(mm)
   */
  _weightToHeight(weightKg) {
    const volumeL = weightKg / this.feedDensity;
    const heightM = volumeL / 1000 / this.binArea;
    return heightM * 1000; // mm
  }

  /**
   * 이동중앙값 필터 (센서 노이즈 제거)
   */
  _medianFilter(data, windowSize) {
    return data.map((d, i) => {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(data.length, i + Math.floor(windowSize / 2) + 1);
      const window = data.slice(start, end).map(x => x.weight_kg).sort((a, b) => a - b);
      const median = window[Math.floor(window.length / 2)];
      return { ...d, weight_kg: median };
    });
  }

  /**
   * 리필 이벤트 감지 및 세그먼트 분리
   */
  _detectAndRemoveRefills(data) {
    const segments = [];
    let currentSegment = [];

    for (let i = 0; i < data.length; i++) {
      if (i > 0) {
        const weightIncrease = data[i].weight_kg - data[i - 1].weight_kg;
        if (weightIncrease > 50) {
          // 리필 감지: 세그먼트 종료
          if (currentSegment.length > 0) segments.push(currentSegment);
          currentSegment = [];
        }
      }
      currentSegment.push(data[i]);
    }
    if (currentSegment.length > 0) segments.push(currentSegment);

    return segments;
  }

  /**
   * 일별 소모량 집계
   */
  _aggregateDaily(segments) {
    const dailyMap = new Map();

    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        const date = segment[i].timestamp.slice(0, 10);
        const consumption = Math.max(0, segment[i - 1].weight_kg - segment[i].weight_kg);

        if (!dailyMap.has(date)) {
          dailyMap.set(date, { date, consumption_kg: 0, readings: 0 });
        }
        const entry = dailyMap.get(date);
        entry.consumption_kg += consumption;
        entry.readings++;
      }
    }

    return Array.from(dailyMap.values())
      .map(d => ({
        date: d.date,
        consumption_kg: Math.round(d.consumption_kg * 10) / 10,
        readings: d.readings,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

module.exports = { LiDARTimeSeries };
