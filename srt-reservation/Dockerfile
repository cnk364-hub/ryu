FROM python:3.11-slim

WORKDIR /app

# 시스템 빌드 도구 (cryptography, pydantic-core 빌드에 필요할 수 있음)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Seoul

# 의존성 먼저 설치 (레이어 캐시 활용)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 앱 소스 복사
COPY . .

# SQLite/키/로그 영속화 디렉터리
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=8000 \
    HOST=0.0.0.0 \
    OPEN_BROWSER=0 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# 헬스체크는 /healthz 사용 (인증 없이 통과)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["python", "main.py"]
