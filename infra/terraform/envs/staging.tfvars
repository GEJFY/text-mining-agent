###############################################################################
# NexusText AI v7.0 - Staging 環境変数
###############################################################################

environment = "staging"
region      = "us-east-1"

# EKS クラスター
cluster_name       = "nexustext-staging"
kubernetes_version = "1.29"

# ノード設定（本番に近い構成、やや小規模）
app_instance_type      = "m6i.large"
system_instance_type   = "m6i.large"
app_node_min_count     = 2
app_node_max_count     = 5
app_node_desired_count = 2
use_spot_instances     = false

# アプリケーション
backend_replicas  = 2
frontend_replicas = 2
image_tag         = "latest"

# VPC
vpc_cidr             = "10.20.0.0/16"
private_subnet_cidrs = ["10.20.1.0/24", "10.20.2.0/24", "10.20.3.0/24"]
public_subnet_cidrs  = ["10.20.101.0/24", "10.20.102.0/24", "10.20.103.0/24"]

# API Gateway
api_throttle_rate_limit  = 100
api_throttle_burst_limit = 200
api_quota_limit          = 500000
waf_rate_limit           = 2000

# モニタリング
log_retention_days         = 30
alarm_5xx_threshold        = 20
alarm_latency_threshold_ms = 3000
