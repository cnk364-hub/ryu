# 가축 질병 조기경보 AI 에이전트 데모 시스템

> NIPA AI Agent 융합확산 사업 - 만사시스템
> "급이패턴 기반 다중 AI 에이전트 협업형 가축 질병 조기경보 및 축사 통합 운영관리 시스템"

## 프로젝트 소개

실제 LiDAR 장비 없이 시뮬레이터로 급이 데이터를 생성하고, 7개 AI 에이전트가 실시간으로 **판단 → 실행 → 관찰 → 수정**하는 Agentic Loop를 시각적으로 보여주는 웹 데모 애플리케이션입니다.

Mock 모드에서는 사전 정의된 AI 응답을 사용하므로 **API 키 없이도 완전하게 동작**합니다.
실제 Claude API 연동 시에는 각 에이전트가 Claude를 실제 호출하여 분석합니다.

## 설치 및 실행

### Mock 모드 (권장 - API 키 불필요)

```bash
# 의존성 설치 없이 바로 실행 가능
node server.js
```

브라우저에서 http://localhost:3000 접속

### Next.js 모드 (Claude API 실제 연동)

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.local.example .env.local
# .env.local 파일에 ANTHROPIC_API_KEY 설정

# 개발 서버 실행
npm run dev
```

## 기술 스택

| 구분 | 기술 |
|------|------|
| 서버 | Node.js (standalone) / Next.js 14 (App Router) |
| 프론트엔드 | Vanilla JS + CSS (CDN 불필요, 자체 포함) |
| 차트 | SVG 기반 커스텀 차트 |
| AI | Anthropic Claude API (7-Agent Pipeline) |
| 실시간 | Server-Sent Events (SSE) |
| 데이터 시뮬레이션 | 시드 기반 재현 가능 PRNG |
| 이상탐지 | EIF (Extended Isolation Forest) 알고리즘 |

## 화면 구성 (3개 탭)

### 탭 1: 실시간 모니터링 대시보드
- 급이패턴 실시간 라인차트 (30일, 정상 기준선 vs 실제 측정값)
- 이상 시나리오 주입 슬라이더 (데이터 하락 시뮬레이션)
- 에이전트 실행 로그 타임라인 (색상 구분, 실시간 업데이트)
- 위험 지표 카드 (급이량 변화율, 이상 지속일수, 위험 전환 시간)
- AI 조치 권고안 박스
- Agentic Loop SVG 시각화 (7개 노드, 활성 에이전트 강조)

### 탭 2: 시나리오 선택 & 실행
- 3개 시나리오 카드 (ASF 질병, 고온 스트레스, 출하 최적화)
- 시나리오 실행 버튼 → 7개 에이전트 순차 실행
- 실행 진행 스텝퍼 (8단계: 데이터 수집 + 7개 에이전트)

### 탭 3: 에이전트 상세 & 성능
- 7개 에이전트 상세 카드 (역할, 기술, 실행 횟수, 응답시간, 최근 판단)
- 시스템 성능 지표 (응답 정확도, 일관성, 환각 발생률)

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

## 에이전트 실행 파이프라인

```
[시뮬레이터] → 30일치 급이데이터 생성
      ↓
[EIF 이상탐지] → 클라이언트 JS에서 이상 점수 계산 (> 0.6 = 이상)
      ↓
[Context Agent] → 상황 요약 JSON 생성
      ↓
[Risk Trajectory Agent] → K1~K4 위험 상태 전이 분석
      ↓
[Planning Agent] → CBR 기반 대응 계획 수립
      ↓
[Execution Agent] → 실행 체크리스트 생성
      ↓
[Monitoring Agent] → KPI 및 모니터링 기준 설정
      ↓
[Recovery Agent] → 효과 평가 및 대안 전략
      ↓
[Orchestration Agent] → 최종 보고서 및 알림 생성
      ↓
[대시보드 업데이트] → 차트, 로그, 위험등급 실시간 반영
```

## 데모 시나리오

### 시나리오 1: ASF 질병 조기경보
- 최근 3일간 급이량 35% 급감
- 아프리카돼지열병(ASF) 의심 상황
- 7개 에이전트 순차 실행 → 긴급 격리 조치 권고
- K3(위험) 상태, 12시간 내 K4(긴급) 전환 확률 50%

### 시나리오 2: 고온 스트레스 환경경보
- 축사 내부 온도 33.2도, 습도 82%
- THI(온습도지수) 84.7 위험 구간
- 환기 시스템 최대 가동 및 모니터링 계획

### 시나리오 3: 최적 출하시기 분석
- 평균 체중 112kg, 목표 115kg (D-3.5)
- FCR(사료요구율) 3.1 경제적 효율 구간
- 4월 12일 출하 권장, 도축장 예약 안내

## 데모 시연 가이드 (5분)

1. **앱 로드** → 정상 상태 급이패턴 차트 확인 (30일 안정적)
2. **시나리오 탭** → "ASF 질병 조기경보" 시나리오 선택
3. **시나리오 실행** → 카드 클릭 후 다시 클릭 (또는 실행 버튼)
4. **스텝퍼 확인** → 7개 에이전트가 순차적으로 실행되는 진행 상황 확인
5. **대시보드 자동 전환** → 파이프라인 완료 시 대시보드 탭으로 자동 이동
6. **차트 변화** → 최근 3일 데이터 하락 + 이상 탐지 마커 표시
7. **에이전트 로그** → 7개 에이전트의 분석 결과 타임라인 확인
8. **위험 등급** → "긴급" 배지 + 화면 테두리 빨강 점멸
9. **AI 권고안** → "ASF 의심 - 즉시 격리 조치" 메시지 확인
10. **에이전트 탭** → 각 에이전트의 실행 횟수, 응답시간, 판단 근거 확인

## 폴더 구조

```
/
├── server.js                  ← 독립 실행 서버 (Mock 모드)
├── public/
│   ├── index.html             ← 메인 HTML
│   ├── styles.css             ← 전체 스타일시트
│   ├── lib.js                 ← 유틸리티, 차트, 시각화 라이브러리
│   └── app.js                 ← 메인 애플리케이션 로직
├── mock-data/
│   ├── responses.json         ← 3개 시나리오별 Mock AI 응답
│   └── simulator.js           ← 데이터 시뮬레이터 (Node.js)
├── src/                       ← Next.js 소스 (API 연동 모드)
│   ├── app/
│   │   ├── api/agents/run/    ← Claude API 파이프라인 (SSE)
│   │   ├── api/simulator/     ← 데이터 시뮬레이터 API
│   │   └── ...
│   ├── components/            ← React 컴포넌트
│   ├── lib/                   ← 타입, 에이전트 정의, 시뮬레이터
│   └── store/                 ← Zustand 상태관리
├── package.json
└── README.md
```

## 환경 변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API 키 (Next.js 모드) | Mock 모드 시 불필요 |
| `NEXT_PUBLIC_DEMO_MODE` | 데모 모드 활성화 | X (기본: true) |

## 라이선스

만사시스템 - NIPA AI Agent 융합확산 사업 과제
