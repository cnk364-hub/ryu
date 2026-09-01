# 가축 질병 조기경보 AI 에이전트 데모 시스템

> NIPA AI Agent 융합확산 사업 - 만사시스템
> "급이패턴 기반 다중 AI 에이전트 협업형 가축 질병 조기경보 시스템"

## 실행 방법

```bash
node server.js
```

브라우저에서 http://localhost:3000 접속

**npm install 불필요, API 키 불필요, 외부 의존성 없음**

## 7개 AI 에이전트

| # | 에이전트 | 역할 | 핵심 기술 |
|---|---------|------|----------|
| 1 | Context Agent | 상황인식 | EIF 이상탐지 |
| 2 | Risk Trajectory Agent | 위험궤적분석 | HMM 상태전이 |
| 3 | Planning Agent | 대응계획 | CBR 사례기반추론 |
| 4 | Execution Agent | 조치실행 | 자동화 실행 엔진 |
| 5 | Monitoring Agent | 모니터링 | KPI 추적 |
| 6 | Recovery Agent | 복구관리 | 복구 시뮬레이션 |
| 7 | Orchestration Agent | 오케스트레이션 | Multi-Agent 협업 |

## 데모 시나리오

1. **ASF 질병 조기경보** - 급이량 35% 급감, 긴급 방역 대응
2. **고온 스트레스 환경경보** - 온도 33°C 초과, 환기/쿨링 대응
3. **최적 출하시기 분석** - 체중/FCR 기반 출하 최적화
