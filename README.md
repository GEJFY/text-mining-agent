# NexusText AI v7.0

**Global Multimodal Autonomous Text Analyzer**

テキストマイニングに特化した多言語・マルチモーダル解析プラットフォーム。
LLMを中核に据え、クラスタリング・感情分析・共起ネットワーク等の解析を統合的に提供します。

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (React/TypeScript)                     │
│  - Interactive Canvas / Cross-filtering          │
│  - No-code Analysis Flow Designer               │
│  - Dashboard Builder                             │
├─────────────────────────────────────────────────┤
│  API Gateway (Cloud-native per provider)         │
│  AWS: API Gateway │ Azure: APIM │ GCP: Endpoints│
├─────────────────────────────────────────────────┤
│  Backend (FastAPI / Python 3.11)                 │
│  - LLM Orchestration (multi-model routing)      │
│  - Text Mining Engine                            │
│  - Autonomous Agent (HITL)                       │
│  - Report Generation                             │
├─────────────────────────────────────────────────┤
│  Infrastructure (Terraform multi-cloud)          │
│  AWS / Azure / GCP / Local Docker               │
└─────────────────────────────────────────────────┘
```

## Quick Start

### Local Development (Docker)

```bash
cp .env.example .env
# Edit .env with your API keys
docker compose up -d
```

### Cloud Deployment

```bash
cd infra/terraform/<provider>  # aws | azure | gcp
terraform init
terraform plan
terraform apply
```

## Project Structure

```
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/          # REST API routes (auth, data, analysis, dashboard, etc.)
│   │   ├── core/         # Config, security (JWT), database, telemetry
│   │   ├── middleware/   # Security headers, rate limiting, correlation ID
│   │   ├── services/     # Business logic (LLM orchestrator, text preprocessing)
│   │   ├── models/       # SQLAlchemy ORM & Pydantic schemas
│   │   └── agents/       # Autonomous analysis agent
│   ├── tests/            # pytest (auth, dashboard, security headers, pagination)
│   └── Dockerfile
├── frontend/             # React/TypeScript SPA
│   ├── src/
│   │   ├── pages/        # Dashboard, Cluster, Sentiment, Reports, etc.
│   │   ├── components/   # DatasetGuard, ToastContainer, etc.
│   │   └── stores/       # Zustand (auth, analysis, toast)
│   └── Dockerfile
├── infra/
│   └── terraform/        # Multi-cloud IaC
│       ├── aws/
│       ├── azure/
│       └── gcp/
├── .github/workflows/    # CI pipeline (lint, test, build, security scan)
└── docker-compose.yml
```

## Security

- **JWT認証**: 全API エンドポイントに `Bearer` トークン認証を適用
- **セキュリティヘッダー**: X-Content-Type-Options, X-Frame-Options, CSP 等（OWASP準拠）
- **レート制限**: 非認証エンドポイントへの過剰リクエストを制限
- **DB接続プーリング**: `pool_pre_ping`, `pool_recycle` による堅牢な接続管理

## Monitoring

- `GET /health` — 基本ヘルスチェック
- `GET /health/ready` — DB/Redis/LLM接続確認
- `GET /metrics` — Prometheus メトリクス（認証不要）

## Supported Cloud Providers

| Provider | Compute | AI/LLM | API Management | Storage |
|----------|---------|--------|----------------|---------|
| AWS | EKS | Bedrock | API Gateway | S3 |
| Azure | AKS | Azure Foundry | APIM | Blob Storage |
| GCP | GKE | Vertex AI | Cloud Endpoints | GCS / BigQuery |
| Local | Docker | Ollama/vLLM | Kong/Nginx | PostgreSQL |

## License

Proprietary - All rights reserved.
