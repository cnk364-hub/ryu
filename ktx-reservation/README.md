# 🚄 KTX 자동예약 (KTX Auto Reservation)

코레일 KTX 좌석을 자동으로 조회·예약해 주는 웹 애플리케이션입니다.
FastAPI + korail2 + SQLite + Fly.io 조합으로 구성되어 있으며, 모바일 최적화된
다크 테마 UI를 제공합니다.

> ⚠️ **주의사항**
> - 본 프로그램은 학습/개인 용도로만 사용해주세요.
> - 과도한 조회는 코레일 서버에 부담을 주며, 계정이 차단될 수 있습니다.
> - 본 프로젝트는 코레일과 무관하며, 사용에 대한 책임은 이용자 본인에게 있습니다.

---

## ✨ 주요 기능

- 🤖 **자동예약 엔진** — 30~60초 랜덤 주기로 가용 좌석을 조회 후 즉시 예약 시도
- 🎨 **다크 테마 UI** — Bootstrap 5 기반, 모바일 앱 수준의 터치 친화적 화면
- 👥 **다중 프로필** — 아빠/엄마/본인 등 최대 5개 계정 관리 (비밀번호 암호화)
- 📋 **예약 이력** — 최근 100건 조회/예약 기록 저장
- 📡 **실시간 로그** — WebSocket 기반 실시간 스트리밍 + 다운로드
- 🎉 **축하 팝업** — 예약 성공 시 풀스크린 팝업 + 푸시 알림 + 알림음 + 진동

---

## 🖥️ 로컬 실행 방법

### 공통 요구사항
- Python 3.11 이상
- pip

### Windows

```powershell
# 1. 저장소 클론 및 이동
git clone <REPO_URL>
cd ktx-reservation

# 2. 가상환경 생성
python -m venv venv
venv\Scripts\activate

# 3. 의존성 설치
pip install -r requirements.txt

# 4. 실행
python main.py
```

브라우저에서 http://localhost:8080 접속

### macOS / Linux

```bash
# 1. 저장소 클론 및 이동
git clone <REPO_URL>
cd ktx-reservation

# 2. 가상환경 생성
python3 -m venv venv
source venv/bin/activate

# 3. 의존성 설치
pip install -r requirements.txt

# 4. 실행
python main.py
```

브라우저에서 http://localhost:8080 접속

### 환경변수 (선택)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_PATH` | `./ktx.db` | SQLite DB 경로 |
| `FERNET_KEY` | 자동 생성 | 비밀번호 암호화 키 (배포 시 고정 권장) |
| `PORT` | `8080` | 서버 포트 |

---

## ☁️ Fly.io 배포 방법

### 1. flyctl 설치

```bash
# macOS / Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. 로그인

```bash
fly auth login
```

### 3. 앱 생성 및 배포

```bash
# 프로젝트 폴더로 이동
cd ktx-reservation

# (선택) 앱 이름이 중복되면 fly.toml의 app 값을 수정
# 볼륨 생성 (SQLite 영속 저장용)
fly volumes create ktx_data --size 1 --region nrt

# 암호화 키 secret 등록 (권장, 재배포 시에도 비밀번호 유지)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# 위 출력값을 복사해서:
fly secrets set FERNET_KEY="<위에서 생성한 키>"

# 배포
fly deploy
```

### 4. 접속 주소

- 기본 주소: `https://ktx-reservation.fly.dev`
- 앱 이름을 바꿨다면: `https://<APP_NAME>.fly.dev`

### 5. 유용한 명령어

```bash
fly logs                    # 실시간 로그
fly status                  # 배포 상태
fly ssh console             # 원격 셸
fly secrets list            # 비밀값 목록
fly scale memory 512        # 메모리 변경
```

---

## 📱 모바일 접속 방법

1. 배포된 주소(`https://<APP_NAME>.fly.dev`)를 모바일 브라우저에서 접속
2. 홈 화면에 추가 (iOS: 공유 → 홈 화면에 추가 / Android: 메뉴 → 홈 화면에 추가)
3. 앱처럼 실행 가능 (PWA 방식)
4. 첫 실행 시 알림 권한 허용 → 예약 성공 시 푸시 알림 수신

---

## 👤 계정 설정 방법

1. 앱 실행 후 **계정 탭(👤)** 으로 이동
2. **프로필 이름** 입력 (예: "아빠", "엄마", "본인")
3. **코레일 아이디 / 비밀번호** 입력
4. **로그인 테스트** 버튼으로 실제 로그인 확인
5. **저장** 버튼 클릭
6. 여러 프로필을 저장한 경우, 체크(✓) 버튼으로 사용할 프로필 선택

