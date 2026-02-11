# =============================================================================
# NexusText AI v7.0 - Frontend Dockerfile
# Multi-stage build: Node 20 (builder) -> nginx:alpine (runtime)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder - ビルドステージ
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /build

# パッケージマニフェストを先にコピーしてキャッシュ効率を上げる
COPY package.json package-lock.json* ./

# 依存関係のインストール
RUN npm install --no-audit --no-fund

# ソースコードのコピー
COPY . .

# ビルド時の環境変数
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# プロダクションビルド
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Runtime - nginx:alpine で静的ファイルを配信
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

LABEL maintainer="NexusText AI Team"
LABEL version="7.0.0"
LABEL description="NexusText AI Frontend - React SPA"

# デフォルトnginx設定を削除して、カスタム設定を生成
RUN rm /etc/nginx/conf.d/default.conf && \
    printf '%s\n' \
    'server {' \
    '    listen 80;' \
    '    listen [::]:80;' \
    '    server_name _;' \
    '    root /usr/share/nginx/html;' \
    '    index index.html;' \
    '    gzip on;' \
    '    gzip_vary on;' \
    '    gzip_proxied any;' \
    '    gzip_comp_level 6;' \
    '    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;' \
    '    add_header X-Frame-Options "SAMEORIGIN" always;' \
    '    add_header X-Content-Type-Options "nosniff" always;' \
    '    add_header X-XSS-Protection "1; mode=block" always;' \
    '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;' \
    '    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {' \
    '        expires 1y;' \
    '        add_header Cache-Control "public, immutable";' \
    '        access_log off;' \
    '    }' \
    '    location /api/ {' \
    '        proxy_pass http://backend:8000;' \
    '        proxy_set_header Host $host;' \
    '        proxy_set_header X-Real-IP $remote_addr;' \
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
    '        proxy_set_header X-Forwarded-Proto $scheme;' \
    '        proxy_read_timeout 300s;' \
    '        proxy_connect_timeout 75s;' \
    '    }' \
    '    location / {' \
    '        try_files $uri $uri/ /index.html;' \
    '    }' \
    '    location /nginx-health {' \
    '        access_log off;' \
    '        return 200 "healthy\\n";' \
    '        add_header Content-Type text/plain;' \
    '    }' \
    '}' > /etc/nginx/conf.d/default.conf

# ビルド成果物をnginxの配信ディレクトリにコピー
COPY --from=builder /build/dist /usr/share/nginx/html

# 非rootユーザーでnginxを実行するための設定
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

EXPOSE 80

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
