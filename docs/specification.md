# NexusText AI v7.0 機能仕様書・API仕様書

**バージョン**: 7.0.0
**最終更新日**: 2026-02-12
**ステータス**: Draft

---

## 目次

1. [システム概要](#1-システム概要)
2. [技術スタック](#2-技術スタック)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [API仕様](#4-api仕様)
5. [データモデル](#5-データモデル)
6. [LLMオーケストレーション](#6-llmオーケストレーション)
7. [セキュリティ仕様](#7-セキュリティ仕様)
8. [マルチクラウド対応](#8-マルチクラウド対応)
9. [非機能要件](#9-非機能要件)

---

## 1. システム概要

### 1.1 プロダクト概要

NexusText AI は、大量のテキストデータに対して自律的にクラスタリング・感情分析・共起ネットワーク分析・レポート生成を実行するテキストマイニングプラットフォームである。自律型AIエージェントが「観測 -> 仮説 -> 探索 -> 検証 -> 統合」の5フェーズ推論ループを実行し、Human-in-the-Loop (HITL) 制御によるガバナンスを提供する。

- **プロダクト名**: NexusText AI
- **バージョン**: 7.0.0
- **アプリケーション名** (設定値): `NexusText AI`

### 1.2 主要機能

| 機能カテゴリ | 概要 |
|---|---|
| データインポート | CSV/Excel/テキストファイルの自動取込、動的カラムマッピング、エンコーディング自動検出 |
| クラスタリング分析 | k-means / HDBSCAN / GMM、UMAP次元削減、LLMラベリング、外れ値検出 |
| 感情分析 | 5モード (Basic/Business/Risk/Custom/Multi-label)、バッチ処理、時系列分析、スパイク検知 |
| 共起ネットワーク | 共起行列、Louvainコミュニティ検知、中心性指標、時間スライス分析 |
| 自律型AIエージェント | 5フェーズ推論ループ、HITL制御 (Full Auto/Semi Auto/Guided)、Groundingスコア |
| レポート生成 | PPTX/PDF/DOCX/Excel出力、テンプレート (VOC/Audit/Compliance/Risk/Custom) |
| LLMオーケストレーション | マルチモデル自動選択、サーキットブレーカー、データ機密度ルーティング |
| マルチクラウド | AWS / Azure / GCP / Local対応、API Gateway抽象化 |

### 1.3 システムアーキテクチャ概観（ASCII図）

```
                          +-----------------------+
                          |    Frontend (React)   |
                          |  Next.js / TypeScript  |
                          +-----------+-----------+
                                      |
                                      | HTTPS / WebSocket
                                      v
                  +-------------------------------------------+
                  |          API Gateway 抽象化レイヤー          |
                  |  AWS API GW / Azure APIM / GCP Endpoints  |
                  +-------------------------------------------+
                                      |
                                      v
              +-----------------------------------------------+
              |            FastAPI Backend (Python)            |
              |                                               |
              |  +----------+  +----------+  +-------------+  |
              |  | Data API |  |Analysis  |  | Agent API   |  |
              |  | Endpoints|  |Endpoints |  | Endpoints   |  |
              |  +----+-----+  +----+-----+  +------+------+  |
              |       |             |                |          |
              |       v             v                v          |
              |  +----------+  +----------+  +-------------+  |
              |  |Data      |  |Clustering|  |Analysis     |  |
              |  |Import    |  |Sentiment |  |Agent        |  |
              |  |Service   |  |Co-occur  |  |(5-Phase)    |  |
              |  +----------+  +----------+  +-------------+  |
              |                     |                |          |
              |                     v                v          |
              |            +---------------------------+       |
              |            | LLM Orchestrator          |       |
              |            | (Multi-model Routing)     |       |
              |            | Circuit Breaker           |       |
              |            +---------------------------+       |
              |                        |                       |
              +-----------------------------------------------+
                                       |
              +------------------------+------------------------+
              |                        |                        |
              v                        v                        v
   +------------------+   +------------------+   +------------------+
   | Anthropic API    |   | OpenAI API       |   | Google Vertex AI |
   | claude-opus-4-6  |   | gpt-5.2          |   | gemini-3.0-pro   |
   | claude-sonnet-4  |   | gpt-5-mini       |   | gemini-3.0-flash |
   +------------------+   +------------------+   +------------------+
              |
              v
   +------------------+
   | Local LLM        |
   | llama-4-405b     |
   | (Ollama/vLLM)    |
   +------------------+

   +-------------------+    +-------------------+    +-----------------+
   | PostgreSQL        |    | Redis             |    | Object Storage  |
   | (asyncpg)         |    | (Cache/Session)   |    | S3/Blob/GCS     |
   +-------------------+    +-------------------+    +-----------------+
```

---

## 2. 技術スタック

### 2.1 バックエンド

| カテゴリ | 技術 | バージョン/備考 |
|---|---|---|
| 言語 | Python | 3.11推奨 |
| Webフレームワーク | FastAPI | 非同期対応 |
| 設定管理 | pydantic-settings | 環境変数ベース、`.env`プレフィックス `NEXUSTEXT_` |
| データベース | PostgreSQL + asyncpg | `postgresql+asyncpg://` |
| キャッシュ | Redis | セッション管理、レート制限 |
| 認証 | python-jose (JWT) | HS256アルゴリズム |
| パスワード | passlib (bcrypt) | ハッシュ化 |

### 2.2 ML/NLPライブラリ

| ライブラリ | 用途 |
|---|---|
| scikit-learn | KMeans, GaussianMixture, silhouette_score |
| hdbscan | HDBSCANクラスタリング |
| umap-learn | UMAP次元削減 |
| numpy | 数値計算、ベクトル演算 |
| pandas | 時系列データ処理 |
| networkx | 共起ネットワークグラフ構築、中心性指標 |
| python-louvain (community) | Louvainコミュニティ検知 |
| sentence-transformers | Embeddingモデル (`paraphrase-multilingual-MiniLM-L12-v2`) |

### 2.3 LLMプロバイダー

| プロバイダー | SDK | モデル |
|---|---|---|
| Anthropic | anthropic (AsyncAnthropic) | claude-opus-4-6, claude-sonnet-4-5-20250929 |
| OpenAI | openai (AsyncOpenAI) | gpt-5.2, gpt-5-mini |
| Google | vertexai (GenerativeModel) | gemini-3.0-pro, gemini-3.0-flash |
| ローカル | httpx (Ollama/vLLM互換) | llama-4-405b |

### 2.4 インフラストラクチャ

| クラウド | API管理 | シークレット管理 | モニタリング | ストレージ |
|---|---|---|---|---|
| AWS | API Gateway | Secrets Manager | CloudWatch | S3 |
| Azure | APIM | Key Vault | Monitor / Log Analytics | Blob Storage |
| GCP | Cloud Endpoints | Secret Manager | Cloud Monitoring | GCS |
| Local | インメモリ | 環境変数 | ログ出力 | ローカルFS |

---

## 3. アーキテクチャ

### 3.1 マルチクラウドアーキテクチャ

NexusText AIは、設定ファイル (`cloud_provider`) の値に応じて、AWS / Azure / GCP / Local のいずれかのクラウドプロバイダーを自動選択する。`BaseAPIGateway` 抽象クラスにより、以下の機能がプロバイダー間で統一されている。

| 抽象メソッド | 機能 |
|---|---|
| `register_api(api_id, backend_url)` | APIをゲートウェイに登録 |
| `check_rate_limit(client_id)` | レート制限チェック |
| `track_usage(client_id, tokens_used, model)` | トークン使用量追跡 |
| `get_usage_report(client_id)` | 使用量レポート取得 |
| `get_secret(secret_name)` | シークレット管理サービスからの値取得 |

プロバイダーの切り替えは環境変数 `NEXUSTEXT_CLOUD_PROVIDER` で制御される。

### 3.2 コンポーネント構成

```
backend/app/
  +-- api/endpoints/
  |     +-- data.py          # データインポート・管理エンドポイント
  |     +-- analysis.py      # クラスタリング・感情・共起分析エンドポイント
  |     +-- agent.py         # 自律型AIエージェントエンドポイント
  |     +-- reports.py       # レポート生成エンドポイント
  +-- agents/
  |     +-- analysis_agent.py  # 5フェーズ推論エージェント
  +-- core/
  |     +-- config.py        # 環境変数ベース設定管理
  |     +-- security.py      # JWT認証・RBAC・PII匿名化
  |     +-- cloud_provider.py # マルチクラウドAPI Gateway抽象化
  |     +-- logging.py       # 構造化ログ
  +-- models/
  |     +-- schemas.py       # Pydanticスキーマ定義
  +-- services/
        +-- data_import.py     # データインポートサービス
        +-- clustering.py      # クラスター分析エンジン
        +-- sentiment.py       # 感情分析エンジン
        +-- cooccurrence.py    # 共起ネットワーク分析エンジン
        +-- llm_orchestrator.py # マルチLLMオーケストレーター
        +-- text_preprocessing.py # テキスト前処理・Embedding生成
        +-- report_generator.py  # レポート生成サービス
```

### 3.3 データフロー

```
[ユーザー] --(ファイルアップロード)--> [DataImport API]
                                         |
                                         v
                               [エンコーディング自動検出]
                               [カラムマッピング適用]
                               [品質チェック(null率,文字数統計)]
                                         |
                                         v
                                   [PostgreSQL格納]
                                         |
            +----------------------------+----------------------------+
            |                            |                            |
            v                            v                            v
    [クラスタリング]              [感情分析]                 [共起ネットワーク]
    Embedding生成 ->              LLMバッチ分類 ->          トークナイズ ->
    UMAP次元削減 ->               時系列構築 ->              共起行列 ->
    KMeans/HDBSCAN/GMM ->        スパイク検知               Louvain検知
    LLMラベリング                                            中心性計算
            |                            |                            |
            +----------------------------+----------------------------+
                                         |
                                         v
                              [自律型AIエージェント]
                              Phase 1: 観測 (Observe)
                              Phase 2: 仮説 (Hypothesize)
                                    | HITL承認 |
                              Phase 3: 探索 (Explore)
                              Phase 4: 検証 (Verify)
                              Phase 5: 統合 (Synthesize)
                                         |
                                         v
                               [レポート生成]
                               PPTX / PDF / DOCX / Excel
```

---

## 4. API仕様

### 4.1 ヘルスチェック

#### `GET /datasets`

データセット一覧を取得する。

**レスポンスボディ**:

```json
{
  "datasets": [],
  "message": "Database integration required"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `datasets` | `array` | データセット一覧 |
| `message` | `string` | ステータスメッセージ |

---

### 4.2 データインポート

#### `POST /import`

ファイルをインポートし、データセットを作成する。

**リクエスト形式**: `multipart/form-data`

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `file` | `UploadFile` | Yes | - | アップロードファイル (CSV/Excel等) |
| `column_mappings` | `string` (JSON) | No | `"[]"` | カラムマッピング定義のJSON文字列 |
| `encoding` | `string \| null` | No | `null` (自動検出) | ファイルエンコーディング |

**`column_mappings` のJSON構造** (配列):

```json
[
  {
    "column_name": "comment_text",
    "role": "text"
  },
  {
    "column_name": "created_at",
    "role": "date"
  }
]
```

| フィールド | 型 | 説明 |
|---|---|---|
| `column_name` | `string` | カラム名 |
| `role` | `ColumnRole` | カラムの役割。値: `"text"`, `"date"`, `"attribute"`, `"id"`, `"weight"` |

**レスポンスボディ** (`DataImportResponse`):

```json
{
  "dataset_id": "uuid-string",
  "total_rows": 1500,
  "null_rate": 0.02,
  "char_count_stats": {
    "mean": 120.5,
    "std": 45.2,
    "min": 10.0,
    "max": 500.0
  },
  "unique_values": {
    "category": 15,
    "region": 8
  },
  "preview": [
    {"id": 1, "text": "サンプルテキスト..."}
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `dataset_id` | `string` | 生成されたデータセットID |
| `total_rows` | `int` | 総行数 |
| `null_rate` | `float` | 全体のnull率 |
| `char_count_stats` | `dict[string, float]` | テキストカラムの文字数統計 (mean, std, min, max) |
| `unique_values` | `dict[string, int]` | 各属性カラムのユニーク値数 |
| `preview` | `list[dict]` | データプレビュー (先頭行) |

**エラーコード**:

| コード | 説明 |
|---|---|
| 400 | ファイル形式不正、カラムマッピングのJSON解析失敗 |
| 413 | ファイルサイズ超過 |
| 422 | バリデーションエラー |
| 500 | サーバー内部エラー |

---

### 4.3 クラスタリング分析

#### `POST /cluster`

クラスター分析を実行する。Embedding生成、UMAP次元削減、クラスタリング、LLMラベリングのフルパイプラインを処理する。

**リクエストボディ** (`ClusterRequest`):

```json
{
  "dataset_id": "uuid-string",
  "algorithm": "kmeans",
  "n_clusters": 5,
  "umap_n_neighbors": 15,
  "umap_min_dist": 0.1,
  "embedding_model": null
}
```

| フィールド | 型 | 必須 | デフォルト | 制約 | 説明 |
|---|---|---|---|---|---|
| `dataset_id` | `string` | Yes | - | - | 対象データセットID |
| `algorithm` | `ClusterAlgorithm` | No | `"kmeans"` | `"kmeans"`, `"hdbscan"`, `"gmm"` | クラスタリングアルゴリズム |
| `n_clusters` | `int \| null` | No | `5` | `ge=2, le=50` | クラスター数 (HDBSCANの場合は自動) |
| `umap_n_neighbors` | `int` | No | `15` | `ge=2, le=200` | UMAPの近傍数 |
| `umap_min_dist` | `float` | No | `0.1` | `ge=0.0, le=1.0` | UMAPの最小距離 |
| `embedding_model` | `string \| null` | No | `null` | - | Embeddingモデル (null時はデフォルト使用) |

**レスポンスボディ** (`ClusterResult`):

```json
{
  "job_id": "uuid-string",
  "algorithm": "kmeans",
  "clusters": [
    {
      "cluster_id": 0,
      "title": "顧客満足度に関する声",
      "summary": "製品の品質やサービス対応に対する肯定的なフィードバックが中心のクラスター",
      "keywords": ["品質", "対応", "満足", "サービス", "改善"],
      "size": 150,
      "centroid_texts": ["代表テキスト1...", "代表テキスト2..."]
    }
  ],
  "outliers": [
    {
      "index": 42,
      "text": "外れ値テキスト（200文字まで）",
      "cluster_id": 2,
      "distance": 3.45
    }
  ],
  "umap_coordinates": [[1.23, -0.45], [2.34, 0.67]],
  "cluster_assignments": [0, 1, 0, 2, 1],
  "silhouette_score": 0.72
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `job_id` | `string` | ジョブID |
| `algorithm` | `ClusterAlgorithm` | 使用したアルゴリズム |
| `clusters` | `list[ClusterLabel]` | 各クラスターの情報 (後述) |
| `outliers` | `list[dict]` | 外れ値テキスト一覧 (上位20件、距離降順) |
| `umap_coordinates` | `list[list[float]]` | UMAP 2次元座標 |
| `cluster_assignments` | `list[int]` | 各テキストのクラスター割当 |
| `silhouette_score` | `float` | シルエットスコア |

**`ClusterLabel` オブジェクト**:

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| `cluster_id` | `int` | - | クラスターID |
| `title` | `string` | `max_length=15` | LLM生成のタイトル (15字以内) |
| `summary` | `string` | `max_length=100` | LLM生成の要約 (100字以内) |
| `keywords` | `list[string]` | 最大5個 | LLM生成のキーワード |
| `size` | `int` | - | クラスター内テキスト数 |
| `centroid_texts` | `list[string]` | 最大5件、200文字まで | セントロイドに最も近い代表テキスト |

**エラーコード**:

| コード | 説明 |
|---|---|
| 404 | 指定されたdataset_idが存在しない |
| 422 | バリデーションエラー (n_clustersの範囲外等) |
| 500 | クラスタリング処理またはLLM呼び出し失敗 |

#### `POST /cluster/compare`

2つのクラスターを比較分析する。

**リクエストパラメータ** (Query):

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `dataset_id` | `string` | Yes | データセットID |
| `cluster_a` | `int` | Yes | 比較対象クラスターA |
| `cluster_b` | `int` | Yes | 比較対象クラスターB |

**レスポンスボディ**:

```json
{
  "common_themes": ["共通テーマ1", "共通テーマ2"],
  "unique_to_a": ["クラスターA固有のテーマ"],
  "unique_to_b": ["クラスターB固有のテーマ"],
  "summary": "比較の要約テキスト"
}
```

---

### 4.4 感情分析

#### `POST /sentiment/estimate`

感情分析実行前のコスト・時間見積りを取得する。

**リクエストボディ** (`SentimentRequest`):

```json
{
  "dataset_id": "uuid-string",
  "mode": "basic",
  "custom_axes": null,
  "multi_label": false
}
```

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `dataset_id` | `string` | Yes | - | 対象データセットID |
| `mode` | `SentimentMode` | No | `"basic"` | 分析モード。値: `"basic"`, `"business"`, `"risk"`, `"custom"`, `"multi_label"` |
| `custom_axes` | `list[SentimentAxisDefinition] \| null` | No | `null` | カスタム感情軸定義 (mode=`"custom"`時に使用) |
| `multi_label` | `bool` | No | `false` | マルチラベル判定を有効にするか |

**`SentimentAxisDefinition` オブジェクト**:

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `name` | `string` | Yes | - | 感情軸名 |
| `description` | `string` | No | `""` | 説明 |
| `criteria` | `string` | No | `""` | 判定基準 |

**レスポンスボディ** (`SentimentEstimate`):

```json
{
  "total_records": 1500,
  "estimated_tokens": 450000,
  "estimated_cost_usd": 1.35,
  "estimated_time_seconds": 150
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `total_records` | `int` | 対象レコード数 |
| `estimated_tokens` | `int` | 推定トークン使用量 |
| `estimated_cost_usd` | `float` | 推定コスト (USD) |
| `estimated_time_seconds` | `int` | 推定処理時間 (秒) |

**コスト算出ロジック**:

- 1テキストあたりの平均トークン数 = `平均文字数 / 2`
- システムトークン = `200 + 感情軸数 * 50`
- 総トークン数 = `(システムトークン + 平均トークン/テキスト + 100) * レコード数`
- 推定コスト = `総トークン数 * $3.0 / 1,000,000` (Sonnet入力単価基準)
- 推定処理時間 = `max(1, レコード数 / 10)` 秒

#### `POST /sentiment`

感情分析を実行する。

**リクエストボディ** (`SentimentRequest`): 上記と同じ。

**レスポンスボディ** (`SentimentResult`):

```json
{
  "job_id": "uuid-string",
  "mode": "business",
  "axes": ["満足", "不満", "要望", "質問", "その他"],
  "results": [
    {
      "record_id": "rec-001",
      "labels": ["不満"],
      "scores": {"不満": 0.92, "要望": 0.35},
      "evidence_highlights": [
        {"label": "不満", "highlight": "対応が遅すぎる"}
      ]
    }
  ],
  "distribution": {
    "満足": 450,
    "不満": 300,
    "要望": 200,
    "質問": 100,
    "その他": 50
  },
  "time_series": [
    {
      "period": "2025-01",
      "count": 120,
      "distribution": {"満足": 50, "不満": 30, "要望": 25, "質問": 10, "その他": 5}
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `job_id` | `string` | ジョブID |
| `mode` | `SentimentMode` | 使用した分析モード |
| `axes` | `list[string]` | 使用した感情軸名一覧 |
| `results` | `list[SentimentResultItem]` | 個別レコードの分析結果 |
| `distribution` | `dict[string, int]` | ラベル別分布 |
| `time_series` | `list[dict] \| null` | 時系列データ (日付情報がある場合) |

**`SentimentResultItem` オブジェクト**:

| フィールド | 型 | 説明 |
|---|---|---|
| `record_id` | `string` | レコードID |
| `labels` | `list[string]` | 付与されたラベル |
| `scores` | `dict[string, float]` | 各軸のスコア (0.0-1.0) |
| `evidence_highlights` | `list[dict[string, string]]` | 判定根拠のハイライト |

**プリセット感情軸**:

| モード | 軸名一覧 |
|---|---|
| `basic` | Positive, Negative, Neutral |
| `business` | 満足, 不満, 要望, 質問, その他 |
| `risk` | コンプライアンスリスク, 不正兆候, 統制不備, 改善要望 |
| `custom` | ユーザー定義 (`custom_axes` で指定) |
| `multi_label` | 上記いずれかのモードと `multi_label: true` の組み合わせ |

**バッチ処理仕様**:

- バッチサイズ: 10件ずつ
- LLMタスク種別: `BATCH_CLASSIFICATION`
- 1テキストあたり最大500文字をLLMに送信

**エラーコード**:

| コード | 説明 |
|---|---|
| 404 | 指定されたdataset_idが存在しない |
| 422 | バリデーションエラー |
| 500 | LLM呼び出し失敗 |

---

### 4.5 共起ネットワーク分析

#### `POST /cooccurrence`

共起ネットワーク分析を実行する。

**リクエストボディ** (`CooccurrenceRequest`):

```json
{
  "dataset_id": "uuid-string",
  "min_frequency": 3,
  "window_size": 5,
  "time_slice": false,
  "time_interval": null
}
```

| フィールド | 型 | 必須 | デフォルト | 制約 | 説明 |
|---|---|---|---|---|---|
| `dataset_id` | `string` | Yes | - | - | 対象データセットID |
| `min_frequency` | `int` | No | `3` | `ge=1` | 最小共起頻度 (フィルタ閾値) |
| `window_size` | `int` | No | `5` | `ge=2, le=20` | 共起ウィンドウサイズ |
| `time_slice` | `bool` | No | `false` | - | 時間スライス分析を有効にするか |
| `time_interval` | `string \| null` | No | `null` | `"month"`, `"week"`, `"day"` | 時間スライスの間隔 |

**レスポンスボディ** (`CooccurrenceResult`):

```json
{
  "nodes": [
    {
      "word": "品質",
      "frequency": 45,
      "degree_centrality": 0.85,
      "betweenness_centrality": 0.32,
      "community_id": 0
    }
  ],
  "edges": [
    {
      "source": "品質",
      "target": "改善",
      "weight": 12
    }
  ],
  "communities": {
    "0": ["品質", "改善", "製品"],
    "1": ["対応", "サービス", "速度"]
  },
  "modularity": 0.65
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `nodes` | `list[NetworkNode]` | ネットワークノード一覧 |
| `edges` | `list[NetworkEdge]` | ネットワークエッジ一覧 |
| `communities` | `dict[int, list[string]]` | Louvainコミュニティ検知結果 |
| `modularity` | `float` | モジュラリティ値 |

**`NetworkNode` オブジェクト**:

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `word` | `string` | - | 単語 |
| `frequency` | `int` | - | 出現頻度 |
| `degree_centrality` | `float` | `0.0` | 次数中心性 |
| `betweenness_centrality` | `float` | `0.0` | 媒介中心性 |
| `community_id` | `int` | `0` | 所属コミュニティID |

**`NetworkEdge` オブジェクト**:

| フィールド | 型 | 説明 |
|---|---|---|
| `source` | `string` | ソースノード (単語) |
| `target` | `string` | ターゲットノード (単語) |
| `weight` | `int` | 共起頻度 (重み) |

**処理フロー**:

1. テキストのトークナイズ (MeCab等)
2. ストップワード除去
3. ウィンドウ内の共起ペア集計
4. `min_frequency` 以上のペアでフィルタリング
5. NetworkXグラフ構築
6. 次数中心性・媒介中心性の算出
7. Louvainコミュニティ検知
8. モジュラリティ値の計算

#### `POST /cooccurrence/timeslice`

時間スライスによる共起ネットワークの変遷を分析する。

**リクエストボディ**: `CooccurrenceRequest` (上記と同じ)

**レスポンスボディ**:

```json
[
  {
    "period": "2025-01",
    "nodes": 25,
    "edges": 48,
    "modularity": 0.58,
    "network": { "...CooccurrenceResultの全データ..." }
  }
]
```

| フィールド | 型 | 説明 |
|---|---|---|
| `period` | `string` | 期間ラベル |
| `nodes` | `int` | ノード数 |
| `edges` | `int` | エッジ数 |
| `modularity` | `float` | モジュラリティ値 |
| `network` | `CooccurrenceResult` | その期間の完全なネットワークデータ |

**時間間隔マッピング**:

| `time_interval` 値 | pandasの周期 |
|---|---|
| `"month"` | `"M"` |
| `"week"` | `"W"` |
| `"day"` | `"D"` |

#### `POST /similarity/search`

テキスト類似性検索を実行する。

**リクエストパラメータ** (Query):

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `dataset_id` | `string` | Yes | - | データセットID |
| `query` | `string` | Yes | - | 検索クエリテキスト |
| `top_k` | `int` | No | `10` | 上位件数 |
| `threshold` | `float` | No | `0.5` | コサイン類似度の閾値 |

**レスポンスボディ**:

```json
{
  "query": "検索テキスト",
  "results": [],
  "message": "Database integration required"
}
```

---

### 4.6 自律型AIエージェント

#### `POST /start`

自律分析を開始する。5フェーズ推論ループ (観測 -> 仮説 -> 探索 -> 検証 -> 統合) を実行する。

**リクエストボディ** (`AnalysisRequest`):

```json
{
  "dataset_id": "uuid-string",
  "objective": "顧客満足度の低下要因を特定する",
  "hitl_mode": "semi_auto"
}
```

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `dataset_id` | `string` | Yes | - | 対象データセットID |
| `objective` | `string` | No | `""` | 分析目的 (空の場合は自由探索) |
| `hitl_mode` | `string` | No | `"semi_auto"` | HITL制御モード。値: `"full_auto"`, `"semi_auto"`, `"guided"` |

**HITL制御モード**:

| モード | 動作 |
|---|---|
| `full_auto` | 全フェーズを自動実行。承認なしで完了まで進行 |
| `semi_auto` | 仮説生成後に一時停止。ユーザー承認後に探索以降を実行 |
| `guided` | 仮説生成後に一時停止。ユーザー承認後に探索以降を実行 (semi_autoと同じ承認フロー) |

**レスポンスボディ**:

```json
{
  "agent_id": "uuid-string",
  "state": "completed",
  "insights": [
    {
      "title": "インサイトタイトル",
      "description": "詳細な説明...",
      "evidence": ["裏付けエビデンス1", "裏付けエビデンス2"],
      "grounding_score": 0.85,
      "recommendations": ["推奨アクション1", "推奨アクション2"]
    }
  ],
  "pending_approval": null,
  "logs": [
    {
      "timestamp": "2026-02-12T10:30:00Z",
      "phase": "observe",
      "thought": "データ全体の統計と特徴をスキャンします",
      "action": null,
      "result": "['観測1', '観測2']",
      "confidence": 0.0
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `agent_id` | `string` | エージェントID |
| `state` | `AgentState` | エージェント状態。値: `"idle"`, `"running"`, `"awaiting_approval"`, `"completed"`, `"error"` |
| `insights` | `list[AgentInsight]` | 導出されたインサイト (semi_auto/guidedで承認待ちの場合は空配列) |
| `pending_approval` | `dict \| null` | 承認待ち情報 (仮説一覧・メッセージ) |
| `logs` | `list[AgentLogEntry]` | エージェントのログエントリー |

**`AgentInsight` オブジェクト**:

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| `title` | `string` | - | インサイトのタイトル |
| `description` | `string` | - | 詳細説明 |
| `evidence` | `list[string]` | - | 裏付けエビデンス |
| `grounding_score` | `float` | `ge=0.0, le=1.0` | Groundingスコア (ハルシネーション検知) |
| `recommendations` | `list[string]` | デフォルト `[]` | 推奨アクション |

**`AgentLogEntry` オブジェクト**:

| フィールド | 型 | 説明 |
|---|---|---|
| `timestamp` | `datetime` | タイムスタンプ (UTC) |
| `phase` | `AgentPhase` | フェーズ。値: `"observe"`, `"hypothesize"`, `"explore"`, `"verify"`, `"synthesize"` |
| `thought` | `string` | エージェントの思考内容 |
| `action` | `string \| null` | 実行したアクション |
| `result` | `string \| null` | 結果 |
| `confidence` | `float` | 確信度 (デフォルト: `0.0`) |

#### `POST /{agent_id}/approve`

HITL承認: 仮説を承認して分析を再開する。

**パスパラメータ**:

| パラメータ | 型 | 説明 |
|---|---|---|
| `agent_id` | `string` | エージェントID |

**リクエストパラメータ** (Query):

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `approved_hypotheses` | `list[string]` | Yes | 承認された仮説のリスト |

**レスポンスボディ**:

```json
{
  "agent_id": "uuid-string",
  "state": "completed",
  "insights": [ "...AgentInsightの配列..." ],
  "logs": [ "...AgentLogEntryの配列..." ]
}
```

**エラーレスポンス**:

```json
{
  "error": "Agent not found"
}
```

#### `GET /{agent_id}/logs`

エージェントのログを取得する。

**パスパラメータ**:

| パラメータ | 型 | 説明 |
|---|---|---|
| `agent_id` | `string` | エージェントID |

**レスポンスボディ**:

```json
{
  "agent_id": "uuid-string",
  "state": "running",
  "logs": [ "...AgentLogEntryの配列..." ]
}
```

---

### 4.7 レポート生成

#### `POST /generate`

分析結果からレポートを生成する。

**リクエストボディ** (`ReportRequest`):

```json
{
  "dataset_id": "uuid-string",
  "template": "voc",
  "output_format": "pdf",
  "custom_prompt": null,
  "include_evidence_links": true
}
```

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `dataset_id` | `string` | Yes | - | 対象データセットID |
| `template` | `ReportTemplate` | No | `"voc"` | テンプレート。値: `"voc"`, `"audit"`, `"compliance"`, `"risk"`, `"custom"` |
| `output_format` | `ReportFormat` | No | `"pdf"` | 出力形式。値: `"pptx"`, `"pdf"`, `"docx"`, `"excel"` |
| `custom_prompt` | `string \| null` | No | `null` | カスタムプロンプト (template=`"custom"`時に使用) |
| `include_evidence_links` | `bool` | No | `true` | エビデンスリンクを含めるか |

**レスポンスボディ** (`ReportResponse`):

```json
{
  "report_id": "uuid-string",
  "download_url": "/reports/uuid-string/download",
  "format": "pdf",
  "generated_at": "2026-02-12T10:30:00Z"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `report_id` | `string` | レポートID |
| `download_url` | `string` | ダウンロードURL |
| `format` | `ReportFormat` | 出力形式 |
| `generated_at` | `datetime` | 生成日時 |

#### `GET /{report_id}/download`

レポートファイルをダウンロードする。

**パスパラメータ**:

| パラメータ | 型 | 説明 |
|---|---|---|
| `report_id` | `string` | レポートID |

**レスポンス**: `FileResponse` (バイナリファイル)

- Content-Type: `application/octet-stream`
- ファイル名: `nexustext_report{拡張子}`
- 対応拡張子: `.pdf`, `.pptx`, `.docx`, `.xlsx`

**エラーコード**:

| コード | 説明 |
|---|---|
| 404 | 指定されたreport_idのファイルが存在しない |

---

## 5. データモデル

### 5.1 Enumeration型

#### ColumnRole

カラムの役割定義。

| 値 | 説明 |
|---|---|
| `"text"` | テキストカラム (分析対象) |
| `"date"` | 日付カラム (時系列分析用) |
| `"attribute"` | 属性カラム (セグメント分析用) |
| `"id"` | IDカラム (レコード識別子) |
| `"weight"` | 重みカラム (加重分析用) |

#### ClusterAlgorithm

クラスタリングアルゴリズム。

| 値 | 説明 | 特徴 |
|---|---|---|
| `"kmeans"` | K-Means | クラスター数指定必須 (`n_clusters`)。`n_init=10`、`random_state=42` |
| `"hdbscan"` | HDBSCAN | 密度ベース。クラスター数自動決定。`min_cluster_size=10`、ノイズラベル`-1` |
| `"gmm"` | Gaussian Mixture Model | 確率的クラスタリング。`random_state=42` |

#### SentimentMode

感情分析モード。

| 値 | 説明 |
|---|---|
| `"basic"` | 基本3軸 (Positive / Negative / Neutral) |
| `"business"` | ビジネス5軸 (満足 / 不満 / 要望 / 質問 / その他) |
| `"risk"` | リスク4軸 (コンプライアンスリスク / 不正兆候 / 統制不備 / 改善要望) |
| `"custom"` | ユーザー定義の感情軸 |
| `"multi_label"` | マルチラベル分類 |

#### AgentPhase

エージェントの推論フェーズ。

| 値 | 説明 |
|---|---|
| `"observe"` | 観測: データの統計・特徴をスキャン |
| `"hypothesize"` | 仮説: 観測から検証可能な仮説を生成 |
| `"explore"` | 探索: 仮説の検証に必要なデータ探索を実行 |
| `"verify"` | 検証: 探索結果を統計的に検証 |
| `"synthesize"` | 統合: 発見事項をインサイトとして構造化 |

#### AgentState

エージェントの状態。

| 値 | 説明 |
|---|---|
| `"idle"` | 待機中 |
| `"running"` | 実行中 |
| `"awaiting_approval"` | 承認待ち (HITL) |
| `"completed"` | 完了 |
| `"error"` | エラー |

#### ReportTemplate

レポートテンプレート。

| 値 | 説明 |
|---|---|
| `"voc"` | Voice of Customer (顧客の声) |
| `"audit"` | 監査レポート |
| `"compliance"` | コンプライアンスレポート |
| `"risk"` | リスク分析レポート |
| `"custom"` | カスタムテンプレート |

#### ReportFormat

レポート出力形式。

| 値 | 拡張子 |
|---|---|
| `"pptx"` | `.pptx` |
| `"pdf"` | `.pdf` |
| `"docx"` | `.docx` |
| `"excel"` | `.xlsx` |

#### HITLMode (config)

Human-in-the-Loop 制御モード。

| 値 | 説明 |
|---|---|
| `"full_auto"` | 全自動実行 |
| `"semi_auto"` | 半自動 (仮説承認で一時停止) |
| `"guided"` | ガイド付き (仮説承認で一時停止) |

#### CloudProvider (config)

対応クラウドプロバイダー。

| 値 | 説明 |
|---|---|
| `"aws"` | Amazon Web Services |
| `"azure"` | Microsoft Azure |
| `"gcp"` | Google Cloud Platform |
| `"local"` | ローカル開発環境 |

#### TaskType (LLM Orchestrator)

LLMタスク種別。

| 値 | 用途 | 優先モデル |
|---|---|---|
| `"labeling"` | クラスターラベリング・要約 | claude-opus-4-6 |
| `"summarization"` | レポート生成・要約 | claude-opus-4-6 |
| `"batch_classification"` | 感情分析バッチ処理 | claude-sonnet-4-5-20250929 |
| `"pii_detection"` | PII検知 | gpt-5-mini |
| `"translation"` | 多言語翻訳 | gpt-5.2 |
| `"vision"` | 画像読取 | gemini-3.0-pro |
| `"confidential"` | 機密データ処理 | llama-4-405b (ローカル) |
| `"chat"` | 対話応答 | claude-sonnet-4-5-20250929 |

#### DataSensitivity (LLM Orchestrator)

データ機密度レベル。

| 値 | 説明 | ルーティング動作 |
|---|---|---|
| `"public"` | 公開データ | タスク種別に基づくモデル選択 |
| `"internal"` | 社内データ | タスク種別に基づくモデル選択 (デフォルト) |
| `"confidential"` | 機密データ | タスク種別に基づくモデル選択 |
| `"restricted"` | 制限付きデータ | **ローカルモデル (llama-4-405b) を強制** |

#### UserRole (Security)

ユーザーロール。

| 値 | 説明 |
|---|---|
| `"admin"` | 管理者 |
| `"analyst"` | 分析者 |
| `"viewer"` | 閲覧者 |

### 5.2 Pydanticスキーマ一覧

#### ColumnMapping

動的カラムマッピング定義。

```python
class ColumnMapping(BaseModel):
    column_name: str
    role: ColumnRole
```

#### DataImportRequest

データインポートリクエスト。

```python
class DataImportRequest(BaseModel):
    file_name: str
    column_mappings: list[ColumnMapping]
    encoding: str | None = None  # 自動検出
```

#### DataImportResponse

データインポートレスポンス。

```python
class DataImportResponse(BaseModel):
    dataset_id: str
    total_rows: int
    null_rate: float
    char_count_stats: dict[str, float]
    unique_values: dict[str, int]
    preview: list[dict]
```

#### ClusterRequest

クラスター分析リクエスト。

```python
class ClusterRequest(BaseModel):
    dataset_id: str
    algorithm: ClusterAlgorithm = ClusterAlgorithm.KMEANS
    n_clusters: int | None = Field(default=5, ge=2, le=50)
    umap_n_neighbors: int = Field(default=15, ge=2, le=200)
    umap_min_dist: float = Field(default=0.1, ge=0.0, le=1.0)
    embedding_model: str | None = None
```

#### ClusterLabel

クラスターラベル (LLM生成)。

```python
class ClusterLabel(BaseModel):
    cluster_id: int
    title: str = Field(max_length=15)
    summary: str = Field(max_length=100)
    keywords: list[str]
    size: int
    centroid_texts: list[str]
```

#### ClusterResult

クラスター分析結果。

```python
class ClusterResult(BaseModel):
    job_id: str
    algorithm: ClusterAlgorithm
    clusters: list[ClusterLabel]
    outliers: list[dict]
    umap_coordinates: list[list[float]]
    cluster_assignments: list[int]
    silhouette_score: float
```

#### SentimentAxisDefinition

感情軸定義。

```python
class SentimentAxisDefinition(BaseModel):
    name: str
    description: str = ""
    criteria: str = ""
```

#### SentimentRequest

感情分析リクエスト。

```python
class SentimentRequest(BaseModel):
    dataset_id: str
    mode: SentimentMode = SentimentMode.BASIC
    custom_axes: list[SentimentAxisDefinition] | None = None
    multi_label: bool = False
```

#### SentimentEstimate

実行前のコスト見積り。

```python
class SentimentEstimate(BaseModel):
    total_records: int
    estimated_tokens: int
    estimated_cost_usd: float
    estimated_time_seconds: int
```

#### SentimentResultItem

個別レコードの感情分析結果。

```python
class SentimentResultItem(BaseModel):
    record_id: str
    labels: list[str]
    scores: dict[str, float]
    evidence_highlights: list[dict[str, str]] = []
```

#### SentimentResult

感情分析結果。

```python
class SentimentResult(BaseModel):
    job_id: str
    mode: SentimentMode
    axes: list[str]
    results: list[SentimentResultItem]
    distribution: dict[str, int]
    time_series: list[dict] | None = None
```

#### CooccurrenceRequest

共起ネットワーク分析リクエスト。

```python
class CooccurrenceRequest(BaseModel):
    dataset_id: str
    min_frequency: int = Field(default=3, ge=1)
    window_size: int = Field(default=5, ge=2, le=20)
    time_slice: bool = False
    time_interval: str | None = None  # month, week, day
```

#### NetworkNode

ネットワークのノード。

```python
class NetworkNode(BaseModel):
    word: str
    frequency: int
    degree_centrality: float = 0.0
    betweenness_centrality: float = 0.0
    community_id: int = 0
```

#### NetworkEdge

ネットワークのエッジ。

```python
class NetworkEdge(BaseModel):
    source: str
    target: str
    weight: int
```

#### CooccurrenceResult

共起ネットワーク結果。

```python
class CooccurrenceResult(BaseModel):
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]
    communities: dict[int, list[str]]
    modularity: float
```

#### AnalysisRequest

自律分析リクエスト。

```python
class AnalysisRequest(BaseModel):
    dataset_id: str
    objective: str = ""
    hitl_mode: str = "semi_auto"
```

#### AgentLogEntry

エージェントのログエントリー。

```python
class AgentLogEntry(BaseModel):
    timestamp: datetime
    phase: AgentPhase
    thought: str
    action: str | None = None
    result: str | None = None
    confidence: float = 0.0
```

#### AgentInsight

エージェントが導出したインサイト。

```python
class AgentInsight(BaseModel):
    title: str
    description: str
    evidence: list[str]
    grounding_score: float = Field(ge=0.0, le=1.0)
    recommendations: list[str] = []
```

#### ReportRequest

レポート生成リクエスト。

```python
class ReportRequest(BaseModel):
    dataset_id: str
    template: ReportTemplate = ReportTemplate.VOC
    output_format: ReportFormat = ReportFormat.PDF
    custom_prompt: str | None = None
    include_evidence_links: bool = True
```

#### ReportResponse

レポート生成レスポンス。

```python
class ReportResponse(BaseModel):
    report_id: str
    download_url: str
    format: ReportFormat
    generated_at: datetime
```

#### TokenData (Security)

JWTトークンデータ。

```python
class TokenData(BaseModel):
    user_id: str
    role: UserRole
    tenant_id: str
    exp: datetime
```

#### APIGatewayConfig (Cloud Provider)

API Gateway共通設定。

```python
@dataclass
class APIGatewayConfig:
    rate_limit_per_minute: int = 100
    token_budget_per_hour: int = 1_000_000
    enable_caching: bool = True
    cache_ttl_seconds: int = 300
```

#### AgentContext (Analysis Agent)

エージェントの実行コンテキスト。

```python
@dataclass
class AgentContext:
    dataset_id: str
    objective: str
    texts: list[str] = field(default_factory=list)
    attributes: dict[str, list] = field(default_factory=dict)
    cluster_results: dict | None = None
    sentiment_results: dict | None = None
    cooccurrence_results: dict | None = None
    observations: list[str] = field(default_factory=list)
    hypotheses: list[str] = field(default_factory=list)
    findings: list[str] = field(default_factory=list)
```

---

## 6. LLMオーケストレーション

### 6.1 概要

`LLMOrchestrator` は、タスク種別 (`TaskType`) とデータ機密度 (`DataSensitivity`) に基づいて最適なLLMモデルを自動選択し、サーキットブレーカーによるフォールトトレランスを提供するマルチモデルルーティング層である。

### 6.2 タスク種別ルーティング

各タスク種別には優先度順のモデルリストが割り当てられている。サーキットブレーカーが開いているモデルはスキップされ、次の候補に自動フォールバックする。

| タスク種別 | 第1候補 | 第2候補 | 第3候補 |
|---|---|---|---|
| `labeling` | claude-opus-4-6 | gpt-5.2 | gemini-3.0-pro |
| `summarization` | claude-opus-4-6 | gemini-3.0-pro | gpt-5.2 |
| `batch_classification` | claude-sonnet-4-5-20250929 | gpt-5-mini | gemini-3.0-flash |
| `pii_detection` | gpt-5-mini | claude-sonnet-4-5-20250929 | - |
| `translation` | gpt-5.2 | claude-opus-4-6 | gemini-3.0-pro |
| `vision` | gemini-3.0-pro | gpt-5.2 | claude-opus-4-6 |
| `confidential` | llama-4-405b | - | - |
| `chat` | claude-sonnet-4-5-20250929 | gpt-5-mini | - |

### 6.3 モデル優先度とフォールバック

```
[リクエスト受信]
       |
       v
[タスク種別を判定]
       |
       v
[データ機密度チェック]
  |--- restricted --> [llama-4-405b (ローカル) 強制]
  |--- その他 -------->
       |
       v
[候補モデルリストを取得]
       |
       v
[サーキットブレーカーチェック]
  |--- 開 (Open) --> [次の候補モデルへ]
  |--- 閉/半開 ----> [モデル呼び出し]
       |
       +-- 成功 --> [結果返却 + CB成功記録]
       +-- 失敗 --> [CB失敗記録 + フォールバックモデルで再試行]
```

### 6.4 サーキットブレーカー

各モデルごとに独立したサーキットブレーカーが管理される。

| パラメータ | 値 | 説明 |
|---|---|---|
| `failure_threshold` | `3` | サーキットブレーカーが開くまでの連続失敗回数 |
| リカバリ待機時間 | `60秒` | Open状態から Half-Open への移行時間 |

**状態遷移**:

```
[Closed] --(連続3回失敗)--> [Open] --(60秒経過)--> [Half-Open]
                                                         |
                                                    成功: [Closed]
                                                    失敗: [Open]
```

- `record_failure()`: 失敗カウントをインクリメント。閾値到達でOpen状態に遷移。
- `record_success()`: 失敗カウントをリセット。Closed状態に遷移。
- `can_proceed()`: Closed状態またはOpen状態から60秒経過した場合に`True`を返す。

### 6.5 データ機密度ルーティング

| 機密度 | ルーティング動作 |
|---|---|
| `public` | タスク種別に基づく通常ルーティング |
| `internal` | タスク種別に基づく通常ルーティング (デフォルト) |
| `confidential` | タスク種別に基づく通常ルーティング |
| `restricted` | **ローカルモデル `llama-4-405b` を強制使用** (Ollama/vLLM経由、`http://localhost:11434/api/generate`) |

### 6.6 モデル呼び出しインターフェース

`invoke()` メソッドの統一インターフェース:

```python
async def invoke(
    prompt: str,               # プロンプト
    task_type: TaskType,       # タスク種別
    sensitivity: DataSensitivity = DataSensitivity.INTERNAL,  # データ機密度
    system_prompt: str = "",   # システムプロンプト
    max_tokens: int = 4096,    # 最大出力トークン数
) -> str:
```

**プロバイダー別呼び出し**:

| プロバイダー | SDKクライアント | エンドポイント |
|---|---|---|
| Anthropic | `anthropic.AsyncAnthropic` | `messages.create()` |
| OpenAI | `openai.AsyncOpenAI` | `chat.completions.create()` |
| Google | `vertexai.GenerativeModel` | `generate_content_async()` |
| ローカル | `httpx.AsyncClient` | `POST http://localhost:11434/api/generate` |

### 6.7 使用量追跡

LLM呼び出しごとに使用トークン数を推定し、API Gatewayの `track_usage()` メソッドで追跡する。

- 推定トークン数: `len(prompt) // 4 + len(result) // 4`
- クラウドプロバイダーに応じて CloudWatch / Azure Monitor / Cloud Monitoring にメトリクスを送信。

---

## 7. セキュリティ仕様

### 7.1 認証 (JWT)

#### トークン生成

```python
def create_access_token(user_id: str, role: UserRole, tenant_id: str) -> str
```

| パラメータ | 説明 |
|---|---|
| `user_id` | ユーザーID (JWTの `sub` クレーム) |
| `role` | ユーザーロール (`admin`, `analyst`, `viewer`) |
| `tenant_id` | テナントID (マルチテナント対応) |

**JWTペイロード構造**:

```json
{
  "sub": "user-id-string",
  "role": "analyst",
  "tenant_id": "tenant-id-string",
  "exp": 1739345400
}
```

**JWT設定**:

| 設定項目 | 設定キー | デフォルト値 |
|---|---|---|
| 署名アルゴリズム | `jwt_algorithm` | `HS256` |
| 有効期限 | `jwt_expiration_minutes` | `60` (分) |
| 秘密鍵 | `secret_key` | `"change-me-in-production"` |

#### トークン検証

```python
def verify_token(token: str) -> TokenData
```

- `python-jose` ライブラリによるJWTデコードと検証。
- 無効なトークンの場合、`ValueError` を送出: `"Invalid token: {error_detail}"`。

### 7.2 認可 (RBAC)

ロールベースアクセス制御。`UserRole` Enumで定義される3つのロール。

| ロール | 説明 |
|---|---|
| `admin` | システム管理者。全機能へのフルアクセス |
| `analyst` | 分析者。分析実行・レポート生成が可能 |
| `viewer` | 閲覧者。結果の閲覧のみ |

マルチテナント対応: JWTの `tenant_id` クレームによりテナント間のデータ分離を実現。

### 7.3 パスワード管理

| 項目 | 仕様 |
|---|---|
| ハッシュアルゴリズム | bcrypt |
| ライブラリ | passlib (`CryptContext`) |
| `hash_password(password)` | パスワードをbcryptでハッシュ化 |
| `verify_password(plain, hashed)` | パスワードを検証 |

### 7.4 PII匿名化

- LLMタスク種別 `PII_DETECTION` で検知を実施。
- 優先モデル: `gpt-5-mini` (高速・低コスト)
- フォールバック: `claude-sonnet-4-5-20250929`

### 7.5 監査ログ

構造化ログ (`app.core.logging`) により以下のイベントを記録:

| イベント | ログフィールド |
|---|---|
| LLM呼び出し | `model`, `task_type`, `sensitivity` |
| LLM失敗 | `model`, `error` |
| サーキットブレーカー開放 | `failures` |
| フォールバック | `from_model`, `to_model` |
| エージェント開始 | `agent_id`, `objective` |
| エージェントログ | `phase`, `thought` |
| クラスタリング開始 | `job_id`, `algorithm` |
| 感情分析開始 | `job_id`, `count`, `axes` |
| 共起分析開始/完了 | `count`, `nodes`, `edges`, `communities`, `modularity` |
| API Gateway初期化 | `provider` |
| トークン使用量追跡 | `client_id`, `tokens_used`, `model` |

### 7.6 シークレット管理

環境変数またはクラウドプロバイダーのシークレット管理サービスを使用。

| プロバイダー | サービス | 取得メソッド |
|---|---|---|
| AWS | Secrets Manager | `boto3.client("secretsmanager").get_secret_value()` |
| Azure | Key Vault | `SecretClient.get_secret()` (DefaultAzureCredential) |
| GCP | Secret Manager | `SecretManagerServiceClient.access_secret_version()` |
| Local | 環境変数 | `os.getenv()` |

---

## 8. マルチクラウド対応

### 8.1 抽象化アーキテクチャ

`BaseAPIGateway` 抽象基底クラスにより、クラウドプロバイダー間の差異を吸収する。環境変数 `NEXUSTEXT_CLOUD_PROVIDER` の値に基づいて、`get_api_gateway()` ファクトリ関数が適切な実装を返す。

```python
def get_api_gateway() -> BaseAPIGateway:
    # settings.cloud_provider に基づいて実装クラスを選択
```

### 8.2 AWS構成

**実装クラス**: `AWSAPIGateway`

| 設定項目 | 環境変数 | デフォルト値 |
|---|---|---|
| リージョン | `NEXUSTEXT_AWS_REGION` | `ap-northeast-1` |
| API Gateway ID | `NEXUSTEXT_AWS_API_GATEWAY_ID` | `""` |
| S3バケット | `NEXUSTEXT_AWS_S3_BUCKET` | `""` |

**利用サービス**:

| AWSサービス | 用途 |
|---|---|
| API Gateway | APIルーティング、レート制限 (Usage Plan) |
| Secrets Manager | APIキー・シークレット管理 |
| CloudWatch | トークン使用量メトリクス (`NexusTextAI` 名前空間) |
| S3 | ファイルストレージ |

**CloudWatchメトリクス**:

- Namespace: `NexusTextAI`
- MetricName: `TokensUsed`
- Dimensions: `ClientId`, `Model`
- Unit: `Count`

### 8.3 Azure構成

**実装クラス**: `AzureAPIM`

| 設定項目 | 環境変数 | デフォルト値 |
|---|---|---|
| APIMエンドポイント | `NEXUSTEXT_AZURE_APIM_ENDPOINT` | `""` |
| APIMサブスクリプションキー | `NEXUSTEXT_AZURE_APIM_SUBSCRIPTION_KEY` | `""` |
| Blob接続文字列 | `NEXUSTEXT_AZURE_BLOB_CONNECTION_STRING` | `""` |
| Key Vault URL | `NEXUSTEXT_AZURE_KEY_VAULT_URL` | `""` |

**利用サービス**:

| Azureサービス | 用途 |
|---|---|
| API Management (APIM) | APIルーティング、レート制限 (ポリシー) |
| Key Vault | シークレット管理 (DefaultAzureCredential) |
| Monitor / Log Analytics | トークン使用量モニタリング |
| Blob Storage | ファイルストレージ |

### 8.4 GCP構成

**実装クラス**: `GCPCloudEndpoints`

| 設定項目 | 環境変数 | デフォルト値 |
|---|---|---|
| プロジェクトID | `NEXUSTEXT_GCP_PROJECT_ID` | `""` |
| リージョン | `NEXUSTEXT_GCP_REGION` | `asia-northeast1` |
| API Gateway ID | `NEXUSTEXT_GCP_API_GATEWAY_ID` | `""` |
| GCSバケット | `NEXUSTEXT_GCP_GCS_BUCKET` | `""` |

**利用サービス**:

| GCPサービス | 用途 |
|---|---|
| Cloud Endpoints / API Gateway | APIルーティング、クォータ制御 |
| Secret Manager | シークレット管理 |
| Cloud Monitoring | トークン使用量メトリクス |
| Cloud Storage (GCS) | ファイルストレージ |

**Secret Manager パス形式**: `projects/{gcp_project_id}/secrets/{secret_name}/versions/latest`

### 8.5 ローカル開発環境構成

**実装クラス**: `LocalGateway`

| 機能 | 実装 |
|---|---|
| API登録 | ログ出力のみ |
| レート制限 | 常に `True` (制限なし) |
| 使用量追跡 | インメモリ辞書 (`_usage`) |
| シークレット取得 | `os.getenv()` |

### 8.6 API Gateway共通設定

`APIGatewayConfig` で全プロバイダー共通のデフォルト値を定義:

| 設定項目 | デフォルト値 | 説明 |
|---|---|---|
| `rate_limit_per_minute` | `100` | 分あたりのレート制限 |
| `token_budget_per_hour` | `1,000,000` | 時間あたりのトークン予算 |
| `enable_caching` | `True` | キャッシュ有効化 |
| `cache_ttl_seconds` | `300` (5分) | キャッシュTTL |

---

## 9. 非機能要件

### 9.1 パフォーマンス

| 指標 | 要件 | 備考 |
|---|---|---|
| APIレスポンス時間 (軽量エンドポイント) | < 500ms | ヘルスチェック、データセット一覧 |
| クラスタリング処理 | テキスト数に依存 | Embedding生成 + UMAP + クラスタリング + LLMラベリング |
| 感情分析バッチ処理 | 10件/バッチ | LLM呼び出し1回あたり最大2000トークン出力 |
| 共起ネットワーク分析 | テキスト数・語彙数に依存 | NetworkXグラフ構築 + Louvain検知 |
| エージェント推論ループ | 5フェーズ、各フェーズでLLM呼び出し | Full Autoで3-5回のLLM呼び出し |
| LLM呼び出しタイムアウト | 120秒 | ローカルモデル (`httpx.AsyncClient`, `timeout=120.0`) |

### 9.2 スケーラビリティ

| 項目 | 仕様 |
|---|---|
| 非同期処理 | FastAPI + asyncio による完全非同期アーキテクチャ |
| LLMモデルの水平スケーリング | マルチモデルルーティングにより負荷分散 |
| データベース接続 | asyncpg による非同期PostgreSQL接続 |
| キャッシュ | Redis によるセッション・結果キャッシュ |
| API Gateway レート制限 | 100 req/min (プロバイダー別に設定可能) |
| トークン予算 | 1,000,000 tok/hour (API Gateway設定) |

### 9.3 可用性

| 項目 | 仕様 |
|---|---|
| サーキットブレーカー | モデル単位で独立管理。3回連続失敗で切断、60秒後に半開 |
| フォールバック | 候補モデルリストに沿って自動切替。全モデル障害時は第1候補にフォールバック |
| マルチクラウド | AWS / Azure / GCP 間の切替が環境変数1つで可能 |
| HITL制御 | エージェント処理の中断・再開をサポート (`awaiting_approval` 状態) |
| エラーハンドリング | LLMラベリング失敗時のフォールバック文字列生成、JSON解析失敗時のデフォルト値設定 |

### 9.4 設定管理

全設定は環境変数で管理される。プレフィックスは `NEXUSTEXT_`、大文字・小文字を区別しない。

**主要設定一覧** (`Settings` クラス):

| 設定キー | 環境変数 | 型 | デフォルト値 |
|---|---|---|---|
| `app_name` | `NEXUSTEXT_APP_NAME` | `str` | `"NexusText AI"` |
| `app_version` | `NEXUSTEXT_APP_VERSION` | `str` | `"7.0.0"` |
| `debug` | `NEXUSTEXT_DEBUG` | `bool` | `False` |
| `log_level` | `NEXUSTEXT_LOG_LEVEL` | `str` | `"INFO"` |
| `cloud_provider` | `NEXUSTEXT_CLOUD_PROVIDER` | `CloudProvider` | `"local"` |
| `cors_origins` | `NEXUSTEXT_CORS_ORIGINS` | `list[str]` | `["http://localhost:3000", "http://localhost:5173"]` |
| `database_url` | `NEXUSTEXT_DATABASE_URL` | `str` | `"postgresql+asyncpg://nexustext:nexustext@localhost:5432/nexustext"` |
| `redis_url` | `NEXUSTEXT_REDIS_URL` | `str` | `"redis://localhost:6379/0"` |
| `anthropic_api_key` | `NEXUSTEXT_ANTHROPIC_API_KEY` | `str` | `""` |
| `openai_api_key` | `NEXUSTEXT_OPENAI_API_KEY` | `str` | `""` |
| `google_cloud_project` | `NEXUSTEXT_GOOGLE_CLOUD_PROJECT` | `str` | `""` |
| `primary_model` | `NEXUSTEXT_PRIMARY_MODEL` | `str` | `"claude-opus-4-6"` |
| `secondary_model` | `NEXUSTEXT_SECONDARY_MODEL` | `str` | `"claude-sonnet-4-5-20250929"` |
| `pii_detection_model` | `NEXUSTEXT_PII_DETECTION_MODEL` | `str` | `"gpt-5-mini"` |
| `multilingual_model` | `NEXUSTEXT_MULTILINGUAL_MODEL` | `str` | `"gpt-5.2"` |
| `vision_model` | `NEXUSTEXT_VISION_MODEL` | `str` | `"gemini-3.0-pro"` |
| `local_model` | `NEXUSTEXT_LOCAL_MODEL` | `str` | `"llama-4-405b"` |
| `secret_key` | `NEXUSTEXT_SECRET_KEY` | `str` | `"change-me-in-production"` |
| `jwt_algorithm` | `NEXUSTEXT_JWT_ALGORITHM` | `str` | `"HS256"` |
| `jwt_expiration_minutes` | `NEXUSTEXT_JWT_EXPIRATION_MINUTES` | `int` | `60` |
| `default_hitl_mode` | `NEXUSTEXT_DEFAULT_HITL_MODE` | `HITLMode` | `"semi_auto"` |
| `embedding_model` | `NEXUSTEXT_EMBEDDING_MODEL` | `str` | `"paraphrase-multilingual-MiniLM-L12-v2"` |
| `embedding_dimension` | `NEXUSTEXT_EMBEDDING_DIMENSION` | `int` | `384` |

### 9.5 Embeddingモデル

| 項目 | 値 |
|---|---|
| モデル | `paraphrase-multilingual-MiniLM-L12-v2` |
| 次元数 | 384 |
| 対応言語 | 多言語 (日本語含む) |
| UMAP次元削減 | 2次元、metric=`"cosine"`、random_state=`42` |

---

*本仕様書はソースコードから自動抽出された情報に基づいて作成されています。*
