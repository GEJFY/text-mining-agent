###############################################################################
# NexusText AI v7.0 - Production 環境変数
###############################################################################

environment = "production"
region      = "us-east-1"

# EKS クラスター
cluster_name       = "nexustext-prod"
kubernetes_version = "1.29"

# ノード設定（高可用性: オンデマンド + 大インスタンス）
app_instance_type      = "m6i.xlarge"
system_instance_type   = "m6i.large"
app_node_min_count     = 3
app_node_max_count     = 15
app_node_desired_count = 3
use_spot_instances     = false

# アプリケーション
backend_replicas  = 3
frontend_replicas = 2
image_tag         = "v7.0.0"

# VPC
vpc_cidr             = "10.0.0.0/16"
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# API Gateway
api_throttle_rate_limit  = 100
api_throttle_burst_limit = 200
api_quota_limit          = 1000000
waf_rate_limit           = 2000

# モニタリング（本番用: 長期保持、厳しい閾値）
log_retention_days         = 90
alarm_5xx_threshold        = 10
alarm_latency_threshold_ms = 3000
