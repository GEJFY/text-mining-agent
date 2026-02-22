# NexusText AI v7.0

**Global Multimodal Autonomous Text Analyzer**

テキストマイニングに特化した多言語・マルチモーダル解析プラットフォーム。
FastAPI + React/TypeScript による SPA アーキテクチャで、クラスタリング・感情分析・共起ネットワーク・因果連鎖・矛盾検出など
9 種類の解析手法を統合的に提供します。LLM（Claude / GPT / Gemini / Bedrock / Vertex AI / Ollama）を中核に据えた
自律型 AI エージェントが分析パイプラインを自動実行し、PDF/Markdown レポートを生成します。

---

## 主な機能

### 解析手法一覧

| # | 解析手法 | 説明 | アルゴリズム / モデル |
|---|---------|------|----------------------|
| 1 | クラスタリング | テキストを意味的に類似するグループに分類 | K-Means / HDBSCAN / GMM |
| 2 | 感情分析 | テキストの感情極性・強度を判定（5モード） | LLM + ルールベース |
| 3 | 共起ネットワーク | 単語間の共起関係をネットワークグラフで可視化 | TF-IDF + コミュニティ検出 |
| 4 | 因果連鎖分析 | テキストから因果関係を抽出しチェーンを構築 | LLM 推論 |
| 5 | 矛盾検出 | データセット内の矛盾する記述を検出 | LLM 推論 |
| 6 | アクショナビリティ | テキストの実行可能性をスコアリング | LLM 評価 |
| 7 | タクソノミー生成 | テキストから階層的分類体系を自動生成 | LLM 分類 |
| 8 | 自律 AI エージェント | 目的に応じて解析手法を自動選択・実行 | Tool Use Agent (HITL対応) |
| 9 | パイプライン | 複数の解析を順序付きで一括実行 | オーケストレーション |

**埋め込みモデル**: `paraphrase-multilingual-MiniLM-L12-v2`（384次元、100+ 言語対応）

### Sprint 18 最新機能

| 機能 | 説明 |
|------|------|
| カラムマッピング UI | 左に解析フィールド、右にCSVカラムを選択するドラッグ対応UI |
| 日本語エラーメッセージ | 全エラーを日本語化 + correlation_id によるトレーシング |
| エージェント進捗ポーリング | 3秒間隔の自動ポーリング + 5フェーズアニメーション表示 |
| エージェントセッション永続化 | AgentSession テーブルによるDB永続化 |
| シングルボタン UX | 解析実行 + オプション自動レポート生成をワンクリックで |
| PDF 日本語フォント対応 | 動的タイトル生成 + 日本語フォント埋め込み |
| レポートカスタムプロンプト | テキストエリアで自由にプロンプトを指定可能 |
| タブナビゲーション状態保持 | Zustand ストアによるエージェントタブ切替時の状態維持 |
| クラスタ分析 InfoTooltip | 各パラメータにツールチップで説明を表示 |
| メニューグルーピング | 基本分析 / 高度な分析 / 管理の3グループに整理 |

---

## アーキテクチャ

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (React 18 / TypeScript / Vite)          :5173         │
│  ├─ 14 Pages (Dashboard, Cluster, Sentiment, Agent, ...)       │
│  ├─ 8 Reusable Components (AuthGuard, DatasetGuard, ...)       │
│  ├─ 3 Zustand Stores (auth, analysis, toast)                   │
│  └─ D3.js ネットワーク可視化 / Chart.js グラフ                    │
├──────────────────────────────────────────────────────────────────┤
│  API Gateway (Cloud-native per provider)                        │
│  AWS: API Gateway │ Azure: APIM │ GCP: Cloud Endpoints         │
├──────────────────────────────────────────────────────────────────┤
│  Backend (FastAPI / Python 3.11)                  :8000         │
│  ├─ 7 Routers / 41 Endpoints                                   │
│  ├─ LLM Orchestrator (Claude, GPT, Gemini, Bedrock, Vertex)   │
│  ├─ Text Mining Engine (clustering, sentiment, cooccurrence)   │
│  ├─ Autonomous Agent (Tool Use, HITL)                          │
│  ├─ Report Generator (PDF / Markdown)                          │
│  └─ Middleware (Security Headers, Rate Limit, Correlation ID)  │
├──────────────────────────────────────────────────────────────────┤
│  Data Layer                                                     │
│  ├─ PostgreSQL 16 (Users, Datasets, TextRecords, AnalysisJobs)│
│  └─ Redis 7 (Cache, Agent State, Rate Limiting)               │
├──────────────────────────────────────────────────────────────────┤
│  Infrastructure (Terraform / Docker Compose)                    │
│  AWS / Azure / GCP / Local Docker                              │
└──────────────────────────────────────────────────────────────────┘
```

### Docker サービス構成

| サービス | イメージ | ポート | 役割 |
|---------|---------|--------|------|
| backend | Python 3.11 (FastAPI) | 8000 | REST API サーバー |
| frontend | Node 20 (Vite) | 5173 | SPA フロントエンド |
| postgres | PostgreSQL 16 | 5432 | メインデータベース |
| redis | Redis 7 | 6379 | キャッシュ / セッション / レート制限 |

---

## クイックスタート

### 前提条件

- Docker Desktop 4.x 以上
- Docker Compose v2
- Git
- LLM APIキー（Claude / GPT / Gemini のいずれか）

### セットアップ手順

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd text-mining-agent

# 2. 環境変数ファイルを作成
cp .env.example .env
# .env を編集して API キーを設定

# 3. Docker イメージをビルド
docker compose build --no-cache

# 4. サービスを起動
docker compose up -d

# 5. ログを確認（任意）
docker compose logs -f backend
```

