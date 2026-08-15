import type { VrbInput } from './types';

let seq = 0;
const uid = () => `row-${seq++}`;

/**
 * 업로드된 VRB 엑셀(국방 지능형 플랫폼 고도화 구축, 만사시스템 20% 분담)의
 * 실제 입력값을 그대로 옮긴 샘플. 프로그램 최초 진입 시 기본 로드됩니다.
 * 이 값으로 산출하면 엑셀과 동일한 결과(프로젝트손익 ≈ 5.88억, 16.16%)가 나옵니다.
 */
export const SAMPLE_INPUT: VrbInput = {
  projectName: '국방 지능형 플랫폼 고도화 구축 (만사시스템 20% 분담 / 인프라플랫폼·보안)',
  client: '국방부 국방통합데이터센터(DIDC)',
  baseAmount: 4_000_000_000,
  bidRatio: 1.0,
  labor: [
    { id: uid(), role: 'PL / 인프라플랫폼 총괄', grade: '임원', mm: 15 },
    { id: uid(), role: 'IaaS/PaaS·CMP 엔지니어', grade: '과장', mm: 15 },
    { id: uid(), role: 'CMP 포털 개발', grade: '대리', mm: 12 },
    { id: uid(), role: '보안 아키텍트(ZT/CNAPP)', grade: '차장', mm: 10.5 },
    { id: uid(), role: 'K-RMF 보안컨설턴트', grade: '부장', mm: 15 },
    { id: uid(), role: 'SW 개발(API/연동)', grade: '사원', mm: 10 },
    { id: uid(), role: '테스트/품질(QA)', grade: '과장', mm: 4 },
  ],
  goods: [
    { id: uid(), name: 'CMP 클라우드 통합관리 플랫폼 상용SW', qty: 1, unitPrice: 400_000_000 },
    { id: uid(), name: 'IaaS/PaaS·컨테이너 가상화 상용SW', qty: 1, unitPrice: 320_000_000 },
    { id: uid(), name: 'CNAPP 클라우드네이티브 보안솔루션', qty: 1, unitPrice: 280_000_000 },
    { id: uid(), name: '제로트러스트 솔루션(ICAM·PDP/SDP·PEP)', qty: 1, unitPrice: 250_000_000 },
    { id: uid(), name: 'VDI 솔루션 라이선스', qty: 1, unitPrice: 150_000_000 },
    { id: uid(), name: '보안 로그수집/SIEM 연동 모듈', qty: 1, unitPrice: 120_000_000 },
  ],
  services: [
    { id: uid(), name: 'CNAPP 도입·정책설정·관제연동', qty: 1, unitPrice: 190_000_000 },
    { id: uid(), name: '제로트러스트 설계·시범적용·성숙도진단', qty: 1, unitPrice: 200_000_000 },
    { id: uid(), name: 'K-RMF 보안컨설팅·인가지원', qty: 1, unitPrice: 110_000_000 },
    { id: uid(), name: 'VDI 구축', qty: 1, unitPrice: 90_000_000 },
  ],
  expenses: [
    { id: uid(), name: '사업관리비(법인카드/보고회/PMO 대응)', qty: 15, unitPrice: 500_000 },
    { id: uid(), name: '제안 인건비(만사 2명 × 2개월)', qty: 4, unitPrice: 7_000_000 },
    { id: uid(), name: '산출물 인쇄/제본', qty: 1, unitPrice: 2_000_000 },
    { id: uid(), name: '개발환경 구축(형상/CI·테스트 도구)', qty: 1, unitPrice: 20_000_000 },
    { id: uid(), name: '차량(렌트)/유류비', qty: 15, unitPrice: 500_000 },
    { id: uid(), name: '사무용품/소모품/통신비', qty: 15, unitPrice: 200_000 },
    { id: uid(), name: '출장/회의/보고회비', qty: 15, unitPrice: 300_000 },
    { id: uid(), name: '보안성 검토/인증 대응(K-RMF 증적)', qty: 1, unitPrice: 10_000_000 },
  ],
  salesExpenseRate: 0.02,
};

/** 빈 입력값 (새 사업 작성 시작용) */
export const EMPTY_INPUT: VrbInput = {
  projectName: '',
  client: '',
  baseAmount: 0,
  bidRatio: 1.0,
  labor: [],
  goods: [],
  services: [],
  expenses: [],
  salesExpenseRate: 0.02,
};

export const newLaborRow = () => ({ id: uid(), role: '', grade: '과장', mm: 0 });
export const newPurchaseRow = () => ({ id: uid(), name: '', qty: 1, unitPrice: 0 });
export const newExpenseRow = () => ({ id: uid(), name: '', qty: 1, unitPrice: 0 });
