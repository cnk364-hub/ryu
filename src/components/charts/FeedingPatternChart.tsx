'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { FeedingPatternData } from '@/lib/types';

interface FeedingPatternChartProps {
  data: FeedingPatternData[];
  anomalyIndices?: number[];
}

export default function FeedingPatternChart({ data, anomalyIndices = [] }: FeedingPatternChartProps) {
  const chartData = data.map((d, i) => ({
    ...d,
    dateLabel: d.date.slice(5), // MM-DD
    isAnomaly: anomalyIndices.includes(i),
  }));

  const anomalyDates = anomalyIndices
    .filter(i => i < data.length)
    .map(i => data[i].date.slice(5));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="dateLabel"
            stroke="#9CA3AF"
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            stroke="#9CA3AF"
            fontSize={11}
            tickLine={false}
            domain={['auto', 'auto']}
            label={{ value: 'kg', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#9CA3AF' }}
            formatter={(value: number, name: string) => {
              const label = name === 'consumption_kg' ? '실제 급이량' : '정상 기준선';
              return [`${value.toFixed(1)} kg`, label];
            }}
          />
          <Legend
            formatter={(value: string) =>
              value === 'consumption_kg' ? '실제 측정값' : '정상 기준선 (이동평균)'
            }
            wrapperStyle={{ fontSize: '12px' }}
          />
          {anomalyDates.map((date, i) => (
            <ReferenceLine
              key={i}
              x={date}
              stroke="#EF4444"
              strokeDasharray="3 3"
              label={{
                value: '이상 탐지',
                position: 'top',
                fill: '#EF4444',
                fontSize: 10,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="normal_baseline"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey="consumption_kg"
            stroke="#EF4444"
            strokeWidth={2}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, index } = props as { cx: number; cy: number; index: number };
              if (anomalyIndices.includes(index as number)) {
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill="#EF4444"
                    stroke="#FCA5A5"
                    strokeWidth={2}
                  />
                );
              }
              return <circle key={index} cx={cx} cy={cy} r={2} fill="#EF4444" />;
            }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