### アクセス URL

| サービス | URL | 説明 |
|---------|-----|------|
| フロントエンド | http://localhost:5173 | React SPA |
| バックエンド API | http://localhost:8000 | FastAPI サーバー |
| API ドキュメント | http://localhost:8000/docs | Swagger UI (OpenAPI) |
| ReDoc | http://localhost:8000/redoc | ReDoc 形式ドキュメント |

### クラウドデプロイ

```bash
cd infra/terraform/<provider>  # aws | azure | gcp
terraform init
terraform plan
terraform apply
```

---

## プロジェクト構造

```
text-mining-agent/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── endpoints/
│   │   │       ├── analysis.py      # 解析エンドポイント (16 endpoints)
│   │   │       ├── agent.py         # 自律エージェント (7 endpoints)
│   │   │       ├── auth.py          # 認証・ユーザー管理 (8 endpoints)
│   │   │       ├── data.py          # データインポート (5 endpoints)
│   │   │       ├── reports.py       # レポート生成 (2 endpoints)
│   │   │       ├── dashboard.py     # ダッシュボード (1 endpoint)
│   │   │       └── health.py        # ヘルスチェック (3 endpoints)
│   │   ├── agents/
│   │   │   ├── analysis_agent.py    # 自律分析エージェント本体
│   │   │   └── agent_store.py       # Redis エージェント状態管理
│   │   ├── core/
│   │   │   ├── config.py            # 設定管理 (Pydantic Settings)
│   │   │   ├── security.py          # JWT / RBAC
│   │   │   ├── database.py          # SQLAlchemy async engine
│   │   │   ├── errors.py            # カスタムエラー定義
│   │   │   ├── exception_handlers.py # グローバル例外ハンドラー
│   │   │   ├── logging.py           # 構造化ログ
│   │   │   ├── telemetry.py         # テレメトリ / メトリクス
│   │   │   ├── validation.py        # バリデーションユーティリティ
│   │   │   └── cloud_provider.py    # クラウドプロバイダー抽象化
│   │   ├── middleware/
│   │   │   ├── security_headers.py  # OWASP セキュリティヘッダー
│   │   │   ├── rate_limit.py        # レート制限
│   │   │   └── correlation.py       # correlation_id トレーシング
│   │   ├── models/
│   │   │   ├── orm.py               # SQLAlchemy ORM モデル
│   │   │   └── schemas.py           # Pydantic リクエスト/レスポンススキーマ
│   │   └── services/
│   │       ├── clustering.py        # K-Means / HDBSCAN / GMM
│   │       ├── sentiment.py         # 感情分析 (5モード)
│   │       ├── cooccurrence.py      # 共起ネットワーク
│   │       ├── llm_orchestrator.py  # LLM プロバイダールーティング
│   │       ├── llm_providers/       # Claude, GPT, Gemini, Bedrock, Vertex, Ollama
│   │       ├── report_generator.py  # PDF / Markdown レポート生成
│   │       ├── data_import.py       # CSV / Excel インポート
│   │       ├── text_preprocessing.py # テキスト前処理 / ストップワード
│   │       ├── pipeline.py          # パイプラインオーケストレーション
│   │       ├── analysis_registry.py # 解析ツールレジストリ
│   │       ├── cache.py             # Redis キャッシュラッパー
│   │       ├── pii_anonymizer.py    # PII 検出・匿名化
│   │       ├── dlq.py               # Dead Letter Queue
│   │       └── tools/               # エージェント用ツール定義
│   ├── tests/                       # pytest テストスイート (29 files)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx    # ダッシュボード（KPI・最近のアクティビティ）
│   │   │   ├── ImportPage.tsx       # データインポート（カラムマッピング）
│   │   │   ├── ClusterPage.tsx      # クラスタリング分析
│   │   │   ├── SentimentPage.tsx    # 感情分析
│   │   │   ├── CooccurrencePage.tsx # 共起ネットワーク (D3.js)
│   │   │   ├── CausalChainPage.tsx  # 因果連鎖分析
│   │   │   ├── ContradictionPage.tsx# 矛盾検出
│   │   │   ├── ActionabilityPage.tsx# アクショナビリティスコアリング
│   │   │   ├── TaxonomyPage.tsx     # タクソノミー生成
│   │   │   ├── AgentPage.tsx        # 自律 AI エージェント
│   │   │   ├── ReportsPage.tsx      # レポート生成・ダウンロード
│   │   │   ├── AdminUsersPage.tsx   # ユーザー管理（Admin）
│   │   │   ├── LoginPage.tsx        # ログイン
│   │   │   └── LandingPage.tsx      # ランディングページ
│   │   ├── components/
│   │   │   ├── AuthGuard.tsx        # 認証ガード (RBAC)
│   │   │   ├── DatasetGuard.tsx     # データセット選択ガード
│   │   │   ├── ErrorBoundary.tsx    # エラーバウンダリ
│   │   │   ├── ToastContainer.tsx   # トースト通知
│   │   │   ├── AnalysisProgress.tsx # 解析プログレス表示
│   │   │   ├── AttributeFilter.tsx  # 属性フィルター
│   │   │   ├── InfoTooltip.tsx      # 情報ツールチップ
│   │   │   └── layout/
│   │   │       └── AppLayout.tsx    # アプリケーションレイアウト
│   │   └── stores/
│   │       ├── authStore.ts         # 認証状態管理
│   │       ├── analysisStore.ts     # 解析状態管理
│   │       └── toastStore.ts        # トースト通知管理
│   ├── __tests__/                   # Vitest テストスイート
│   └── Dockerfile
├── docs/
│   ├── specification.md             # 機能仕様書
│   ├── setup_guide.md               # セットアップガイド
│   ├── analysis_methods_guide.md    # 解析手法ガイド
│   └── demo_scenario.md             # デモシナリオ
├── infra/
│   └── terraform/
│       ├── aws/                     # AWS EKS + Bedrock
│       ├── azure/                   # Azure AKS + Azure Foundry
│       └── gcp/                     # GCP GKE + Vertex AI
├── .github/
│   └── workflows/
│       ├── ci.yml                   # CI (lint, test, build, security scan)
│       ├── deploy.yml               # CD (デプロイ)
│       └── rollback.yml             # ロールバック
├── docker-compose.yml               # 開発用 (4サービス)
├── docker-compose.prod.yml          # 本番用
├── docker-compose.local-llm.yml     # ローカル LLM (Ollama)
├── setup.bat                        # Windows セットアップ
├── start.bat                        # Windows 起動
├── start-docker.bat                 # Docker 起動
├── start-local-llm.bat              # ローカル LLM 起動
├── stop.bat                         # 停止
└── README.md
```

