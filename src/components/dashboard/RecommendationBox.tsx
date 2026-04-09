'use client';

interface RecommendationBoxProps {
  text: string;
  riskLevel?: string;
}

export default function RecommendationBox({ text, riskLevel }: RecommendationBoxProps) {
  const borderColor = riskLevel === 'emergency'
    ? 'border-red-500'
    : riskLevel === 'danger'
    ? 'border-orange-500'
    : riskLevel === 'caution'
    ? 'border-yellow-500'
    : 'border-gray-600';

  return (
    <div className={`rounded-lg border-l-4 ${borderColor} bg-gray-800/50 p-4`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-300">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        AI 조치 권고안
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
        {text || '시나리오를 실행하면 AI 에이전트의 분석 결과가 여기에 표시됩니다.'}
      </div>
    </div>
  );
}
