# =============================================================================
# NexusText AI v7.0 - Backend Dockerfile
# Multi-stage build: Python 3.11 (builder -> runtime)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder - 依存関係のインストール
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# システム依存パッケージ（ビルド用）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libffi-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# pip設定
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# 依存関係を先にコピーしてキャッシュ効率を上げる
COPY pyproject.toml ./

# 依存関係のインストール（プロダクション用のみ）
RUN pip install --no-cache-dir --prefix=/install .

# ---------------------------------------------------------------------------
# Stage 2: Runtime - 本番用軽量イメージ
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

LABEL maintainer="NexusText AI Team"
LABEL version="7.0.0"
LABEL description="NexusText AI Backend - FastAPI Application"

# ランタイム用システムパッケージ
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 非rootユーザーの作成
RUN groupadd --gid 1000 nexustext \
    && useradd --uid 1000 --gid nexustext --shell /bin/bash --create-home nexustext

# Pythonパッケージをbuilderステージからコピー
COPY --from=builder /install /usr/local

# アプリケーションコードのコピー
WORKDIR /app
COPY --chown=nexustext:nexustext . .

# キャッシュ・一時ファイル用ディレクトリ
RUN mkdir -p /app/data /app/logs /app/cache \
    && chown -R nexustext:nexustext /app

# 非rootユーザーに切り替え
USER nexustext

# 環境変数
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    PORT=8000

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

# uvicornでアプリケーション起動
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--loop", "uvloop", \
     "--http", "httptools", \
     "--access-log", \
     "--log-level", "info"]
