/**
 * Case Database - 과거 질병/이상 사례 DB
 *
 * CBR(사례기반추론)의 Case Base
 * 실제 운영 시 DB(PostgreSQL 등)에서 로드하지만,
 * 현재는 공개 자료 기반 샘플 사례로 구축
 */

const CASE_DATABASE = [
  // ========== ASF (아프리카돼지열병) ==========
  {
    id: 'CASE-ASF-2023-001',
    category: 'disease',
    disease: 'ASF',
    title: '2023년 충남 홍성 ASF 발생',
    region: '충남',
    date: '2023-06-15',
    features: {
      feedingChangeRate: -38.5,
      anomalyDays: 4,
      riskState: 'K4',
      severityScore: 0.91,
      temperature: 24.0,
      humidity: 65,
      season: 'summer',
      headCount: 3200,
      mortalityRate: 2.1,
    },
    symptoms: ['급이량 급감', '고열(41°C)', '피부 출혈', '기립 불능'],
    actions: {
      immediate: [
        '의심 돈사 즉시 격리 및 출입 통제',
        '시군 가축방역기관 긴급 신고',
        '전 구역 긴급 소독 실시',
        '이동제한 명령 요청 (반경 3km)',
      ],
      shortTerm: [
        '의심 개체 시료 채취 및 PCR 검사 의뢰',
        '전 두수 임상 검사 실시 (체온 측정 2회/일)',
        '인접 돈사 모니터링 강화',
        'CCTV 영상 확보 및 이상행동 기록',
      ],
      preventive: [
        '역학조사관 현장 방문 요청',
        '인접 농가 상황 공유 및 경보',
        '차량/인원 이동경로 GPS 분석',
        '살처분 대비 계획 사전 수립',
      ],
    },
    outcome: '확진 → 살처분 3,200두, 이동제한 10km, 방역비 12억원',
    lessonsLearned: '초기 신고 지연(12시간)으로 인접 농장 확산. 즉시 신고의 중요성 확인.',
    responseTimeHours: 6,
    effectiveness: 0.65,
  },
  {
    id: 'CASE-ASF-2024-001',
    category: 'disease',
    disease: 'ASF',
    title: '2024년 경기 파주 ASF 의심 사례',
    region: '경기',
    date: '2024-02-20',
    features: {
      feedingChangeRate: -25.0,
      anomalyDays: 2,
      riskState: 'K3',
      severityScore: 0.72,
      temperature: 5.0,
      humidity: 55,
      season: 'winter',
      headCount: 1800,
      mortalityRate: 0.8,
    },
    symptoms: ['급이량 감소', '미열', '활동량 저하'],
    actions: {
      immediate: [
        '의심 돈사 격리 조치',
        '시군 가축방역기관 신고',
        '출입 통제 및 소독 강화',
      ],
      shortTerm: [
        'PCR 검사 시료 채취',
        '체온 측정 강화 (3회/일)',
        '인접 농가 예찰 강화',
      ],
      preventive: [
        '방역 자재 추가 확보',
        '비상 연락망 점검',
      ],
    },
    outcome: '음성 판정 → 소화기 질환으로 최종 진단. 항생제 치료 후 회복.',
    lessonsLearned: '급이 감소만으로 ASF 단정 불가. 체온+임상 종합 판단 필요.',
    responseTimeHours: 3,
    effectiveness: 0.85,
  },

  // ========== PED (돼지유행성설사) ==========
  {
    id: 'CASE-PED-2024-001',
    category: 'disease',
    disease: 'PED',
    title: '2024년 전북 김제 PED 발생',
    region: '전북',
    date: '2024-11-10',
    features: {
      feedingChangeRate: -42.0,
      anomalyDays: 5,
      riskState: 'K4',
      severityScore: 0.88,
      temperature: 8.0,
      humidity: 70,
      season: 'fall',
      headCount: 2500,
      mortalityRate: 15.0,
    },
    symptoms: ['수양성 설사', '급이량 급감', '자돈 폐사', '구토'],
    actions: {
      immediate: [
        '이환 돈사 즉시 격리',
        '자돈사 집중 관리 (보온 강화)',
        '전해질 수액 투여',
        '방역기관 신고',
      ],
      shortTerm: [
        'PED 백신 긴급 접종 (모돈)',
        '소독 강화 (석회 살포)',
        '사료 급이 중단 후 점진적 재개',
        '포유 자돈 인공 포유 전환',
      ],
      preventive: [
        '농장 내 구역별 이동 제한',
        '외부 인원 출입 금지 (2주)',
        '차량 소독조 설치',
      ],
    },
    outcome: '자돈 폐사 380두, 성돈 3주 후 회복. 총 피해액 8,500만원.',
    lessonsLearned: '겨울철 PED 발생 증가. 방한+위생 관리 병행 필수.',
    responseTimeHours: 4,
    effectiveness: 0.70,
  },

  // ========== 고온 스트레스 ==========
  {
    id: 'CASE-HEAT-2025-001',
    category: 'environment',
    disease: null,
    title: '2025년 충남 논산 고온 스트레스',
    region: '충남',
    date: '2025-07-22',
    features: {
      feedingChangeRate: -12.0,
      anomalyDays: 0,
      riskState: 'K2',
      severityScore: 0.48,
      temperature: 35.5,
      humidity: 85,
      season: 'summer',
      headCount: 4000,
      mortalityRate: 0.5,
    },
    symptoms: ['급이량 소폭 감소', '호흡수 증가', '음수량 증가', '활동 저하'],
    actions: {
      immediate: [
        '터널식 환기 전환 (전 팬 최대 가동)',
        '쿨링패드 및 미스트 시스템 가동',
        '음수 공급 확대',
        '급이 시간 변경 (새벽/야간)',
      ],
      shortTerm: [
        '전해질제 및 비타민C 음수 첨가',
        '사육 밀도 조정 (분산 수용)',
        '차광막 설치',
        '환기팬 점검 및 정비',
      ],
      preventive: [
        '72시간 기상예보 기반 대응 계획',
        '비상 발전기 점검',
        '축사 단열재 보강',
      ],
    },
    outcome: '환기+쿨링 조치 후 48시간 내 정상 회복. 폐사 없음.',
    lessonsLearned: '환기팬 RPM 모니터링이 조기 대응의 핵심.',
    responseTimeHours: 2,
    effectiveness: 0.92,
  },

  // ========== 사료 문제 ==========
  {
    id: 'CASE-FEED-2025-001',
    category: 'feed',
    disease: null,
    title: '2025년 경북 상주 사료 품질 문제',
    region: '경북',
    date: '2025-03-05',
    features: {
      feedingChangeRate: -18.0,
      anomalyDays: 2,
      riskState: 'K2',
      severityScore: 0.42,
      temperature: 12.0,
      humidity: 55,
      season: 'spring',
      headCount: 1500,
      mortalityRate: 0.0,
    },
    symptoms: ['급이량 감소', '사료 잔량 증가', '환경 정상', '임상 증상 없음'],
    actions: {
      immediate: [
        '사료 샘플 채취 및 품질 검사 의뢰',
        '사료 로트 번호 확인',
        '기존 사료 재고 확인 및 교체 준비',
      ],
      shortTerm: [
        '사료 공급업체 연락 및 원인 조사',
        '대체 사료 긴급 수배',
        '급이기 점검 (막힘, 이물질)',
        '급이 패턴 집중 모니터링',
      ],
      preventive: [
        '사료 입고 시 품질 검사 프로세스 수립',
        '비상 사료 재고 (3일분) 확보',
        '사료 저장 환경 점검 (곰팡이, 수분)',
      ],
    },
    outcome: '사료 로트 불량 확인 → 교체 후 2일 내 정상 회복.',
    lessonsLearned: '사료 교체 시점과 급이 변화 시점 일치 확인이 중요.',
    responseTimeHours: 8,
    effectiveness: 0.90,
  },

  // ========== 출하 관련 ==========
  {
    id: 'CASE-SHIP-2026-001',
    category: 'management',
    disease: null,
    title: '2026년 1월 출하 최적화 성공 사례',
    region: '충남',
    date: '2026-01-15',
    features: {
      feedingChangeRate: 1.5,
      anomalyDays: 0,
      riskState: 'K1',
      severityScore: 0.12,
      temperature: 18.0,
      humidity: 60,
      season: 'winter',
      headCount: 1200,
      mortalityRate: 0.1,
    },
    symptoms: [],
    actions: {
      immediate: [
        '출하 대상 개체별 체중 측정',
        '도축장 출하 예약',
        '운송 차량 수배',
      ],
      shortTerm: [
        'FCR 모니터링 강화',
        '출하 전 사료 조정',
        '도매시장 가격 동향 확인',
      ],
      preventive: [
        '잔여 돈군 출하 일정 수립',
        '출하 후 돈사 세척/소독 계획',
      ],
    },
    outcome: '평균 출하 체중 115.2kg, 1등급 비율 85%, 두당 순이익 9.2만원.',
    lessonsLearned: 'FCR 3.0 이하 유지 시 수익률 극대화.',
    responseTimeHours: 24,
    effectiveness: 0.95,
  },
];

module.exports = { CASE_DATABASE };
