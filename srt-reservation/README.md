# 🚄 SRT 자동예약 (SR 수서고속철도)

SR(수서고속철도)의 SRT 좌석을 자동으로 조회·예약해 주는 웹 애플리케이션입니다.
FastAPI + SRT 라이브러리 + SQLite + Fly.io 조합. KTX 버전(`../ktx-reservation/`)과
**완전히 분리**된 프로젝트입니다.

> ⚠️ **주의**
> - 학습/개인 용도. 과도한 사용 시 계정 차단 가능.
> - SR과 무관한 프로젝트이며, 사용 책임은 이용자에게 있습니다.

---

## ✨ 주요 기능

- 🤖 **자동예약 엔진** — 30~60초 랜덤 주기로 빈 좌석 조회 후 자동 예약
- 🎨 **다크 테마 모바일 UI** — Bootstrap 5, 하단 탭
- 👥 **다중 프로필** — 최대 5개 (Fernet 암호화 저장)
- 📋 **이력 / 실시간 로그** — WebSocket 스트리밍
- 🎉 **예약 성공 시** 풀스크린 팝업 + 푸시 알림 + 알림음 + 진동

## 🚉 지원 역 (SR 노선만)

수서, 동탄, 평택지제, 천안아산, 오송, 대전, 김천구미, 동대구, 경주, 울산, 부산, 공주, 익산, 정읍, 광주송정, 목포

> KTX 전용 역(서울, 용산, 강릉, 포항 등)은 KTX 버전(`../ktx-reservation/`)을 사용하세요.

---

## 🖥️ 로컬 실행

### 공통
- Python 3.11
- git (SRT 라이브러리 git 설치용)

### Windows

```powershell
cd C:\Users\edwar\Documents\<원하는경로>\srt-reservation
py -3.11 -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
$env:PORT=8082
python main.py
```

브라우저 → http://localhost:8082

### macOS / Linux

```bash
cd srt-reservation
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
PORT=8082 python main.py
```

## 📂 파일 구조

```
srt-reservation/
├── main.py             # FastAPI + WebSocket
├── engine.py           # 자동예약 엔진
├── database.py         # SQLite + Fernet
├── srt_adapter.py      # SRT 라이브러리 래퍼
├── templates/index.html
├── static/style.css
├── static/app.js
├── Dockerfile
├── fly.toml            # app = "srt-reservation"
├── requirements.txt    # SRT (git+) 포함
└── README.md
```

## ☁️ Fly.io 배포

```bash
# flyctl 설치: https://fly.io/docs/hands-on/install-flyctl/
fly auth login

cd srt-reservation
fly volumes create srt_data --size 1 --region nrt

# 암호화 키 시크릿 (재배포해도 비밀번호 유지)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
fly secrets set FERNET_KEY="<위 출력값>"

fly deploy
```

접속: `https://srt-reservation.fly.dev`

## 👤 SRT 계정 설정

1. 브라우저에서 앱 접속
2. 👤 계정 탭 → 새 프로필 추가
3. 프로필 이름 / SRT 아이디 (회원번호 10자리 / 이메일 / 전화번호) / 비밀번호
4. **로그인 테스트** → 성공 확인
5. **저장**

> 💡 SR은 일반 회원가입 계정만 지원합니다 (소셜 로그인 없음).

## 🔧 예약 설정

⚙️ 설정 탭에서:
- 출발역 / 도착역 (SR 노선만)
- 출발 날짜 (오늘 이후)
- 시작~종료 시각 범위
- 좌석 등급 (일반실 / 특실 / 둘 다)
- 인원수 (1~4)

## ❓ FAQ

**Q. 예약 성공 후 언제까지 결제?**
10분 내. SRT 앱 또는 https://etk.srail.kr 에서.

**Q. KTX 버전과 같이 돌릴 수 있나?**
가능합니다. 서로 다른 포트 사용 (KTX=8081, SRT=8082 권장). DB/로그/설정도 별도.

**Q. MACRO / 봇 감지 있나?**
SRT는 KTX 대비 안티봇이 약한 편. 그래도 1초 딜레이 + 30~60초 주기 랜덤으로 보수적으로 돌립니다.

**Q. 수서 → 서울 같은 경로?**
불가능. SR은 수서에서 시작하고, 코레일(KTX)은 서울/용산에서 시작. 별개 회사 별개 노선.

## 📄 라이선스

개인 사용 · 학습 용도. 상업적 사용 금지.