> 🔒 비밀번호는 Fernet 대칭키로 암호화되어 DB에 저장됩니다. 서버 외부로 전송되지 않습니다.

---

## 🔧 예약 설정 방법

1. **설정 탭(⚙️)** 으로 이동
2. 출발역 / 도착역 선택
3. 출발 날짜 선택 (오늘 이후)
4. 시작 시각 / 종료 시각 지정 (예: 06:00 ~ 09:00)
5. 좌석 등급 선택 (일반실 / 특실 / 둘 다)
6. 인원수 선택 (1~4명)
7. **설정 저장**

설정 후 홈 탭의 **자동예약 시작** 버튼을 누르면 조회가 시작됩니다.

---

## 📂 파일 구조

```
ktx-reservation/
├── main.py              # FastAPI 엔드포인트 + WebSocket
├── engine.py            # 자동예약 엔진 (asyncio)
├── database.py          # SQLite + 암호화
├── ktx_adapter.py       # korail2 래퍼
├── templates/
│   └── index.html       # UI (단일 페이지 앱)
├── static/
│   ├── style.css        # 다크 테마 커스텀
│   └── app.js           # 프론트엔드 로직
├── Dockerfile
├── fly.toml
├── .dockerignore
├── requirements.txt
└── README.md
```

---

## ❓ 자주 묻는 질문 (FAQ)

### Q. 예약이 계속 실패합니다.
- 원하는 시간대의 열차가 매진 상태라 빈 좌석이 나올 때까지 대기하는 상태입니다.
- 로그 탭에서 구체적인 오류 메시지를 확인하세요.
- 연속 실패 5회 시 3분간 자동 휴식 후 재시도합니다.

### Q. 로그인은 되는데 예약은 왜 안 되나요?
- 가용 좌석이 없기 때문입니다.
- 로그에 "가용 좌석 없음" 이 반복되면 정상 동작 중입니다. 빈 자리가 뜨면 즉시 예약됩니다.

### Q. 스마트폰 화면을 꺼도 동작하나요?
- 서버가 클라우드(Fly.io)에서 항상 실행되므로, 폰을 꺼놔도 엔진은 계속 조회합니다.
- 예약 성공 시 푸시 알림을 받으려면 브라우저를 열어두어야 합니다.

### Q. 결제는 어떻게 하나요?
- 본 프로그램은 **좌석 잡기(예매)** 까지만 수행합니다.
- 예약 성공 후 **10분 내에 코레일 앱/홈페이지에서 결제**를 완료해야 합니다.
- 10분 초과 시 좌석이 자동 취소됩니다.

### Q. 계정이 차단되지는 않나요?
- 본 프로그램은 최대한 사람처럼 행동합니다 (랜덤 딜레이, User-Agent 교체).
- 그러나 과도한 사용은 차단 위험이 있으니, 여러 대를 동시에 돌리지 마세요.

### Q. 비밀번호는 안전한가요?
- Fernet 대칭키(AES-128 + HMAC)로 암호화되어 저장됩니다.
- Fly.io 배포 시 `FERNET_KEY` secret을 등록해두면 재배포해도 값이 유지됩니다.

### Q. 여러 프로필을 동시에 돌릴 수 있나요?
- 현재는 **선택된 프로필 1개**만 동작합니다. 다중 동시 예약은 의도적으로 제한합니다.
- 필요 시 프로필을 전환한 뒤 다시 시작하세요.

### Q. 조회 주기를 더 짧게 하고 싶어요.
- `engine.py` 의 `get_random_interval()` 값을 수정하면 되지만, **차단 위험**이 커집니다.
- 30~60초가 안전한 범위입니다.

### Q. Fly.io 무료 티어로 운영 가능한가요?
- 가능합니다. `min_machines_running = 1` 설정으로 유휴 상태에도 계속 실행됩니다.
- 볼륨 1GB는 무료 범위 내입니다.

---

## 🛠️ 개발 참고

- **Python 버전**: 3.11
- **핵심 의존성**: `fastapi`, `uvicorn`, `korail2`, `cryptography`
- **DB**: SQLite (WAL 모드)
- **세션 관리**: korail2 내장 + 자동 재로그인

## 📄 라이선스

개인 사용 및 학습 용도로만 제공됩니다. 상업적 사용 금지.
