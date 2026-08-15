/** VRB 자동산출 입력/출력 타입 정의 */

/** 내부인건비 투입 인력 1명 */
export interface LaborInput {
  id: string;
  /** 업무구분 (예: PL / 인프라플랫폼 총괄) */
  role: string;
  /** 직급 (GRADE_RATES 의 key) */
  grade: string;
  /** 총 투입 M/M (Man-Month) */
  mm: number;
}

/** 매입 항목 (물품/용역 공통) 1건 */
export interface PurchaseInput {
  id: string;
  /** 품목명 */
  name: string;
  /** 소요수량 */
  qty: number;
  /** 실행단가 (VAT 별도) */
  unitPrice: number;
}

/** 프로젝트 경비 (직접경비 中 인건비 외) 1건 */
export interface ExpenseInput {
  id: string;
  /** 항목명 */
  name: string;
  /** 수량 */
  qty: number;
  /** 단가 (VAT 별도) */
  unitPrice: number;
}

/** VRB 기본 입력값 */
export interface VrbInput {
  /** 사업명 */
  projectName: string;
  /** 발주기관 */
  client: string;
  /** 기초금액 (VAT 포함, 원) */
  baseAmount: number;
  /** 투찰율 (예: 1.0 = 100%) */
  bidRatio: number;
  /** 내부인건비 인력 목록 */
  labor: LaborInput[];
  /** 매입 - 물품 목록 */
  goods: PurchaseInput[];
  /** 매입 - 용역 목록 */
  services: PurchaseInput[];
  /** 프로젝트 경비 목록 */
  expenses: ExpenseInput[];
  /** 영업비율 (예: 0.02 = 2%) */
  salesExpenseRate: number;
}

/** 산출 결과 한 줄 (금액 + 매출액 대비 비율) */
export interface ResultLine {
  amount: number;
  ratio: number;
}

/** VRB 자동산출 결과 */
export interface VrbResult {
  /** 입찰금액 (VAT 포함) */
  bidAmount: number;
  /** 매출액 (VAT 별도) */
  revenue: number;
  /** 매입액 = 재료비 (물품 + 용역) */
  purchase: ResultLine;
  goodsSubtotal: number;
  servicesSubtotal: number;
  /** 매출이익 = 매출액 - 매입액 */
  grossProfit: ResultLine;
  /** 직접경비 = 내부인건비 + 프로젝트경비 */
  directCost: ResultLine;
  laborCost: number;
  expenseCost: number;
  /** 직급별 내부인건비 집계 */
  laborByGrade: { grade: string; mm: number; amount: number }[];
  /** 전체구축비 = 재료비 + 직접경비 */
  totalBuildCost: ResultLine;
  /** 영업비 */
  salesExpense: ResultLine;
  /** 예비비 */
  reserve: ResultLine;
  /** 프로젝트 손익 */
  profit: ResultLine;
  /** 손익률 (= profit.ratio) */
  profitMargin: number;
}
