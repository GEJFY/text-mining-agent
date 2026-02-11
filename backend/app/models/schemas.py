"""Pydanticスキーマ定義 - API入出力モデル"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# === データインポート ===

class ColumnRole(str, Enum):
    """カラムの役割定義"""
    TEXT = "text"
    DATE = "date"
    ATTRIBUTE = "attribute"
    ID = "id"
    WEIGHT = "weight"


class ColumnMapping(BaseModel):
    """動的カラムマッピング"""
    column_name: str
    role: ColumnRole


class DataImportRequest(BaseModel):
    """データインポートリクエスト"""
    file_name: str
    column_mappings: list[ColumnMapping]
    encoding: str | None = None  # 自動検出


class DataImportResponse(BaseModel):
    """データインポートレスポンス"""
    dataset_id: str
    total_rows: int
    null_rate: float
    char_count_stats: dict[str, float]
    unique_values: dict[str, int]
    preview: list[dict]


# === クラスター分析 ===

class ClusterAlgorithm(str, Enum):
    KMEANS = "kmeans"
    HDBSCAN = "hdbscan"
    GMM = "gmm"


class ClusterRequest(BaseModel):
    """クラスター分析リクエスト"""
    dataset_id: str
    algorithm: ClusterAlgorithm = ClusterAlgorithm.KMEANS
    n_clusters: int | None = Field(default=5, ge=2, le=50)
    umap_n_neighbors: int = Field(default=15, ge=2, le=200)
    umap_min_dist: float = Field(default=0.1, ge=0.0, le=1.0)
    embedding_model: str | None = None


class ClusterLabel(BaseModel):
    """クラスターラベル（LLM生成）"""
    cluster_id: int
    title: str = Field(max_length=15)
    summary: str = Field(max_length=100)
    keywords: list[str]
    size: int
    centroid_texts: list[str]


class ClusterResult(BaseModel):
    """クラスター分析結果"""
    job_id: str
    algorithm: ClusterAlgorithm
    clusters: list[ClusterLabel]
    outliers: list[dict]
    umap_coordinates: list[list[float]]
    cluster_assignments: list[int]
    silhouette_score: float


# === 感情分析 ===

class SentimentMode(str, Enum):
    BASIC = "basic"
    BUSINESS = "business"
    RISK = "risk"
    CUSTOM = "custom"
    MULTI_LABEL = "multi_label"


class SentimentAxisDefinition(BaseModel):
    """感情軸定義"""
    name: str
    description: str = ""
    criteria: str = ""


class SentimentRequest(BaseModel):
    """感情分析リクエスト"""
    dataset_id: str
    mode: SentimentMode = SentimentMode.BASIC
    custom_axes: list[SentimentAxisDefinition] | None = None
    multi_label: bool = False


class SentimentEstimate(BaseModel):
    """実行前のコスト見積り"""
    total_records: int
    estimated_tokens: int
    estimated_cost_usd: float
    estimated_time_seconds: int


class SentimentResultItem(BaseModel):
    """個別レコードの感情分析結果"""
    record_id: str
    labels: list[str]
    scores: dict[str, float]
    evidence_highlights: list[dict[str, str]] = []


class SentimentResult(BaseModel):
    """感情分析結果"""
    job_id: str
    mode: SentimentMode
    axes: list[str]
    results: list[SentimentResultItem]
    distribution: dict[str, int]
    time_series: list[dict] | None = None


# === 共起ネットワーク ===

class CooccurrenceRequest(BaseModel):
    """共起ネットワーク分析リクエスト"""
    dataset_id: str
    min_frequency: int = Field(default=3, ge=1)
    window_size: int = Field(default=5, ge=2, le=20)
    time_slice: bool = False
    time_interval: str | None = None  # month, week, day


class NetworkNode(BaseModel):
    """ネットワークのノード"""
    word: str
    frequency: int
    degree_centrality: float = 0.0
    betweenness_centrality: float = 0.0
    community_id: int = 0


class NetworkEdge(BaseModel):
    """ネットワークのエッジ"""
    source: str
    target: str
    weight: int


class CooccurrenceResult(BaseModel):
    """共起ネットワーク結果"""
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]
    communities: dict[int, list[str]]
    modularity: float


# === エージェント ===

class AgentPhase(str, Enum):
    OBSERVE = "observe"
    HYPOTHESIZE = "hypothesize"
    EXPLORE = "explore"
    VERIFY = "verify"
    SYNTHESIZE = "synthesize"


class AgentLogEntry(BaseModel):
    """エージェントのログエントリー"""
    timestamp: datetime
    phase: AgentPhase
    thought: str
    action: str | None = None
    result: str | None = None
    confidence: float = 0.0


class AgentInsight(BaseModel):
    """エージェントが導出したインサイト"""
    title: str
    description: str
    evidence: list[str]
    grounding_score: float = Field(ge=0.0, le=1.0)
    recommendations: list[str] = []


class AnalysisRequest(BaseModel):
    """自律分析リクエスト"""
    dataset_id: str
    objective: str = ""
    hitl_mode: str = "semi_auto"


# === レポート ===

class ReportTemplate(str, Enum):
    VOC = "voc"
    AUDIT = "audit"
    COMPLIANCE = "compliance"
    RISK = "risk"
    CUSTOM = "custom"


class ReportFormat(str, Enum):
    PPTX = "pptx"
    PDF = "pdf"
    DOCX = "docx"
    EXCEL = "excel"


class ReportRequest(BaseModel):
    """レポート生成リクエスト"""
    dataset_id: str
    template: ReportTemplate = ReportTemplate.VOC
    output_format: ReportFormat = ReportFormat.PDF
    custom_prompt: str | None = None
    include_evidence_links: bool = True


class ReportResponse(BaseModel):
    """レポート生成レスポンス"""
    report_id: str
    download_url: str
    format: ReportFormat
    generated_at: datetime
