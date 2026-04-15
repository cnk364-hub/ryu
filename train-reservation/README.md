# 기차표 예약 (SRT / KTX 자동 예약)

SRT 와 KTX 열차표를 자동으로 조회·예약하고, 카카오톡 '나에게 보내기' 로 알림을 전송하는 통합 파이썬 프로그램입니다. 자격정보와 카카오 토큰은 OS 키체인(`keyring`)에 안전하게 보관되며 코드/Git 에 남지 않습니다.

## 주요 기능

- SRT (`SRT` 라이브러리) / KTX (`korail2` 라이브러리) 통합 지원
- 공통 `TrainAdapter` 추상 클래스로 어댑터 일관성 확보
- `ReserveConfig` 데이터클래스로 설정 관리
- 30초(설정 가능) 간격으로 반환표 포함 계속 조회
- 좌석 발생 시 자동 예약
- SRT + KTX 동시 스레드 실행
- 예약 성공 시 카카오톡 '나에게 보내기' REST API 알림 (토큰 만료 시 refresh_token 으로 자동 갱신)
- Tkinter GUI 제공 (실행할 때마다 조건 변경 가능)
- 자격정보·카카오 토큰을 OS 키체인에 암호화 저장 (`keyring`)
- `train_reserve.log` 로그 파일 저장 (회전 로그)

## 설치

```bash
pip install -r requirements.txt
```

## 실행

### GUI 모드 (권장)
```bash
python gui.py
```

- Tkinter 창이 열리고, 출발/도착역·날짜·시각·좌석 등을 입력해서 바로 실행
- "＋ 조건 추가" 로 여러 조건을 동시에 감시 가능
- 실행 로그가 창 안에서 실시간 표시
- 최초 1회 "⚙ 카카오 설정" 에서 토큰 3종 입력 후 저장

### CLI 모드
```bash
python main.py
```

- `main.py` 의 `configs` 리스트에 예약 조건만 적어두면 계정·카카오 토큰은 keyring 에서 자동 로드
- GUI 에서 한 번이라도 저장해둔 상태여야 동작

## 카카오톡 알림

- 카카오 디벨로퍼스에서 REST API 앱 생성
- 동의 항목: `talk_message`
- 엔드포인트: `https://kapi.kakao.com/v2/api/talk/memo/default/send`
- 메시지 템플릿: `text` 타입, 열차정보·출발/도착·좌석종류 포함
- 401(토큰 만료) 시 `https://kauth.kakao.com/oauth/token` 으로 `refresh_token` 사용해 자동 갱신 후 재전송
- 갱신된 토큰은 keyring 에도 반영되어 다음 실행에서 바로 사용

## 보안

- **소스 코드에 토큰/아이디/비밀번호를 하드코딩하지 않습니다.**
- 자격정보는 OS 키체인에 저장:
  - Windows: **자격 증명 관리자**
  - macOS: **Keychain**
  - Linux: Secret Service / KWallet
- 키체인 항목 서비스 이름: `train-reservation`
- 체크 해제 후 실행하면 해당 세션 메모리에만 유지되며 창 닫으면 사라집니다.

## 디렉터리 구조

```
train-reservation/
├── adapters/
│   ├── __init__.py
│   ├── base.py            # TrainAdapter 추상 클래스
│   ├── srt_adapter.py     # SRT 어댑터
│   └── ktx_adapter.py     # KTX 어댑터
├── config.py              # ReserveConfig 데이터클래스
├── logger.py              # 공용 로거
├── notifier.py            # 카카오톡 알림 (+ refresh 자동 갱신)
├── secrets_store.py       # keyring 기반 자격정보 저장소
├── main.py                # CLI 진입점
├── gui.py                 # Tkinter GUI 진입점
├── requirements.txt
└── README.md
```

## 주의사항

- 본 프로그램은 학습/개인 사용 목적입니다. 각 사이트 약관 및 매크로 정책을 준수하세요.
- 너무 짧은 조회 간격은 계정 차단 위험이 있습니다 (`check_interval >= 30` 권장).
- 예약 후 **10분 이내 결제** 하지 않으면 자동 취소됩니다. 카톡 알림 수신 즉시 결제 진행.