---

## API 概要

### 認証 (`/api/auth`) - 8 endpoints

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/register` | ユーザー登録 | Public |
| POST | `/login` | ログイン（JWT 発行） | Public |
| POST | `/refresh` | トークンリフレッシュ | Authenticated |
| GET | `/me` | 現在のユーザー情報 | Authenticated |
| GET | `/users` | ユーザー一覧 | Admin |
| PUT | `/users/{user_id}/role` | ロール変更 | Admin |
| PUT | `/users/{user_id}/active` | アカウント有効/無効 | Admin |
| POST | `/users/{user_id}/reset-password` | パスワードリセット | Admin |

### データ管理 (`/api/data`) - 5 endpoints

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/import` | ファイルインポート（CSV/Excel） | Authenticated |
| POST | `/{dataset_id}/pii-scan` | PII スキャン | Authenticated |
| GET | `/datasets/{dataset_id}/attributes` | データセット属性取得 | Authenticated |
| DELETE | `/datasets/{dataset_id}` | データセット削除 | Authenticated |
| GET | `/datasets` | データセット一覧 | Authenticated |

### 解析 (`/api/analysis`) - 16 endpoints

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/cluster` | クラスタリング実行 | Authenticated |
| POST | `/cluster/compare` | クラスタ比較 | Authenticated |
| POST | `/sentiment/estimate` | 感情分析（推定コスト） | Authenticated |
| POST | `/sentiment` | 感情分析実行 | Authenticated |
| POST | `/cooccurrence` | 共起ネットワーク分析 | Authenticated |
| POST | `/cooccurrence/timeslice` | 時系列共起分析 | Authenticated |
| POST | `/cooccurrence/name-communities` | コミュニティ命名 | Authenticated |
| POST | `/similarity/search` | テキスト類似性検索 | Authenticated |
| POST | `/causal-chain` | 因果連鎖分析 | Authenticated |
| POST | `/contradiction` | 矛盾検出 | Authenticated |
| POST | `/actionability` | アクショナビリティスコアリング | Authenticated |
| POST | `/taxonomy` | タクソノミー生成 | Authenticated |
| GET | `/stopwords` | ストップワード一覧 | Authenticated |
| PUT | `/stopwords` | ストップワード更新 | Authenticated |
| POST | `/stopwords/reset` | ストップワードリセット | Authenticated |

### エージェント (`/api/agent`) - 7 endpoints

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/start` | 自律分析を開始 | Admin / Analyst |
| POST | `/{agent_id}/approve` | HITL 承認 | Admin / Analyst |
| GET | `/{agent_id}/logs` | エージェントログ取得 | Admin / Analyst |
| POST | `/{agent_id}/save` | セッション保存 | Admin / Analyst |
| GET | `/sessions/list` | セッション一覧 | Admin / Analyst |
| GET | `/sessions/{session_id}` | セッション詳細 | Admin / Analyst |
| POST | `/pipeline` | パイプライン実行 | Admin / Analyst |

