import { GRADE_RATES, INDIRECT_COST_RATE, VAT_RATE } from './rates';
import type { VrbInput, VrbResult } from './types';

/** 엑셀 ROUNDDOWN(x, -4): 만원 단위 절사 (용역 소계에 적용) */
export function roundDownTo10k(x: number): number {
  return Math.floor(x / 10_000) * 10_000;
}

/** 직급 → 월단가 (단가표에 없으면 0) */
export function gradeRate(grade: string): number {
  return GRADE_RATES[grade] ?? 0;
}

/** 0으로 나누기 방지 비율 계산 */
function ratio(amount: number, base: number): number {
  return base === 0 ? 0 : amount / base;
}

/**
 * VRB 손익 자동산출 엔진.
 * 엑셀 "2. 프로젝트 손익산정표" 의 수식 체인을 그대로 구현합니다.
 */
export function calcVrb(input: VrbInput): VrbResult {
  // ── 매출액 ─────────────────────────────────────────────
  // 입찰금액(VAT포함) = 기초금액 × 투찰율
  // 매출액(VAT별도)   = 입찰금액 / 1.1
  const bidAmount = input.baseAmount * input.bidRatio;
  const revenue = bidAmount / (1 + VAT_RATE);

  // ── 매입액 (재료비) ────────────────────────────────────
  // 물품 소계 = Σ(수량 × 실행단가)
  const goodsSubtotal = input.goods.reduce(
    (s, g) => s + g.qty * g.unitPrice,
    0,
  );
  // 용역 소계 = ROUNDDOWN(Σ(수량 × 실행단가), 만원)
  const servicesSubtotal = roundDownTo10k(
    input.services.reduce((s, v) => s + v.qty * v.unitPrice, 0),
  );
  const purchaseAmount = goodsSubtotal + servicesSubtotal;

  // ── 내부인건비 (직급별 집계) ───────────────────────────
  const gradeMap = new Map<string, { mm: number; amount: number }>();
  for (const p of input.labor) {
    const amount = gradeRate(p.grade) * p.mm;
    const cur = gradeMap.get(p.grade) ?? { mm: 0, amount: 0 };
    cur.mm += p.mm;
    cur.amount += amount;
    gradeMap.set(p.grade, cur);
  }
  const laborByGrade = Array.from(gradeMap.entries()).map(
    ([grade, v]) => ({ grade, mm: v.mm, amount: v.amount }),
  );
  const laborCost = laborByGrade.reduce((s, g) => s + g.amount, 0);

  // ── 프로젝트 경비 ──────────────────────────────────────
  const expenseCost = input.expenses.reduce(
    (s, e) => s + e.qty * e.unitPrice,
    0,
  );

  // 직접경비 = 내부인건비 + 프로젝트경비
  const directCostAmount = laborCost + expenseCost;

  // ── 손익 계산 ──────────────────────────────────────────
  const grossProfitAmount = revenue - purchaseAmount; // 매출이익
  const totalBuildCostAmount = purchaseAmount + directCostAmount; // 전체구축비

  // 영업비 = 매출액 × 영업비율
  const salesExpenseAmount = revenue * input.salesExpenseRate;
  // 예비비 = 매출액 × (영업비율 + 간접비율 1%)
  const reserveAmount = revenue * (input.salesExpenseRate + INDIRECT_COST_RATE);

  // 프로젝트손익 = 매출이익 - (직접경비 + 영업비 + 예비비)
  const profitAmount =
    grossProfitAmount - (directCostAmount + salesExpenseAmount + reserveAmount);

  const line = (amount: number) => ({ amount, ratio: ratio(amount, revenue) });

  return {
    bidAmount,
    revenue,
    purchase: line(purchaseAmount),
    goodsSubtotal,
    servicesSubtotal,
    grossProfit: line(grossProfitAmount),
    directCost: line(directCostAmount),
    laborCost,
    expenseCost,
    laborByGrade,
    totalBuildCost: line(totalBuildCostAmount),
    salesExpense: line(salesExpenseAmount),
    reserve: line(reserveAmount),
    profit: line(profitAmount),
    profitMargin: ratio(profitAmount, revenue),
  };
}

/** 원화 포맷 (예: 3,636,363,636 원) */
export function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')} 원`;
}

/** 억 단위 요약 (예: 36.4억) */
export function formatEok(n: number): string {
  return `${(n / 100_000_000).toFixed(1)}억`;
}

/** 비율 포맷 (예: 41.97%) */
export function formatPct(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}
