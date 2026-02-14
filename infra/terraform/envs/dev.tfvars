###############################################################################
# NexusText AI v7.0 - Development 環境変数
###############################################################################

environment = "development"
region      = "us-east-1"

# EKS クラスター
cluster_name       = "nexustext-dev"
kubernetes_version = "1.29"

# ノード設定（コスト重視: Spot + 小インスタンス）
app_instance_type      = "t3.large"
system_instance_type   = "t3.medium"
app_node_min_count     = 1
app_node_max_count     = 3
app_node_desired_count = 1
use_spot_instances     = true

# アプリケーション
backend_replicas  = 1
frontend_replicas = 1
image_tag         = "latest"

# VPC（開発用: 小規模CIDR）
vpc_cidr             = "10.10.0.0/16"
private_subnet_cidrs = ["10.10.1.0/24", "10.10.2.0/24", "10.10.3.0/24"]
public_subnet_cidrs  = ["10.10.101.0/24", "10.10.102.0/24", "10.10.103.0/24"]

# API Gateway
api_throttle_rate_limit  = 50
api_throttle_burst_limit = 100
api_quota_limit          = 100000
waf_rate_limit           = 1000

# モニタリング（開発用: 短期保持）
log_retention_days        = 7
alarm_5xx_threshold       = 50
alarm_latency_threshold_ms = 5000
