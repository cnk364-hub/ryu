/**
 * 인력등급단가표 (VRB 'C' 참조시트 J/K 컬럼 기준)
 *
 * 내부인건비 산정 시 직급별 월단가(1 M/M 기준)로 사용됩니다.
 * 값은 만사시스템 VRB 표준 단가표를 그대로 옮긴 것으로, 필요 시 수정 가능합니다.
 */
export const GRADE_RATES: Record<string, number> = {
  임원: 12_000_000,
  부장: 10_000_000,
  차장: 8_500_000,
  과장: 7_000_000,
  대리: 6_000_000,
  사원: 5_000_000,
  '특급기술자(상주)': 11_000_000,
  '고급기술자(상주)': 10_000_000,
  '중급기술자(상주)': 8_000_000,
  '초급기술자(상주)': 6_000_000,
  '특급기술자(비상주)': 11_000_000,
  '고급기술자(비상주)': 10_000_000,
  '중급기술자(비상주)': 8_000_000,
  '초급기술자(비상주)': 6_000_000,
};

/** 직급 선택 목록 (표시 순서 유지) */
export const GRADE_LIST = Object.keys(GRADE_RATES);

/** 부가세율 (매출액 = 부가세포함금액 / (1 + VAT_RATE)) */
export const VAT_RATE = 0.1;

/**
 * 영업비율 차등 가이드 (손익산정표 K11 주석 기준)
 *  - 12.5% 미만  : 0%
 *  - 12.5% 이상  : 1%
 *  - 20% 이상    : 2%
 *  - 25% 이상    : 3%
 * 예상 손익률을 넣으면 권장 영업비율을 돌려줍니다.
 */
export function suggestSalesExpenseRate(profitMargin: number): number {
  if (profitMargin >= 0.25) return 0.03;
  if (profitMargin >= 0.2) return 0.02;
  if (profitMargin >= 0.125) return 0.01;
  return 0;
}

/** 예비비 = 영업비율 + 간접비율(1%) (손익산정표 J12 기준) */
export const INDIRECT_COST_RATE = 0.01;
