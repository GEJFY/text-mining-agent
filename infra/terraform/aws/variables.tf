###############################################################################
# NexusText AI v7.0 - AWS 変数定義
###############################################################################

# ---------------------------------------------------------------------------
# 基本設定
# ---------------------------------------------------------------------------
variable "region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
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

# ---------------------------------------------------------------------------
# VPC / ネットワーク
# ---------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# ---------------------------------------------------------------------------
# EKS クラスター
# ---------------------------------------------------------------------------
variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "nexustext-prod"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", var.cluster_name))
    error_message = "cluster_name must start with a letter and contain only alphanumeric characters and hyphens"
  }
}

variable "kubernetes_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.29"
}

variable "app_instance_type" {
  description = "EC2 instance type for application node group"
  type        = string
  default     = "m6i.xlarge"
}

variable "system_instance_type" {
  description = "EC2 instance type for system node group"
  type        = string
  default     = "m6i.large"
}

variable "app_node_min_count" {
  description = "Minimum number of nodes in the application node group"
  type        = number
  default     = 2
}

variable "app_node_max_count" {
  description = "Maximum number of nodes in the application node group"
  type        = number
  default     = 10
}

variable "app_node_desired_count" {
  description = "Desired number of nodes in the application node group"
  type        = number
  default     = 3
}

variable "use_spot_instances" {
  description = "Use Spot instances for application node group (cost savings, not recommended for production)"
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# コンテナ / デプロイメント
# ---------------------------------------------------------------------------
variable "image_tag" {
  description = "Container image tag for NexusText application"
  type        = string
  default     = "v7.0.0"
}

variable "backend_replicas" {
  description = "Number of backend pod replicas"
  type        = number
  default     = 3
}

variable "frontend_replicas" {
  description = "Number of frontend pod replicas"
  type        = number
  default     = 2
}

variable "frontend_url" {
  description = "External frontend URL"
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# API Gateway
# ---------------------------------------------------------------------------
variable "api_throttle_rate_limit" {
  description = "API Gateway default throttle rate limit (requests per second)"
  type        = number
  default     = 100
}

variable "api_throttle_burst_limit" {
  description = "API Gateway default throttle burst limit"
  type        = number
  default     = 200
}

variable "api_quota_limit" {
  description = "API Gateway monthly quota limit (total requests per month)"
  type        = number
  default     = 1000000
}

variable "waf_rate_limit" {
  description = "WAF rate-based rule limit (requests per 5-minute period per IP)"
  type        = number
  default     = 2000
}

# ---------------------------------------------------------------------------
# 認証情報 / シークレット
# ---------------------------------------------------------------------------
variable "db_username" {
  description = "PostgreSQL database admin username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL database admin password"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis authentication password"
  type        = string
  sensitive   = true
}

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
# モニタリング / アラーム
# ---------------------------------------------------------------------------
variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch retention value"
  }
}

variable "sns_alarm_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarm notifications (leave empty to disable)"
  type        = string
  default     = ""
}

variable "alarm_5xx_threshold" {
  description = "Threshold for 5XX error count alarm (per 5-minute period)"
  type        = number
  default     = 10
}

variable "alarm_latency_threshold_ms" {
  description = "Threshold for API latency alarm in milliseconds"
  type        = number
  default     = 3000
}
