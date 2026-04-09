'use client';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  description?: string;
  trend?: 'up' | 'down' | 'stable';
  alert?: boolean;
}

export default function MetricCard({ title, value, unit, description, trend, alert }: MetricCardProps) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400' : 'text-gray-400';

  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        alert
          ? 'border-red-500/50 bg-red-950/20 shadow-lg shadow-red-500/10'
          : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        {title}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${alert ? 'text-red-400' : 'text-white'}`}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span className="text-sm text-gray-400">{unit}</span>
        {trend && (
          <span className={`ml-2 text-sm font-medium ${trendColor}`}>
            {trendIcon}
          </span>
        )}
      </div>
      {description && (
        <div className="mt-1 text-xs text-gray-500">{description}</div>
      )}
    </div>
  );
}
