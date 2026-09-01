'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { calcVrb, formatPct, formatWon, gradeRate } from '@/lib/vrb/calc';
import { GRADE_LIST, suggestSalesExpenseRate } from '@/lib/vrb/rates';
import {
  EMPTY_INPUT,
  SAMPLE_INPUT,
  newExpenseRow,
  newLaborRow,
  newPurchaseRow,
} from '@/lib/vrb/defaults';
import type {
  ExpenseInput,
  LaborInput,
  PurchaseInput,
  VrbInput,
} from '@/lib/vrb/types';

type ListKey = 'labor' | 'goods' | 'services' | 'expenses';

/* ────────────────────────────────────────────────────────────
 * 작은 UI 프리미티브
 * ──────────────────────────────────────────────────────────── */

function Section({
  title,
  desc,
  right,
  children,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-800 bg-[#0d1420] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-gray-500">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function NumberInput({
  value,
  onChange,
  className = '',
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={`w-full rounded-md border border-gray-700 bg-[#0a0f1a] px-2 py-1.5 text-right text-sm text-gray-100 outline-none focus:border-blue-500 ${className}`}
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-gray-700 bg-[#0a0f1a] px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500"
    />
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-blue-700/60 bg-blue-900/20 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-900/40"
    >
      + {label}
    </button>
  );
}

function DelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded px-1.5 text-gray-500 hover:text-red-400"
      title="삭제"
    >
      ✕
    </button>
  );
}

/* ────────────────────────────────────────────────────────────
 * 메인 페이지
 * ──────────────────────────────────────────────────────────── */

