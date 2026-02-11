###############################################################################
# NexusText AI v7.0 - Azure 変数定義
###############################################################################

# ---------------------------------------------------------------------------
# 基本設定
# ---------------------------------------------------------------------------
variable "location" {
  description = "Azure region for resource deployment"
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "Name of the Azure resource group"
  type        = string
  default     = "nexustext-prod-rg"
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
# ネットワーク
# ---------------------------------------------------------------------------
variable "vnet_address_space" {
  description = "Virtual network address space"
  type        = string
  default     = "10.0.0.0/14"
}

variable "aks_subnet_cidr" {
  description = "AKS nodes subnet CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "aks_pods_subnet_cidr" {
  description = "AKS pods subnet CIDR (for Azure CNI overlay)"
  type        = string
  default     = "10.1.0.0/16"
}

variable "apim_subnet_cidr" {
  description = "APIM subnet CIDR"
  type        = string
  default     = "10.2.0.0/24"
}

variable "private_endpoints_subnet_cidr" {
  description = "Private endpoints subnet CIDR"
  type        = string
  default     = "10.2.1.0/24"
}

# ---------------------------------------------------------------------------
# AKS クラスター
# ---------------------------------------------------------------------------
variable "cluster_name" {
  description = "Name of the AKS cluster"
  type        = string
  default     = "nexustext-prod"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", var.cluster_name))
    error_message = "cluster_name must start with a letter and contain only alphanumeric characters and hyphens"
  }
}

variable "kubernetes_version" {
  description = "Kubernetes version for AKS cluster"
  type        = string
  default     = "1.29"
}

variable "system_vm_size" {
  description = "VM size for system node pool"
  type        = string
  default     = "Standard_D4s_v5"
}

variable "app_vm_size" {
  description = "VM size for application node pool"
  type        = string
  default     = "Standard_D8s_v5"
}

variable "app_node_min_count" {
  description = "Minimum number of nodes in the application node pool"
  type        = number
  default     = 2
}

variable "app_node_max_count" {
  description = "Maximum number of nodes in the application node pool"
  type        = number
  default     = 10
}

variable "use_spot_instances" {
  description = "Use Spot instances for application node pool"
  type        = bool
  default     = false
}

variable "aks_admin_group_ids" {
  description = "List of Azure AD group object IDs for AKS admin access"
  type        = list(string)
  default     = []
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
# ACR
# ---------------------------------------------------------------------------
variable "acr_georeplication_locations" {
  description = "List of Azure regions for ACR geo-replication (Premium SKU only)"
  type        = list(string)
  default     = ["westus2"]
}

# ---------------------------------------------------------------------------
# APIM
# ---------------------------------------------------------------------------
variable "apim_sku" {
  description = "APIM SKU (Developer_1, Standard_1, Premium_1, etc.)"
  type        = string
  default     = "Standard_1"
}

variable "apim_publisher_name" {
  description = "APIM publisher organization name"
  type        = string
  default     = "NexusText AI Inc."
}

variable "apim_publisher_email" {
  description = "APIM publisher contact email"
  type        = string
  default     = "platform@nexustext.ai"
}

variable "apim_rate_limit_calls" {
  description = "APIM rate limit: number of calls allowed per renewal period"
  type        = number
  default     = 100
}

variable "apim_rate_limit_period" {
  description = "APIM rate limit: renewal period in seconds"
  type        = number
  default     = 60
}

variable "apim_quota_limit" {
  description = "APIM quota: maximum calls per month"
  type        = number
  default     = 1000000
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
# モニタリング / アラート
# ---------------------------------------------------------------------------
variable "log_retention_days" {
  description = "Log Analytics workspace retention period in days"
  type        = number
  default     = 30
}

variable "alert_email_addresses" {
  description = "Email addresses for alert notifications"
  type        = list(string)
  default     = []
}

variable "alert_failed_requests_threshold" {
  description = "Threshold for APIM failed requests alert"
  type        = number
  default     = 50
}
