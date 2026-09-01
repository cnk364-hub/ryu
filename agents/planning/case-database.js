/**
 * Case Database - 과거 질병/이상 사례 DB (20건)
 *
 * 한국 축산 공개 자료 기반 CBR Case Base
 * 카테고리: ASF, CSF, PED, FMD, PRRS, 호흡기, 고온, 저온, 사료, 환기, 출하, 성장, 생산성
 */

const CASE_DATABASE = [
  // ========== 1. ASF 충남 홍성 ==========
  {
    id: 'CASE-ASF-2023-001', category: 'disease', disease: 'ASF',
    title: '2023년 충남 홍성 ASF 발생', region: '충남', date: '2023-06-15',
    features: { feedingChangeRate: -38.5, anomalyDays: 4, riskState: 'K4', severityScore: 0.91, temperature: 24.0, humidity: 65, season: 'summer', headCount: 3200, mortalityRate: 2.1 },
    symptoms: ['급이량 급감', '고열(41°C)', '피부 출혈', '기립 불능'],
    actions: {
      immediate: ['의심 돈사 즉시 격리 및 출입 통제', '시군 가축방역기관 긴급 신고', '전 구역 긴급 소독 실시', '이동제한 명령 요청 (반경 3km)'],
      shortTerm: ['의심 개체 시료 채취 및 PCR 검사 의뢰', '전 두수 임상 검사 실시 (체온 측정 2회/일)', '인접 돈사 모니터링 강화', 'CCTV 영상 확보'],
      preventive: ['역학조사관 현장 방문 요청', '인접 농가 상황 공유', '차량/인원 이동경로 GPS 분석', '살처분 대비 계획 수립'],
    },
    outcome: '확진 → 살처분 3,200두, 이동제한 10km, 방역비 12억원',
    lessonsLearned: '초기 신고 지연(12시간)으로 인접 농장 확산. 즉시 신고가 핵심.',
    responseTimeHours: 6, effectiveness: 0.65,
  },
  // ========== 2. ASF 경기 파주 ==========
  {
    id: 'CASE-ASF-2024-001', category: 'disease', disease: 'ASF',
    title: '2024년 경기 파주 ASF 의심 (음성)', region: '경기', date: '2024-02-20',
    features: { feedingChangeRate: -25.0, anomalyDays: 2, riskState: 'K3', severityScore: 0.72, temperature: 5.0, humidity: 55, season: 'winter', headCount: 1800, mortalityRate: 0.8 },
    symptoms: ['급이량 감소', '미열', '활동량 저하'],
    actions: {
      immediate: ['의심 돈사 격리 조치', '시군 가축방역기관 신고', '출입 통제 및 소독 강화'],
      shortTerm: ['PCR 검사 시료 채취', '체온 측정 강화 (3회/일)', '인접 농가 예찰 강화'],
      preventive: ['방역 자재 추가 확보', '비상 연락망 점검'],
    },
    outcome: '음성 판정 → 소화기 질환으로 최종 진단. 항생제 치료 후 회복.',
    lessonsLearned: '급이 감소만으로 ASF 단정 불가. 체온+임상 종합 판단 필요.',
    responseTimeHours: 3, effectiveness: 0.85,
  },
  // ========== 3. ASF 강원 철원 ==========
  {
    id: 'CASE-ASF-2025-001', category: 'disease', disease: 'ASF',
    title: '2025년 강원 철원 야생멧돼지 ASF 인접 농장 긴급예찰', region: '강원', date: '2025-04-10',
    features: { feedingChangeRate: -8.0, anomalyDays: 1, riskState: 'K2', severityScore: 0.45, temperature: 14.0, humidity: 60, season: 'spring', headCount: 2200, mortalityRate: 0.0 },
    symptoms: ['야생멧돼지 ASF 양성 반경 2km', '농장 급이 소폭 변동', '임상 증상 없음'],
    actions: {
      immediate: ['농장 출입 완전 통제', '울타리 및 방역 시설 긴급 점검', '전 두수 임상 검사'],
      shortTerm: ['혈청 검사 실시', '야생동물 침입 경로 차단 보강', '소독 빈도 일2회→일4회'],
      preventive: ['야생멧돼지 포획틀 추가 설치', 'GPS 기반 야생동물 이동 모니터링', '농장 종사자 외출 제한'],
    },
    outcome: '농장 내 음성 확인. 예방 강화 조치로 발생 없이 해제.',
    lessonsLearned: '야생멧돼지 발생 반경 내 선제적 예찰이 효과적.',
    responseTimeHours: 2, effectiveness: 0.95,
  },
  // ========== 4. PED 전북 김제 ==========
  {
    id: 'CASE-PED-2024-001', category: 'disease', disease: 'PED',
    title: '2024년 전북 김제 PED 발생', region: '전북', date: '2024-11-10',
    features: { feedingChangeRate: -42.0, anomalyDays: 5, riskState: 'K4', severityScore: 0.88, temperature: 8.0, humidity: 70, season: 'fall', headCount: 2500, mortalityRate: 15.0 },
    symptoms: ['수양성 설사', '급이량 급감', '자돈 폐사', '구토'],
    actions: {
      immediate: ['이환 돈사 즉시 격리', '자돈사 집중 관리 (보온 강화)', '전해질 수액 투여', '방역기관 신고'],
      shortTerm: ['PED 백신 긴급 접종 (모돈)', '소독 강화 (석회 살포)', '사료 급이 중단 후 점진적 재개', '포유 자돈 인공 포유 전환'],
      preventive: ['농장 내 구역별 이동 제한', '외부 인원 출입 금지 (2주)', '차량 소독조 설치'],
    },
    outcome: '자돈 폐사 380두, 성돈 3주 후 회복. 총 피해액 8,500만원.',
    lessonsLearned: '겨울철 PED 발생 증가. 방한+위생 관리 병행 필수.',
    responseTimeHours: 4, effectiveness: 0.70,
  },
  // ========== 5. PED 경남 함안 ==========
  {
    id: 'CASE-PED-2025-001', category: 'disease', disease: 'PED',
    title: '2025년 경남 함안 PED 소규모 발생', region: '경남', date: '2025-01-22',
    features: { feedingChangeRate: -20.0, anomalyDays: 3, riskState: 'K3', severityScore: 0.65, temperature: 2.0, humidity: 45, season: 'winter', headCount: 800, mortalityRate: 8.0 },
    symptoms: ['묽은 설사', '자돈 탈수', '모돈 급이 감소', '축사 내 악취 증가'],
    actions: {
      immediate: ['발생 돈방 격리', '보온등 추가 설치 (자돈사)', '전해질+포도당 음수 투여'],
      shortTerm: ['모돈 PED 경구 백신 투여', '돈사 간 이동 금지', '석회 소독 일2회'],
      preventive: ['겨울철 축사 보온 점검 매뉴얼 수립', '차량 소독 프로토콜 강화'],
    },
    outcome: '자돈 64두 폐사, 2주 후 안정화. 모돈 급이 정상 회복.',
    lessonsLearned: '소규모 농장도 PED 대비 백신 프로그램 필수.',
    responseTimeHours: 5, effectiveness: 0.75,
  },
  // ========== 6. FMD 충북 음성 ==========
  {
    id: 'CASE-FMD-2023-001', category: 'disease', disease: 'FMD',
    title: '2023년 충북 음성 구제역 의심 사례', region: '충북', date: '2023-03-18',
    features: { feedingChangeRate: -30.0, anomalyDays: 3, riskState: 'K4', severityScore: 0.85, temperature: 10.0, humidity: 58, season: 'spring', headCount: 4500, mortalityRate: 0.5 },
    symptoms: ['수포 형성 (발굽, 주둥이)', '급이 거부', '파행', '과다 침흘림'],
    actions: {
      immediate: ['즉시 이동중지 명령', '시료 채취 (수포액, 혈청)', '반경 500m 긴급 소독', '방역 당국 긴급 신고'],
      shortTerm: ['반경 10km 이동제한', '인접 농장 전수 임상검사', '백신 접종 여부 확인', '역학조사반 투입'],
      preventive: ['구제역 백신 접종 일정 재검토', '축산차량 GPS 분석', '도축장 출하 중단'],
    },
    outcome: '음성 판정(수포성구내염). 이동제한 48시간 후 해제. 백신 보강 접종 실시.',
    lessonsLearned: '수포 증상 시 구제역 우선 배제 검사. 과잉 대응이 미대응보다 낫다.',
    responseTimeHours: 1, effectiveness: 0.90,
  },
  // ========== 7. PRRS 경기 이천 ==========
  {
    id: 'CASE-PRRS-2024-001', category: 'disease', disease: 'PRRS',
    title: '2024년 경기 이천 PRRS 만성 감염', region: '경기', date: '2024-08-05',
    features: { feedingChangeRate: -12.0, anomalyDays: 14, riskState: 'K2', severityScore: 0.52, temperature: 30.0, humidity: 78, season: 'summer', headCount: 3000, mortalityRate: 1.5 },
    symptoms: ['지속적 급이 소폭 감소', '번식 성적 저하', '이유 후 폐사 증가', '호흡기 증상 산발'],
    actions: {
      immediate: ['PRRS PCR 검사 의뢰', '이환 돈사 환기 강화', '항생제 투여 (2차 감염 방지)'],
      shortTerm: ['PRRS 생백신 접종 프로그램 도입', '돈군 안정화 (올인올아웃)', '혈청 모니터링 (월1회)'],
      preventive: ['외부 도입돈 격리 검역 (30일)', '정액 PRRS 검사 의무화', '농장 바이오시큐리티 등급 평가'],
    },
    outcome: '6개월간 백신+관리 프로그램 후 급이 정상화. 번식 성적 15% 개선.',
    lessonsLearned: 'PRRS는 급성이 아닌 만성 손실이 크다. 장기 관리 프로그램이 핵심.',
    responseTimeHours: 48, effectiveness: 0.72,
  },
  // ========== 8. 호흡기 질환 충남 천안 ==========
  {
    id: 'CASE-RESP-2025-001', category: 'disease', disease: 'respiratory',
    title: '2025년 충남 천안 복합 호흡기 질환', region: '충남', date: '2025-03-25',
    features: { feedingChangeRate: -18.0, anomalyDays: 7, riskState: 'K3', severityScore: 0.62, temperature: 12.0, humidity: 72, season: 'spring', headCount: 1500, mortalityRate: 3.2 },
    symptoms: ['기침', '복식호흡', '급이량 점진 감소', '발열 38.5~40°C', '성장 정체'],
    actions: {
      immediate: ['호흡기 항생제 투약 (틸미코신)', '환기량 조절 (최소환기 유지)', '돈사 내 분진 관리'],
      shortTerm: ['부검 및 세균배양 검사', 'MH/APP 백신 접종 검토', '사육 밀도 10% 감소'],
      preventive: ['환절기 환기 프로그램 재설정', '돈사 내 암모니아 농도 주1회 측정', '올인올아웃 철저 시행'],
    },
    outcome: '항생제 치료 10일 후 급이 회복. 폐사 48두. ADG 0.15kg/일 감소 (4주간).',
    lessonsLearned: '환절기 일교차 대비 환기 관리가 호흡기 질환 예방의 핵심.',
    responseTimeHours: 12, effectiveness: 0.78,
  },
  // ========== 9. CSF 경북 안동 ==========
  {
    id: 'CASE-CSF-2023-001', category: 'disease', disease: 'CSF',
    title: '2023년 경북 안동 돼지열병 백신주 양성 사례', region: '경북', date: '2023-09-12',
    features: { feedingChangeRate: -15.0, anomalyDays: 3, riskState: 'K3', severityScore: 0.68, temperature: 22.0, humidity: 63, season: 'fall', headCount: 2800, mortalityRate: 0.3 },
    symptoms: ['산발적 발열', '급이 소폭 감소', '결막 충혈', '변비→설사 교대'],
    actions: {
      immediate: ['CSF 감별진단 검사 의뢰', '발열 개체 격리', '축사 소독 강화'],
      shortTerm: ['백신 접종 이력 확인', '야생멧돼지 유입 경로 점검', 'ELISA 항체가 모니터링'],
      preventive: ['CSF 백신 접종 일정 준수 확인', '주변 농장 동시 예찰'],
    },
    outcome: '백신주 양성(야외주 음성) 확인. 추가 발생 없이 종결.',
    lessonsLearned: 'CSF 야외주와 백신주 감별진단이 중요. PCR 유전자형 분석 필수.',
    responseTimeHours: 6, effectiveness: 0.88,
  },
  // ========== 10. 고온 스트레스 충남 논산 ==========
  {
    id: 'CASE-HEAT-2025-001', category: 'environment', disease: null,
    title: '2025년 충남 논산 폭염 고온 스트레스', region: '충남', date: '2025-07-22',
    features: { feedingChangeRate: -12.0, anomalyDays: 0, riskState: 'K2', severityScore: 0.48, temperature: 35.5, humidity: 85, season: 'summer', headCount: 4000, mortalityRate: 0.5 },
    symptoms: ['급이량 소폭 감소', '호흡수 증가', '음수량 증가', '활동 저하'],
    actions: {
      immediate: ['터널식 환기 전환 (전 팬 최대 가동)', '쿨링패드 및 미스트 시스템 가동', '음수 공급 확대', '급이 시간 변경 (새벽/야간)'],
      shortTerm: ['전해질제 및 비타민C 음수 첨가', '사육 밀도 조정 (분산 수용)', '차광막 설치', '환기팬 점검 및 정비'],
      preventive: ['72시간 기상예보 기반 대응 계획', '비상 발전기 점검', '축사 단열재 보강'],
    },
    outcome: '환기+쿨링 조치 후 48시간 내 정상 회복. 폐사 없음.',
    lessonsLearned: '환기팬 RPM 모니터링이 조기 대응의 핵심.',
    responseTimeHours: 2, effectiveness: 0.92,
  },
  // ========== 11. 고온 경남 밀양 ==========
  {
    id: 'CASE-HEAT-2024-001', category: 'environment', disease: null,
    title: '2024년 경남 밀양 야간 고온 스트레스', region: '경남', date: '2024-08-03',
    features: { feedingChangeRate: -22.0, anomalyDays: 2, riskState: 'K3', severityScore: 0.71, temperature: 37.0, humidity: 88, season: 'summer', headCount: 5000, mortalityRate: 1.8 },
    symptoms: ['야간에도 호흡 곤란 지속', '급이량 20% 이상 감소', '비육돈 폐사 발생', '분만사 사산 증가'],
    actions: {
      immediate: ['비상 발전기 가동 (정전 대비)', '이동식 팬 추가 배치', '물 분무 시스템 24시간 가동', '폐사 개체 즉시 반출'],
      shortTerm: ['비육돈사 밀도 20% 감소', '분만사 개별 쿨링 패드 설치', '야간 급이 전환 (100%)', '아스피린 음수 투여 (해열)'],
      preventive: ['축사 지붕 단열 보강 공사', '환기 시스템 용량 증설 계획', '폭염 보험 가입 검토'],
    },
    outcome: '비육돈 90두 폐사, 사산 12두. 밀도 감소 후 3일 내 급이 회복.',
    lessonsLearned: '야간 최저기온 25°C 이상(열대야) 시 환기만으로 불충분. 쿨링 필수.',
    responseTimeHours: 1, effectiveness: 0.68,
  },
  // ========== 12. 저온 스트레스 강원 횡성 ==========
  {
    id: 'CASE-COLD-2024-001', category: 'environment', disease: null,
    title: '2024년 강원 횡성 한파 저온 스트레스', region: '강원', date: '2024-01-08',
    features: { feedingChangeRate: -10.0, anomalyDays: 1, riskState: 'K2', severityScore: 0.38, temperature: -15.0, humidity: 35, season: 'winter', headCount: 1200, mortalityRate: 0.8 },
    symptoms: ['자돈 위축', '급이량 소폭 감소', '음수 배관 동결', '자돈사 온도 12°C 이하'],
    actions: {
      immediate: ['자돈사 보온등 추가 (250W→500W)', '보온판 설치', '동결 배관 해동 작업', '최소 환기 모드 전환'],
      shortTerm: ['돈사 틈새 밀봉 작업', '보온 커튼 설치', '따뜻한 음수 공급 (15°C 이상)', '에너지 사료 급이 비율 증가'],
      preventive: ['동절기 배관 보온재 설치', '비상 난방 장치 확보', '한파 특보 시 사전 대응 매뉴얼'],
    },
    outcome: '자돈 10두 폐사 (압사+저체온). 보온 조치 후 24시간 내 안정.',
    lessonsLearned: '자돈사 바닥 온도 28°C 유지가 핵심. 보온등만으로 불충분.',
    responseTimeHours: 3, effectiveness: 0.80,
  },
  // ========== 13. 사료 품질 경북 상주 ==========
  {
    id: 'CASE-FEED-2025-001', category: 'feed', disease: null,
    title: '2025년 경북 상주 사료 곰팡이독소 문제', region: '경북', date: '2025-03-05',
    features: { feedingChangeRate: -18.0, anomalyDays: 2, riskState: 'K2', severityScore: 0.42, temperature: 12.0, humidity: 55, season: 'spring', headCount: 1500, mortalityRate: 0.0 },
    symptoms: ['급이량 감소', '사료 잔량 증가', '환경 정상', '임상 증상 없음'],
    actions: {
      immediate: ['사료 샘플 채취 및 곰팡이독소 검사 의뢰', '사료 로트 번호 확인', '해당 로트 급이 중단'],
      shortTerm: ['대체 사료 긴급 수배', '급이기 세척 및 잔여 사료 제거', '독소흡착제 첨가 급이'],
      preventive: ['사료 입고 시 수분 함량 검사', '사료빈 내부 결로 방지 환기', '비상 사료 3일분 상시 확보'],
    },
    outcome: '아플라톡신 B1 기준치 2배 검출. 사료 교체 후 2일 내 정상 회복.',
    lessonsLearned: '장마/환절기 사료 저장 관리 중요. 수분 14% 이하 유지.',
    responseTimeHours: 8, effectiveness: 0.90,
  },
  // ========== 14. 사료 교체 충남 아산 ==========
  {
    id: 'CASE-FEED-2024-001', category: 'feed', disease: null,
    title: '2024년 충남 아산 사료 교체 적응 실패', region: '충남', date: '2024-06-20',
    features: { feedingChangeRate: -14.0, anomalyDays: 4, riskState: 'K2', severityScore: 0.40, temperature: 26.0, humidity: 68, season: 'summer', headCount: 2000, mortalityRate: 0.0 },
    symptoms: ['사료 교체 후 급이 거부', '사료 잔량 급증', '분변 변화 (묽어짐)', '체중 증가율 둔화'],
    actions: {
      immediate: ['기존 사료와 신규 사료 7:3 혼합 급이', '급이기 높이 재조정'],
      shortTerm: ['5일간 점진적 비율 변경 (7:3→5:5→3:7→0:10)', '사료 기호성 개선제 첨가', '급이량 모니터링 강화'],
      preventive: ['사료 교체 시 최소 7일 적응 기간 확보', '기호성 사전 테스트 (소량 시험 급이)'],
    },
    outcome: '7일간 점진적 교체 후 정상 급이 회복. 체중 손실 평균 0.5kg/두.',
    lessonsLearned: '사료 급변 교체 금지. 최소 7일 이상 단계적 전환.',
    responseTimeHours: 24, effectiveness: 0.85,
  },
  // ========== 15. 환기 고장 전남 나주 ==========
  {
    id: 'CASE-VENT-2025-001', category: 'environment', disease: null,
    title: '2025년 전남 나주 환기팬 고장 사고', region: '전남', date: '2025-06-15',
    features: { feedingChangeRate: -28.0, anomalyDays: 1, riskState: 'K3', severityScore: 0.75, temperature: 38.0, humidity: 90, season: 'summer', headCount: 3500, mortalityRate: 2.5 },
    symptoms: ['축사 내 온도 급상승 (30→38°C, 2시간)', '암모니아 50ppm 초과', '돼지 개구호흡', '급이 완전 중단'],
    actions: {
      immediate: ['비상 발전기 가동', '측면 커튼 전개 (자연환기)', '이동식 대형 팬 긴급 배치', '물 살포 냉각'],
      shortTerm: ['환기팬 모터 교체', '전기 배선 점검', '백업 환기 시스템 설치', '폐사 개체 처리'],
      preventive: ['환기팬 예방 정비 월1회', '모터 온도 센서 설치', '정전 자동 감지 알림 시스템', '비상 발전기 월1회 시운전'],
    },
    outcome: '환기팬 3대 중 2대 동시 고장. 폐사 88두. 4시간 내 응급 복구.',
    lessonsLearned: '환기 시스템 이중화 필수. 팬 모터 수명 관리(30,000시간) 중요.',
    responseTimeHours: 1, effectiveness: 0.60,
  },
  // ========== 16. 음수 문제 경기 안성 ==========
  {
    id: 'CASE-WATER-2024-001', category: 'feed', disease: null,
    title: '2024년 경기 안성 음수 수질 오염', region: '경기', date: '2024-09-15',
    features: { feedingChangeRate: -15.0, anomalyDays: 3, riskState: 'K2', severityScore: 0.50, temperature: 23.0, humidity: 62, season: 'fall', headCount: 1800, mortalityRate: 0.2 },
    symptoms: ['음수량 급감', '급이량 동반 감소', '설사 증가', '음수기 주변 기피 행동'],
    actions: {
      immediate: ['음수 수질 검사 (pH, 대장균, 중금속)', '비상 음수 공급 (탱크)', '음수 배관 세척'],
      shortTerm: ['정수 필터 교체', '저수조 청소 및 소독', '음수 소독기(UV) 설치 검토'],
      preventive: ['음수 수질 검사 월1회', '저수조 청소 분기1회', '음수 온도 관리 (여름 25°C 이하)'],
    },
    outcome: '대장균 기준치 10배 초과 검출. 배관 세척+소독 후 2일 내 정상화.',
    lessonsLearned: '음수 문제는 급이 감소로 나타난다. 급이 이상 시 음수도 함께 점검.',
    responseTimeHours: 6, effectiveness: 0.82,
  },
  // ========== 17. 출하 최적화 성공 ==========
  {
    id: 'CASE-SHIP-2026-001', category: 'management', disease: null,
    title: '2026년 충남 홍성 출하 최적화 성공', region: '충남', date: '2026-01-15',
    features: { feedingChangeRate: 1.5, anomalyDays: 0, riskState: 'K1', severityScore: 0.12, temperature: 18.0, humidity: 60, season: 'winter', headCount: 1200, mortalityRate: 0.1 },
    symptoms: [],
    actions: {
      immediate: ['출하 대상 개체별 체중 측정', '도축장 출하 예약', '운송 차량 수배'],
      shortTerm: ['FCR 모니터링 강화', '출하 전 12시간 절식', '도매시장 가격 동향 확인'],
      preventive: ['잔여 돈군 출하 일정 수립', '출하 후 돈사 세척/소독 계획'],
    },
    outcome: '평균 출하 체중 115.2kg, 1등급 비율 85%, 두당 순이익 9.2만원.',
    lessonsLearned: 'FCR 3.0 이하 유지 시 수익률 극대화.',
    responseTimeHours: 24, effectiveness: 0.95,
  },
  // ========== 18. 출하 지연 손실 ==========
  {
    id: 'CASE-SHIP-2025-001', category: 'management', disease: null,
    title: '2025년 경기 용인 출하 시기 지연 손실', region: '경기', date: '2025-10-20',
    features: { feedingChangeRate: 3.0, anomalyDays: 0, riskState: 'K1', severityScore: 0.15, temperature: 15.0, humidity: 55, season: 'fall', headCount: 2000, mortalityRate: 0.05 },
    symptoms: ['FCR 3.5 초과', '체중 120kg 초과 과체중', '사료비 일일 증가'],
    actions: {
      immediate: ['즉시 출하 일정 확정', '도축장 추가 예약 확보'],
      shortTerm: ['과체중 개체 우선 출하', '사료 급이량 5% 감량', '분할 출하 (1차 60%, 2차 40%)'],
      preventive: ['체중 도달 기준 출하 자동 알림 설정', '주간 FCR 모니터링 의무화', '도축장 예약 2주 전 선행'],
    },
    outcome: '출하 2주 지연으로 두당 사료비 1.8만원 추가 발생. 총 3,600만원 손실.',
    lessonsLearned: '목표 체중 도달 후 출하 지연은 일일 1,500원/두 손실 발생.',
    responseTimeHours: 48, effectiveness: 0.55,
  },
  // ========== 19. 성장 성적 저하 ==========
  {
    id: 'CASE-GROWTH-2025-001', category: 'management', disease: null,
    title: '2025년 전북 익산 비육돈 성장 정체', region: '전북', date: '2025-05-10',
    features: { feedingChangeRate: -5.0, anomalyDays: 10, riskState: 'K2', severityScore: 0.35, temperature: 22.0, humidity: 65, season: 'spring', headCount: 2500, mortalityRate: 0.2 },
    symptoms: ['ADG 0.6kg/일 이하 (목표 0.85)', 'FCR 3.4 (목표 3.0)', '급이량 서서히 감소', '균일도 저하'],
    actions: {
      immediate: ['사료 영양소 분석 의뢰', '음수 수질 검사', '돈사별 사육 밀도 확인'],
      shortTerm: ['사료 배합비 재조정 (에너지 3,350kcal→3,400kcal)', '사육 밀도 0.8㎡/두→1.0㎡/두 조정', 'PRRS/마이코플라즈마 혈청 검사'],
      preventive: ['월별 성장 성적 분석 시스템 구축', '돈군별 체중 측정 격주 실시', '사료 영양소 분기별 검증'],
    },
    outcome: '밀도 조정+사료 변경 3주 후 ADG 0.82kg/일 회복. FCR 3.1로 개선.',
    lessonsLearned: '사육 밀도가 성장 성적에 가장 큰 영향. 0.2㎡/두 차이가 ADG 0.15kg 차이.',
    responseTimeHours: 72, effectiveness: 0.80,
  },
  // ========== 20. 차단방역 위반 ==========
  {
    id: 'CASE-BIO-2024-001', category: 'biosecurity', disease: null,
    title: '2024년 충남 예산 차단방역 위반 사례', region: '충남', date: '2024-04-22',
    features: { feedingChangeRate: -8.0, anomalyDays: 1, riskState: 'K2', severityScore: 0.40, temperature: 18.0, humidity: 60, season: 'spring', headCount: 3000, mortalityRate: 0.0 },
    symptoms: ['외부 차량 무단 진입 감지', '소독 미이행 확인', '급이 소폭 변동'],
    actions: {
      immediate: ['농장 전체 긴급 소독', '해당 차량 진입 경로 역추적', '접촉 구역 집중 소독'],
      shortTerm: ['CCTV 출입 기록 전수 조사', '출입 차량 소독 시스템 점검', '종사자 방역 교육 재실시'],
      preventive: ['차량 자동 인식 + 소독 연동 시스템 도입', '출입 기록 전자화 의무', '방역 위반 시 페널티 제도 수립'],
    },
    outcome: '추가 발병 없이 종결. 방역 시스템 자동화 도입 계기.',
    lessonsLearned: '사람이 가장 큰 방역 위험 요소. 자동화 시스템으로 인적 오류 최소화.',
    responseTimeHours: 4, effectiveness: 0.85,
  },
];

module.exports = { CASE_DATABASE };