### レポート (`/api/reports`) - 2 endpoints

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| POST | `/generate` | レポート生成（PDF / Markdown） | Admin / Analyst |
| GET | `/{report_id}/download` | レポートダウンロード | Admin / Analyst |

### ダッシュボード (`/api/dashboard`) - 1 endpoint

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/summary` | ダッシュボード KPI / 最近のアクティビティ | Authenticated |

### ヘルスチェック (`/health`) - 3 endpoints

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| GET | `/health` | 基本ヘルスチェック | Public |
| GET | `/health/live` | Kubernetes liveness probe | Public |
| GET | `/health/ready` | DB / Redis / LLM 接続確認 | Public |

---

## 開発ガイド

### バックエンドテスト

```bash
# Docker コンテナ内でテスト実行
docker compose exec backend pytest -v

# カバレッジ付き
docker compose exec backend pytest --cov=app --cov-report=html

# 特定テストファイル
docker compose exec backend pytest tests/test_auth.py -v

# ローカル環境（venv）
cd backend
python -m pytest -v
```

### フロントエンドテスト

```bash
# Docker コンテナ内
docker compose exec frontend npm test

# ローカル環境
cd frontend
npm run test          # Vitest 実行
npm run test:coverage # カバレッジ付き
```

### リント / フォーマット

```bash
# Backend (Python)
docker compose exec backend ruff check app/
docker compose exec backend ruff format app/