export default function VrbPage() {
  const [input, setInput] = useState<VrbInput>(SAMPLE_INPUT);
  const result = useMemo(() => calcVrb(input), [input]);

  const patch = (p: Partial<VrbInput>) => setInput((s) => ({ ...s, ...p }));

  // 목록 편집 헬퍼
  function updateRow<T extends { id: string }>(
    key: ListKey,
    id: string,
    p: Partial<T>,
  ) {
    setInput((s) => {
      const list = s[key] as unknown as T[];
      const next = list.map((r) => (r.id === id ? { ...r, ...p } : r));
      return { ...s, [key]: next } as VrbInput;
    });
  }
  function removeRow(key: ListKey, id: string) {
    setInput((s) => {
      const list = s[key] as Array<{ id: string }>;
      return { ...s, [key]: list.filter((r) => r.id !== id) } as VrbInput;
    });
  }

  const suggested = suggestSalesExpenseRate(result.profitMargin);
  const profitPositive = result.profit.amount >= 0;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      {/* 헤더 */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
              VRB
            </span>
            <h1 className="text-lg font-bold text-gray-100">
              사업참여 VRB 손익 자동산출
            </h1>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            기초금액·인력·매입·경비 등 기본값만 입력하면 매출이익·직접경비·프로젝트손익이
            실시간 자동 계산됩니다. (금액 단위: 원, VAT 별도 기준)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInput(SAMPLE_INPUT)}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            샘플 불러오기
          </button>
          <button
            onClick={() => setInput({ ...EMPTY_INPUT, labor: [], goods: [], services: [], expenses: [] })}
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            새로 작성
          </button>
          <Link
            href="/"
            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            홈
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_460px]">
        {/* ── 왼쪽: 입력 ─────────────────────────────── */}
        <div className="space-y-4">
          {/* 사업 기본정보 */}
          <Section title="① 사업 기본정보">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="col-span-full text-xs text-gray-400">
                사업명
                <TextInput
                  value={input.projectName}
                  onChange={(v) => patch({ projectName: v })}
                  placeholder="사업명"
                />
              </label>
              <label className="text-xs text-gray-400">
                발주기관
                <TextInput
                  value={input.client}
                  onChange={(v) => patch({ client: v })}
                  placeholder="발주기관"
                />
              </label>
              <label className="text-xs text-gray-400">
                기초금액 (VAT 포함)
                <NumberInput
                  value={input.baseAmount}
                  onChange={(v) => patch({ baseAmount: v })}
                  step={1_000_000}
                />
              </label>
              <label className="text-xs text-gray-400">
                투찰율 (1.0 = 100%)
                <NumberInput
                  value={input.bidRatio}
                  onChange={(v) => patch({ bidRatio: v })}
                  step={0.01}
                />
              </label>
              <label className="text-xs text-gray-400">
                영업비율 ({(input.salesExpenseRate * 100).toFixed(1)}%)
                <NumberInput
                  value={input.salesExpenseRate}
                  onChange={(v) => patch({ salesExpenseRate: v })}
                  step={0.005}
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              입찰금액(VAT포함) = 기초금액 × 투찰율 ={' '}
              <span className="text-gray-300">{formatWon(result.bidAmount)}</span>
              {' · '}권장 영업비율(손익 {formatPct(result.profitMargin)} 기준):{' '}
              <span className="text-gray-300">{(suggested * 100).toFixed(0)}%</span>
            </p>
          </Section>

          {/* 내부인건비 */}
          <Section
            title="② 내부인건비 (직접경비)"
            desc="직급별 단가 × 총 M/M 자동 산정"
            right={
              <AddButton
                label="인력 추가"
                onClick={() =>
                  patch({ labor: [...input.labor, newLaborRow()] })
                }
              />
            }
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="pb-1 text-left font-normal">업무구분</th>
                  <th className="pb-1 text-left font-normal">직급</th>
                  <th className="pb-1 text-right font-normal">M/M</th>
                  <th className="pb-1 text-right font-normal">금액</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {input.labor.map((p: LaborInput) => (
                  <tr key={p.id}>
                    <td className="py-0.5 pr-1">
                      <TextInput
                        value={p.role}
                        onChange={(v) => updateRow<LaborInput>('labor', p.id, { role: v })}
                        placeholder="업무"
                      />
                    </td>
                    <td className="px-1">
                      <select
                        value={p.grade}
                        onChange={(e) =>
                          updateRow<LaborInput>('labor', p.id, { grade: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-700 bg-[#0a0f1a] px-1 py-1.5 text-xs text-gray-100 outline-none focus:border-blue-500"
                      >
                        {GRADE_LIST.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-16 px-1">
                      <NumberInput
                        value={p.mm}
                        step={0.5}
                        onChange={(v) => updateRow<LaborInput>('labor', p.id, { mm: v })}
                      />
                    </td>
                    <td className="w-28 whitespace-nowrap px-1 text-right text-gray-300">
                      {formatWon(gradeAmount(p))}
                    </td>
                    <td>
                      <DelButton onClick={() => removeRow('labor', p.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <RowFooter
              label={`내부인건비 소계 (총 ${sumMM(input.labor)} M/M)`}
              value={formatWon(result.laborCost)}
            />
          </Section>

          {/* 매입 - 물품 */}
          <PurchaseSection
            title="③ 매입 — 물품"
            desc="상용SW·라이선스 등 (실행단가 VAT 별도)"
            rows={input.goods}
            subtotal={result.goodsSubtotal}
            onAdd={() => patch({ goods: [...input.goods, newPurchaseRow()] })}
            onUpdate={(id, p) => updateRow<PurchaseInput>('goods', id, p)}
            onRemove={(id) => removeRow('goods', id)}
          />

          {/* 매입 - 용역 */}
          <PurchaseSection
            title="④ 매입 — 용역"
            desc="협력사 용역 (소계는 만원 단위 절사)"
            rows={input.services}
            subtotal={result.servicesSubtotal}
            onAdd={() => patch({ services: [...input.services, newPurchaseRow()] })}
            onUpdate={(id, p) => updateRow<PurchaseInput>('services', id, p)}
            onRemove={(id) => removeRow('services', id)}
          />

          {/* 프로젝트 경비 */}
          <Section
            title="⑤ 프로젝트 경비 (직접경비)"
            desc="인건비 외 직접경비 (수량 × 단가)"
            right={
              <AddButton
                label="경비 추가"
                onClick={() =>
                  patch({ expenses: [...input.expenses, newExpenseRow()] })
                }
              />
            }
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="pb-1 text-left font-normal">항목</th>
                  <th className="pb-1 text-right font-normal">수량</th>
                  <th className="pb-1 text-right font-normal">단가</th>
                  <th className="pb-1 text-right font-normal">금액</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {input.expenses.map((e: ExpenseInput) => (
                  <tr key={e.id}>
                    <td className="py-0.5 pr-1">
                      <TextInput
                        value={e.name}
                        onChange={(v) => updateRow<ExpenseInput>('expenses', e.id, { name: v })}
                        placeholder="항목"
                      />
                    </td>
                    <td className="w-16 px-1">
                      <NumberInput
                        value={e.qty}
                        onChange={(v) => updateRow<ExpenseInput>('expenses', e.id, { qty: v })}
                      />
                    </td>
                    <td className="w-28 px-1">
                      <NumberInput
                        value={e.unitPrice}
                        step={100_000}
                        onChange={(v) => updateRow<ExpenseInput>('expenses', e.id, { unitPrice: v })}
                      />
                    </td>
                    <td className="w-28 whitespace-nowrap px-1 text-right text-gray-300">
                      {formatWon(e.qty * e.unitPrice)}
                    </td>
                    <td>
                      <DelButton onClick={() => removeRow('expenses', e.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <RowFooter
              label="프로젝트 경비 소계"
              value={formatWon(result.expenseCost)}
            />
          </Section>
        </div>

        {/* ── 오른쪽: 결과 (sticky) ──────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {/* 핵심 손익 카드 */}
          <div
            className={`rounded-xl border p-5 ${
              profitPositive
                ? 'border-emerald-700/50 bg-emerald-950/20'
                : 'border-red-700/50 bg-red-950/20'
            }`}
          >
            <p className="text-xs text-gray-400">프로젝트 손익 (VAT 별도)</p>
            <p
              className={`mt-1 text-3xl font-bold ${
                profitPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {formatWon(result.profit.amount)}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              손익률{' '}
              <span
                className={profitPositive ? 'text-emerald-400' : 'text-red-400'}
              >
                {formatPct(result.profitMargin)}
              </span>
            </p>
          </div>

          {/* 손익산정표 */}
          <Section title="프로젝트 손익산정표" desc="매출액 대비 비율">
            <table className="w-full text-sm">
              <tbody>
                <PLRow label="매출액" line={{ amount: result.revenue, ratio: 1 }} strong />
                <PLRow label="  매입액 (재료비)" line={result.purchase} />
                <PLRow label="매출이익" line={result.grossProfit} strong accent />
                <PLRow label="  직접경비" line={result.directCost} />
                <PLRow label="    ├ 내부인건비" line={{ amount: result.laborCost, ratio: result.laborCost / (result.revenue || 1) }} muted />
                <PLRow label="    └ 프로젝트경비" line={{ amount: result.expenseCost, ratio: result.expenseCost / (result.revenue || 1) }} muted />
                <PLRow label="  영업비" line={result.salesExpense} />
                <PLRow label="  예비비" line={result.reserve} />
                <tr className="border-t border-gray-700">
                  <td className="py-2 font-bold text-gray-100">프로젝트 손익</td>
                  <td className={`py-2 text-right font-bold ${profitPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatWon(result.profit.amount)}
                  </td>
                  <td className="py-2 text-right text-xs text-gray-400">
                    {formatPct(result.profit.ratio)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* 매입 구성 */}
          <Section title="매입 구성" desc="재료비 상세">
            <table className="w-full text-sm">
              <tbody>
                <PLRow label="물품 소계" line={{ amount: result.goodsSubtotal, ratio: result.goodsSubtotal / (result.revenue || 1) }} />
                <PLRow label="용역 소계" line={{ amount: result.servicesSubtotal, ratio: result.servicesSubtotal / (result.revenue || 1) }} />
                <PLRow label="전체구축비 (재료비+직접경비)" line={result.totalBuildCost} strong />
              </tbody>
            </table>
          </Section>

          {/* 직급별 인건비 */}
          {result.laborByGrade.length > 0 && (
            <Section title="직급별 내부인건비" desc="단가 × M/M 집계">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="pb-1 text-left font-normal">직급</th>
                    <th className="pb-1 text-right font-normal">M/M</th>
                    <th className="pb-1 text-right font-normal">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {result.laborByGrade.map((g) => (
                    <tr key={g.grade}>
                      <td className="py-0.5 text-gray-300">{g.grade}</td>
                      <td className="text-right text-gray-400">{g.mm}</td>
                      <td className="text-right text-gray-300">{formatWon(g.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </div>
      </div>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────
 * 보조 컴포넌트 / 헬퍼
 * ──────────────────────────────────────────────────────────── */

function gradeAmount(p: LaborInput): number {
  return gradeRate(p.grade) * p.mm;
}
function sumMM(rows: LaborInput[]): number {
  return rows.reduce((s, r) => s + r.mm, 0);
}

function RowFooter({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-gray-800 pt-2 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold text-gray-100">{value}</span>
    </div>
  );
}

function PLRow({
  label,
  line,
  strong,
  accent,
  muted,
}: {
  label: string;
  line: { amount: number; ratio: number };
  strong?: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className={strong ? 'border-t border-gray-800' : ''}>
      <td
        className={`whitespace-pre py-1.5 ${
          strong ? 'font-semibold text-gray-100' : muted ? 'text-gray-500' : 'text-gray-300'
        }`}
      >
        {label}
      </td>
      <td
        className={`py-1.5 text-right ${
          accent ? 'font-semibold text-blue-300' : strong ? 'font-semibold text-gray-100' : muted ? 'text-gray-500' : 'text-gray-300'
        }`}
      >
        {formatWon(line.amount)}
      </td>
      <td className="py-1.5 text-right text-xs text-gray-500">
        {formatPct(line.ratio)}
      </td>
    </tr>
  );
}

function PurchaseSection({
  title,
  desc,
  rows,
  subtotal,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  desc: string;
  rows: PurchaseInput[];
  subtotal: number;
  onAdd: () => void;
  onUpdate: (id: string, p: Partial<PurchaseInput>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Section
      title={title}
      desc={desc}
      right={<AddButton label="항목 추가" onClick={onAdd} />}
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="pb-1 text-left font-normal">품목</th>
            <th className="pb-1 text-right font-normal">수량</th>
            <th className="pb-1 text-right font-normal">실행단가</th>
            <th className="pb-1 text-right font-normal">금액</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-0.5 pr-1">
                <TextInput
                  value={r.name}
                  onChange={(v) => onUpdate(r.id, { name: v })}
                  placeholder="품목명"
                />
              </td>
              <td className="w-14 px-1">
                <NumberInput value={r.qty} onChange={(v) => onUpdate(r.id, { qty: v })} />
              </td>
              <td className="w-28 px-1">
                <NumberInput
                  value={r.unitPrice}
                  step={1_000_000}
                  onChange={(v) => onUpdate(r.id, { unitPrice: v })}
                />
              </td>
              <td className="w-28 whitespace-nowrap px-1 text-right text-gray-300">
                {formatWon(r.qty * r.unitPrice)}
              </td>
              <td>
                <DelButton onClick={() => onRemove(r.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <RowFooter label="소계" value={formatWon(subtotal)} />
    </Section>
  );
}
