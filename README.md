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
│   │   ├── api/          # REST API routes
│   │   ├── core/         # Config, security, cloud abstraction
│   │   ├── services/     # Business logic
│   │   ├── models/       # Pydantic models & DB schemas
│   │   └── agents/       # Autonomous analysis agent
│   ├── tests/
│   └── Dockerfile
├── frontend/             # React/TypeScript SPA
│   ├── src/
│   └── Dockerfile
├── infra/
│   └── terraform/        # Multi-cloud IaC
│       ├── aws/
│       ├── azure/
│       └── gcp/
├── .github/workflows/    # CI/CD pipelines
├── docker-compose.yml
└── docs/
```

## Supported Cloud Providers

| Provider | Compute | AI/LLM | API Management | Storage |
|----------|---------|--------|----------------|---------|
| AWS | EKS | Bedrock | API Gateway | S3 |
| Azure | AKS | Azure Foundry | APIM | Blob Storage |
| GCP | GKE | Vertex AI | Cloud Endpoints | GCS / BigQuery |
| Local | Docker | Ollama/vLLM | Kong/Nginx | PostgreSQL |

## License

Proprietary - All rights reserved.
