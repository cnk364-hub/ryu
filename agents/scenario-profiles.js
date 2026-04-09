/**
 * 시나리오 프로필 - 3종 시나리오별 에이전트 동작 정의
 *
 * 1. disease_asf: 질병 조기 탐지 및 방역 조치
 * 2. environment_heat: 사육환경 이상 감지 및 대응
 * 3. shipment_optimization: 최적 출하시기 의사결정
 */

const SCENARIO_PROFILES = {
  // ======================================================================
  // 시나리오 1: 질병 (ASF) — LiDAR 센서 급이 데이터 기반 질병 조기탐지 및 방역
  // ======================================================================
  disease_asf: {
    id: 'disease_asf',
    name: '질병 조기탐지 시나리오',
    trigger: 'LiDAR 급이 센서 이상 감지',

    context: {
      focusMetrics: ['consumption_kg', 'deviation_pct', 'slope', 'volatility'],
      anomalyThreshold: 0.55,
      alertTrigger: { feedingDropRate: -15, consecutiveDays: 2 },
      analysisScope: '개체 급이 패턴 + 군집 행동 분석',
      keyIndicators: ['급이량 급감', '야간 급이 감소', '개체 군집 이상', '급이 패턴 변동성'],
    },

    risk: {
      initialState: 'K1',
      criticalTransition: 'K3→K4',
      timeHorizon: 72,  // 시간
      hmmFocus: '급이 감소 지속성 + 감소 속도',
      classificationPriority: ['disease', 'feed', 'environment'],
    },

    planning: {
      actionPriority: ['격리', '신고', '소독', '검사', '이동제한'],
      cbrSearchWeight: { feedingChangeRate: 0.35, mortalityRate: 0.25, riskState: 0.20, season: 0.10, temperature: 0.10 },
      vetRequired: { K3: true, K4: true },
      regulatoryActions: ['가축전염병예방법 제11조 신고', '이동제한 명령 협조'],
    },

    execution: {
      alertTargets: ['farmer', 'vet', 'quarantine_authority', 'farm_staff'],
      alertChannels: { K4: ['sms', 'kakao', 'call'], K3: ['sms', 'kakao'] },
      systemActions: ['센서주기 1분', 'CCTV 연속녹화', '출입문 잠금'],
      workflowType: 'emergency_response',
    },

    monitoring: {
      checkInterval: { K4: 1, K3: 3, K2: 6 },  // 시간
      successCriteria: [
        { metric: 'feedingRecovery', target: 0.8, label: '급이량 80% 회복' },
        { metric: 'anomalyScore', target: 0.4, operator: '<', label: '이상점수 0.4 이하' },
        { metric: 'newCases', target: 0, label: '추가 의심 개체 없음' },
        { metric: 'mortality', target: 0.5, operator: '<', label: '폐사율 0.5% 이하' },
      ],
      recoveryTrigger: ['48시간 내 미회복', '추가 의심 개체', '체온 40°C 이상 3두'],
    },

    recovery: {
      escalationTimeline: { K4: [1, 2, 6, 12], K3: [6, 12, 24, 48] },
      alternativeStrategies: [
        '전두수 긴급 PCR 검사',
        '이동제한 구역 확대 (3km → 10km)',
        '인접 농장 동시 모니터링',
        '비상 살처분 계획 수립',
      ],
      policyAdjust: '경보 임계값 하향 (0.6 → 0.5)',
    },

    orchestration: {
      loopCondition: '급이량 미회복 또는 추가 이상 발생',
      humanReviewTrigger: 'K4 + 효과 없음 또는 3회 루프 초과',
      completionCondition: 'K1 회복 + 경보 해제',
    },
  },

  // ======================================================================
  // 시나리오 2: 환경 — 사육환경센서 이상 감지 → 구분 및 대응
  // ======================================================================
  environment_heat: {
    id: 'environment_heat',
    name: '사육환경 이상 대응 시나리오',
    trigger: '환경센서(온도/습도/암모니아) 이상 감지',

    context: {
      focusMetrics: ['temperature', 'humidity', 'ammonia_ppm', 'thi', 'ventilation_status'],
      anomalyThreshold: 0.5,
      alertTrigger: { temperature: 32, humidity: 80, thi: 78 },
      analysisScope: '축사 환경 데이터 + 급이 영향 분석',
      keyIndicators: ['축사 온도 초과', 'THI 위험', '환기 이상', '습도 과다', '암모니아 농도'],
    },

    risk: {
      initialState: 'K1',
      criticalTransition: 'K2→K3',
      timeHorizon: 48,
      hmmFocus: '환경 지표 지속 시간 + 급이 영향',
      classificationPriority: ['environment', 'seasonal', 'equipment'],
    },

    planning: {
      actionPriority: ['환기', '쿨링', '음수', '급이시간 변경', '밀도 조정'],
      cbrSearchWeight: { temperature: 0.30, humidity: 0.25, feedingChangeRate: 0.15, season: 0.15, riskState: 0.15 },
      vetRequired: { K3: false, K4: true },
      regulatoryActions: [],
    },

    execution: {
      alertTargets: ['farmer', 'farm_staff'],
      alertChannels: { K4: ['sms', 'kakao'], K3: ['kakao', 'push'], K2: ['push'] },
      systemActions: ['환기 최대 가동', '쿨링패드 ON', '미스트 ON', '센서주기 2분'],
      workflowType: 'environment_control',
    },

    monitoring: {
      checkInterval: { K4: 1, K3: 3, K2: 6 },
      successCriteria: [
        { metric: 'temperature', target: 28, operator: '<', label: '축사 온도 28°C 이하' },
        { metric: 'thi', target: 75, operator: '<', label: 'THI 75 이하' },
        { metric: 'feedingMaintained', target: true, label: '급이량 정상 유지' },
        { metric: 'mortality', target: 0, label: '폐사 없음' },
      ],
      recoveryTrigger: ['온도 35°C 이상 2시간 지속', '급이량 15% 급감', '폐사 발생'],
    },

    recovery: {
      escalationTimeline: { K3: [3, 6, 12], K2: [12, 24] },
      alternativeStrategies: [
        '이동식 에어컨 설치',
        '사육 밀도 20% 감소 (분산 수용)',
        '안개 분무 시스템 추가',
        '야간 자연환기 극대화',
      ],
      policyAdjust: '고온기 급이시간 자동 조정 규칙 추가',
    },

    orchestration: {
      loopCondition: '환경 지표 미개선 또는 급이 영향 발생',
      humanReviewTrigger: '환경 시스템 장비 고장 의심',
      completionCondition: '환경 정상 + 급이 정상 유지',
    },
  },

  // ======================================================================
  // 시나리오 3: 출하 — 경제 환경 데이터 기반 최적 출하시기 의사결정
  // ======================================================================
  shipment_optimization: {
    id: 'shipment_optimization',
    name: '최적 출하시기 분석 시나리오',
    trigger: '출하 대상 돈군 목표 체중 임박',

    context: {
      focusMetrics: ['consumption_kg', 'daily_gain', 'fcr', 'avg_weight'],
      anomalyThreshold: 0.7,  // 출하 시나리오는 이상탐지보다 효율 분석
      alertTrigger: { fcrExceed: 3.2, weightTarget: 115 },
      analysisScope: '성장 데이터 + 사료 효율 + 시장 가격 분석',
      keyIndicators: ['목표 체중 도달률', 'FCR 추이', '일당증체량(ADG)', '사료비 효율'],
    },

    risk: {
      initialState: 'K1',
      criticalTransition: null,  // 출하는 위험 전이보다 경제성 분석
      timeHorizon: 168,  // 7일
      hmmFocus: 'FCR 악화 추이 + 시장 가격 변동',
      classificationPriority: ['seasonal', 'feed', 'equipment'],
    },

    planning: {
      actionPriority: ['체중측정', '도축장 예약', '운송 수배', '급이 조정', '가격 모니터링'],
      cbrSearchWeight: { feedingChangeRate: 0.20, season: 0.25, riskState: 0.05, temperature: 0.10, mortalityRate: 0.05 },
      vetRequired: { K3: false, K4: false },
      regulatoryActions: ['출하 전 건강검진', '수송 동물복지 기준 준수'],
      economicFactors: {
        feedCostPerKg: 450,     // 사료비 (원/kg)
        marketPricePerKg: 4850, // 도매가 (원/kg)
        targetWeight: 115,       // 목표 출하 체중 (kg)
        fcrThreshold: 3.2,       // FCR 경제적 한계
      },
    },

    execution: {
      alertTargets: ['farmer'],
      alertChannels: { K1: ['push'], K2: ['kakao'] },
      systemActions: ['체중 자동계량 활성화'],
      workflowType: 'shipment_planning',
    },

    monitoring: {
      checkInterval: { K1: 24, K2: 12 },
      successCriteria: [
        { metric: 'avgWeight', target: 115, operator: '>=', label: '평균 출하체중 115kg 달성' },
        { metric: 'fcr', target: 3.2, operator: '<', label: 'FCR 3.2 이하 유지' },
        { metric: 'gradeRatio', target: 0.8, operator: '>=', label: '1등급 비율 80% 이상' },
        { metric: 'profitPerHead', target: 80000, operator: '>=', label: '두당 순이익 8만원 이상' },
      ],
      recoveryTrigger: ['ADG 0.7 이하 하락', 'FCR 3.5 급등', '시장가격 급락'],
    },

    recovery: {
      escalationTimeline: {},
      alternativeStrategies: [
        '체중 미달 개체 분리 사양',
        '출하 일정 2일 연기',
        '분할 출하 (1차 90두, 2차 30두)',
        '산지 직거래 채널 활용',
      ],
      policyAdjust: 'FCR 모니터링 빈도 상향',
    },

    orchestration: {
      loopCondition: '출하 조건 미달',
      humanReviewTrigger: '시장가격 급변 시 출하 연기/가속 판단',
      completionCondition: '출하 완료 또는 출하 일정 확정',
    },
  },
};

/**
 * 시나리오 자동 감지
 * 급이 데이터 + 환경 데이터로 시나리오 유형 추론
 */
function detectScenario(feedingData, environmentData) {
  if (!feedingData || feedingData.length < 3) return 'disease_asf';

  const recent = feedingData.slice(-5);
  const avgConsumption = recent.reduce((s, d) => s + d.consumption_kg, 0) / recent.length;
  const changeRate = feedingData.length >= 10
    ? ((avgConsumption - feedingData.slice(-10, -5).reduce((s, d) => s + d.consumption_kg, 0) / 5) /
       (feedingData.slice(-10, -5).reduce((s, d) => s + d.consumption_kg, 0) / 5)) * 100
    : 0;

  // 환경 이상 감지
  if (environmentData) {
    const { temperature, humidity } = environmentData;
    if (temperature > 32 || humidity > 80) return 'environment_heat';
  }

  // 급이량 급감 → 질병
  if (changeRate < -15) return 'disease_asf';

  // 안정적 + 증가 추세 → 출하
  if (changeRate > -5 && changeRate < 10) return 'shipment_optimization';

  return 'disease_asf';
}

module.exports = { SCENARIO_PROFILES, detectScenario };
