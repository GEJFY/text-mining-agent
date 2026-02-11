###############################################################################
# NexusText AI v7.0 - 共有 Kubernetes モジュール変数定義
###############################################################################

# ---------------------------------------------------------------------------
# 基本設定
# ---------------------------------------------------------------------------
variable "namespace" {
  description = "Kubernetes namespace for the NexusText application"
  type        = string
  default     = "nexustext"
}

variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "environment must be one of: development, staging, production"
  }
}

variable "log_level" {
  description = "Application log level"
  type        = string
  default     = "INFO"

  validation {
    condition     = contains(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"], var.log_level)
    error_message = "log_level must be one of: DEBUG, INFO, WARNING, ERROR, CRITICAL"
  }
}

# ---------------------------------------------------------------------------
# コンテナイメージ設定
# ---------------------------------------------------------------------------
variable "container_registry" {
  description = "Container registry URL (e.g., 123456789012.dkr.ecr.us-east-1.amazonaws.com)"
  type        = string
}

variable "backend_image" {
  description = "Backend container image name"
  type        = string
  default     = "nexustext/backend"
}

variable "frontend_image" {
  description = "Frontend container image name"
  type        = string
  default     = "nexustext/frontend"
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "v7.0.0"
}

variable "image_pull_policy" {
  description = "Kubernetes image pull policy"
  type        = string
  default     = "IfNotPresent"

  validation {
    condition     = contains(["Always", "IfNotPresent", "Never"], var.image_pull_policy)
    error_message = "image_pull_policy must be one of: Always, IfNotPresent, Never"
  }
}

# ---------------------------------------------------------------------------
# API Gateway / 外部 URL
# ---------------------------------------------------------------------------
variable "api_gateway_url" {
  description = "External API Gateway URL for the frontend to connect to"
  type        = string
  default     = ""
}

variable "frontend_url" {
  description = "External frontend URL"
  type        = string
  default     = ""
}

variable "api_rate_limit" {
  description = "API rate limit (requests per minute per user)"
  type        = number
  default     = 100
}

variable "max_tokens_per_request" {
  description = "Maximum tokens allowed per API request"
  type        = number
  default     = 4096
}

variable "cors_allowed_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = ["*"]
}

# ---------------------------------------------------------------------------
# Backend 設定
# ---------------------------------------------------------------------------
variable "backend_replicas" {
  description = "Number of backend pod replicas"
  type        = number
  default     = 3

  validation {
    condition     = var.backend_replicas >= 1
    error_message = "backend_replicas must be at least 1"
  }
}

variable "backend_max_replicas" {
  description = "Maximum number of backend pod replicas for HPA"
  type        = number
  default     = 10
}

variable "backend_resources" {
  description = "Resource requests and limits for backend pods"
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "500m"
    requests_memory = "512Mi"
    limits_cpu      = "2000m"
    limits_memory   = "2Gi"
  }
}

variable "backend_service_type" {
  description = "Kubernetes service type for backend"
  type        = string
  default     = "ClusterIP"
}

variable "backend_service_annotations" {
  description = "Annotations for the backend Kubernetes service"
  type        = map(string)
  default     = {}
}

variable "backend_service_account_annotations" {
  description = "Annotations for the backend service account (e.g., IAM role binding)"
  type        = map(string)
  default     = {}
}

variable "extra_env_vars" {
  description = "Additional environment variables for the backend deployment"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

# ---------------------------------------------------------------------------
# Frontend 設定
# ---------------------------------------------------------------------------
variable "frontend_replicas" {
  description = "Number of frontend pod replicas"
  type        = number
  default     = 2

  validation {
    condition     = var.frontend_replicas >= 1
    error_message = "frontend_replicas must be at least 1"
  }
}

variable "frontend_max_replicas" {
  description = "Maximum number of frontend pod replicas for HPA"
  type        = number
  default     = 8
}

variable "frontend_resources" {
  description = "Resource requests and limits for frontend pods"
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "200m"
    requests_memory = "256Mi"
    limits_cpu      = "1000m"
    limits_memory   = "1Gi"
  }
}

variable "frontend_service_type" {
  description = "Kubernetes service type for frontend"
  type        = string
  default     = "ClusterIP"
}

variable "frontend_service_annotations" {
  description = "Annotations for the frontend Kubernetes service"
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# PostgreSQL 設定
# ---------------------------------------------------------------------------
variable "postgres_db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "nexustext"
}

variable "postgres_user" {
  description = "PostgreSQL admin username"
  type        = string
  sensitive   = true
}

variable "postgres_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

variable "postgres_storage_size" {
  description = "PostgreSQL persistent volume size"
  type        = string
  default     = "50Gi"
}

variable "postgres_resources" {
  description = "Resource requests and limits for PostgreSQL"
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "500m"
    requests_memory = "1Gi"
    limits_cpu      = "2000m"
    limits_memory   = "4Gi"
  }
}

# ---------------------------------------------------------------------------
# Redis 設定
# ---------------------------------------------------------------------------
variable "redis_password" {
  description = "Redis authentication password"
  type        = string
  sensitive   = true
}

variable "redis_max_memory" {
  description = "Redis maximum memory allocation"
  type        = string
  default     = "1gb"
}

variable "redis_resources" {
  description = "Resource requests and limits for Redis"
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "250m"
    requests_memory = "512Mi"
    limits_cpu      = "1000m"
    limits_memory   = "1536Mi"
  }
}

# ---------------------------------------------------------------------------
# セキュリティ / 認証
# ---------------------------------------------------------------------------
variable "api_secret_key" {
  description = "API secret key for request signing"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT token signing secret"
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# ストレージ
# ---------------------------------------------------------------------------
variable "storage_class_name" {
  description = "Kubernetes StorageClass name for persistent volumes"
  type        = string
  default     = "gp3"
}

# ---------------------------------------------------------------------------
# テレメトリ
# ---------------------------------------------------------------------------
variable "telemetry_enabled" {
  description = "Enable application telemetry and metrics collection"
  type        = bool
  default     = true
}
