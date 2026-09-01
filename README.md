# 가축 질병 조기경보 AI 에이전트 데모 시스템

> NIPA AI Agent 융합확산 사업 - 만사시스템
> "급이패턴 기반 다중 AI 에이전트 협업형 가축 질병 조기경보 및 축사 통합 운영관리 시스템"

## 프로젝트 소개

실제 LiDAR 장비 없이 시뮬레이터로 급이 데이터를 생성하고, Claude API를 활용한 7개 AI 에이전트가 실시간으로 **판단 → 실행 → 관찰 → 수정**하는 Agentic Loop를 시각적으로 보여주는 웹 데모 애플리케이션입니다.

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.local.example .env.local
# .env.local 파일에 ANTHROPIC_API_KEY 설정

# 개발 서버 실행
npm run dev
```

브라우저에서 http://localhost:3000 접속

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 차트 | Recharts |
| AI | Anthropic Claude API (claude-sonnet-4-5) |
| 상태관리 | Zustand |
| 실시간 | Server-Sent Events (SSE) |

## 7개 AI 에이전트

| # | 에이전트 | 역할 | 핵심 기술 |
|---|---------|------|----------|
| 1 | Context Agent (상황인식) | LiDAR 급이 데이터 분석, 상황 파악 | EIF (Extended Isolation Forest) |
| 2 | Risk Trajectory Agent (위험궤적) | 위험 상태 전이 분석, 48시간 예측 | HMM (Hidden Markov Model) |
| 3 | Planning Agent (대응계획) | 유사 사례 기반 최적 대응 계획 수립 | CBR (Case-Based Reasoning) |
| 4 | Execution Agent (조치실행) | 실행 가능한 체크리스트 생성 | Task Decomposition |
| 5 | Monitoring Agent (관찰) | 모니터링 기준, 성공 지표 설정 | KPI Monitoring |
| 6 | Recovery Agent (수정복구) | 조치 효과 평가, 대안 전략 제시 | Feedback Loop |
| 7 | Orchestration Agent (오케스트레이션) | 최종 의사결정 보고서 생성 | Multi-Agent Coordination |

## 데모 시나리오

### 시나리오 1: 질병 조기경보 (ASF 의심)
- 최근 3일간 급이량 35% 감소
- 아프리카돼지열병(ASF) 의심 상황
- 7개 에이전트 순차 실행 → 긴급 격리 조치 권고

### 시나리오 2: 사육환경 이상 대응
- 온도 32도 초과 지속, 습도 85%
- 돼지 열 스트레스 징후 감지
- 환기 시스템 조치 및 모니터링 계획

### 시나리오 3: 최적 출하시기 판단
- 체중 목표 도달 D-7
- FCR(사료 전환율) 3.1 최적 구간
- 출하 시기 및 물류 최적화 분석

## 데모 시연 가이드 (5분)

1. **앱 로드** → 정상 상태 급이패턴 차트 확인 (30일 안정적)
2. **시나리오 탭** → "질병 조기경보" 시나리오 클릭
3. **차트 변화** → 최근 3일 데이터 하락 실시간 표시
4. **에이전트 실행** → 7개 에이전트 순차 실행 로그 확인
5. **Agentic Loop** → 현재 실행 중인 에이전트 시각화
6. **최종 결과** → "ASF 의심 - 즉시 격리 조치 필요" 알림
7. **위험 등급** → 긴급 배지 + 화면 빨강 점멸
8. **에이전트 탭** → 각 에이전트 판단 근거 확인

## 사업참여 VRB 손익 자동산출 (`/vrb`)

VRB 엑셀의 손익 계산 로직을 웹으로 옮긴 부가 기능입니다. 기초금액·투찰율,
내부인건비(직급·M/M), 매입(물품/용역), 프로젝트 경비 등 기본값만 입력하면
매출이익·직접경비·영업비·예비비·**프로젝트손익/손익률**이 실시간 자동 산출됩니다.

- 진입: 홈 헤더의 "VRB 손익 자동산출" 버튼 또는 `/vrb`
- 상세 문서 및 계산식: [`docs/VRB.md`](docs/VRB.md)

## 환경 변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API 키 | O |
| `NEXT_PUBLIC_DEMO_MODE` | 데모 모드 활성화 | X (기본: true) |

## 라이선스

만사시스템 - NIPA AI Agent 융합확산 사업 과제
