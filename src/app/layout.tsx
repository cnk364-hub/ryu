import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '축산 AI 에이전트 데모 - 가축 질병 조기경보 시스템',
  description: 'NIPA AI Agent 융합확산 사업 - 급이패턴 기반 다중 AI 에이전트 협업형 가축 질병 조기경보 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-[#0a0f1a] text-gray-200 antialiased">
        {children}
      </body>
    </html>
  );
}