# Frontend (TypeScript)
docker compose exec frontend npm run lint
```

### CI/CD パイプライン

GitHub Actions による自動化パイプライン（`.github/workflows/ci.yml`）:

| ジョブ | 内容 |
|-------|------|
| Python Lint | ruff によるコード品質チェック |
| Python Test | pytest によるユニット / 統合テスト |
| Frontend Lint | ESLint によるコード品質チェック |
| Frontend Build | Vite ビルド成功確認 |
| Docker Build | マルチステージビルド確認 |
| Security Scan | 依存関係の脆弱性スキャン |

---

## Sprint 履歴

| Sprint | 概要 |
|--------|------|
| Sprint 4 | RBAC、リフレッシュトークン、ErrorBoundary、Vitest、PII スキャン |
| Sprint 5 | 解析パイプライン基盤、Tool Use エージェント、LLM ツール定義 |
| Sprint 6 | 感情分析 5モード、共起ネットワーク、テキスト前処理 |
| Sprint 7 | 因果連鎖分析、矛盾検出、アクショナビリティスコアリング |
| Sprint 8 | タクソノミー生成、パイプラインオーケストレーション |
| Sprint 9 | エージェント HITL モード、Redis 状態管理 |
| Sprint 10 | フロントエンド UI 基盤、ページルーティング、Zustand ストア |
| Sprint 11 | Redis キャッシュ層、解析結果永続化 |
| Sprint 12 | デプロイ修正、Docker マルチステージビルド |
| Sprint 13 | フロントエンドテスト拡充、コンポーネントテスト |
| Sprint 14 | ダッシュボード KPI、最近のアクティビティ表示 |
| Sprint 15 | バグ修正、クラスタ UI 改善、ストップワード管理、D3 ネットワーク |
| Sprint 18 | UX 改善、エージェントポーリング、日本語エラー、PDF 日本語対応 |

---

## セキュリティ

### 認証・認可

| 項目 | 実装 |
|------|------|
| 認証方式 | JWT Bearer トークン（全 API エンドポイント） |
| トークンリフレッシュ | `/api/auth/refresh` による自動更新 |
| RBAC | 3 ロール: Admin / Analyst / Viewer |
| パスワード | bcrypt ハッシュ化 |

### ロールベースアクセス制御 (RBAC)

| ロール | 権限 |
|-------|------|
| Admin | 全機能 + ユーザー管理 + ロール変更 |
| Analyst | 解析実行 + エージェント操作 + レポート生成 |
| Viewer | データ閲覧 + ダッシュボード参照 |

### セキュリティヘッダー (OWASP 準拠)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy` (CSP)
- `Strict-Transport-Security` (HSTS)
- `X-XSS-Protection`
- `Referrer-Policy`

### その他のセキュリティ対策

| 項目 | 説明 |
|------|------|
| PII 検出 | アップロード時に個人情報を自動検出・警告 |
| レート制限 | Redis ベースの API レート制限 |
| correlation_id | 全リクエストにトレーシング ID を付与 |
| DB 接続プーリング | `pool_pre_ping`, `pool_recycle` による堅牢な接続管理 |
| DLQ | Dead Letter Queue による失敗リクエストの保持 |

---

## モニタリング

### ヘルスチェックエンドポイント

| エンドポイント | 用途 | チェック内容 |
|--------------|------|-------------|
| `GET /health` | 基本ヘルスチェック | アプリケーション稼働状態、バージョン情報 |
| `GET /health/live` | Kubernetes liveness probe | プロセス生存確認 |
| `GET /health/ready` | Kubernetes readiness probe | DB / Redis / LLM プロバイダー接続確認 |
| `GET /metrics` | Prometheus メトリクス | リクエスト数、レイテンシ、エラー率（認証不要） |

### レスポンス例

```json
// GET /health
{
  "status": "healthy",
  "version": "7.0.0",
  "cloud_provider": "local",
  "llm_deployment_mode": "cloud"
}

// GET /health/ready
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "llm_provider": "ok"
  }
}
```

---

## クラウド対応

| プロバイダー | コンピュート | AI / LLM | API 管理 | ストレージ |
|------------|------------|----------|---------|-----------|
| AWS | EKS | Bedrock (Claude, Titan) | API Gateway | S3 |
| Azure | AKS | Azure Foundry (GPT) | APIM | Blob Storage |
| GCP | GKE | Vertex AI (Gemini) | Cloud Endpoints | GCS / BigQuery |
| Local | Docker Compose | Ollama / vLLM | Kong / Nginx | PostgreSQL |

### LLM プロバイダー

| プロバイダー | モデル例 | 設定方法 |
|------------|---------|---------|
| Anthropic (Claude) | claude-sonnet-4-20250514 | `ANTHROPIC_API_KEY` |
| OpenAI (GPT) | gpt-4o | `OPENAI_API_KEY` |
| Google (Gemini) | gemini-pro | `GOOGLE_API_KEY` |
| AWS Bedrock | Claude via Bedrock | AWS credentials |
| GCP Vertex AI | Gemini via Vertex | GCP credentials |
| Local (Ollama) | llama3, mistral | `OLLAMA_BASE_URL` |

---

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [docs/specification.md](docs/specification.md) | 機能仕様書（全機能の詳細定義） |
| [docs/setup_guide.md](docs/setup_guide.md) | セットアップガイド（環境構築手順） |
| [docs/analysis_methods_guide.md](docs/analysis_methods_guide.md) | 解析手法ガイド（アルゴリズム解説） |
| [docs/demo_scenario.md](docs/demo_scenario.md) | デモシナリオ（操作手順書） |

---

## ライセンス

Proprietary - All rights reserved.
