###############################################################################
# NexusText AI v7.0 - AWS インフラストラクチャ定義
# EKS / API Gateway / S3 / Secrets Manager / CloudWatch / ECR
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket         = "nexustext-terraform-state"
    key            = "aws/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "nexustext-terraform-lock"
  }
}

# ---------------------------------------------------------------------------
# Provider 設定
# ---------------------------------------------------------------------------
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "NexusText"
      Version     = "v7.0"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Team        = "platform"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", var.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", var.cluster_name]
    }
  }
}

# ---------------------------------------------------------------------------
# Data Sources
# ---------------------------------------------------------------------------
data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_partition" "current" {}

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.5"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "production"
  one_nat_gateway_per_az = var.environment == "production"
  enable_dns_hostnames   = true
  enable_dns_support     = true

  # EKS 用サブネットタグ
  public_subnet_tags = {
    "kubernetes.io/role/elb"                    = 1
    "kubernetes.io/cluster/${var.cluster_name}"  = "owned"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"            = 1
    "kubernetes.io/cluster/${var.cluster_name}"  = "owned"
  }

  tags = {
    Name = "${var.cluster_name}-vpc"
  }
}

# ---------------------------------------------------------------------------
# EKS クラスター
# ---------------------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.5"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  # クラスター暗号化
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }

  # クラスターアドオン
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent              = true
      service_account_role_arn = module.vpc_cni_irsa.iam_role_arn
    }
    aws-ebs-csi-driver = {
      most_recent              = true
      service_account_role_arn = module.ebs_csi_irsa.iam_role_arn
    }
  }

  # マネージドノードグループ
  eks_managed_node_groups = {
    # アプリケーションノード
    app = {
      name            = "${var.cluster_name}-app"
      instance_types  = [var.app_instance_type]
      capacity_type   = var.use_spot_instances ? "SPOT" : "ON_DEMAND"
      min_size        = var.app_node_min_count
      max_size        = var.app_node_max_count
      desired_size    = var.app_node_desired_count
      disk_size       = 100
      disk_type       = "gp3"

      labels = {
        role        = "app"
        environment = var.environment
      }

      tags = {
        "k8s.io/cluster-autoscaler/enabled"             = "true"
        "k8s.io/cluster-autoscaler/${var.cluster_name}"  = "owned"
      }
    }

    # システムノード（Ingress, モニタリングなど）
    system = {
      name            = "${var.cluster_name}-system"
      instance_types  = [var.system_instance_type]
      capacity_type   = "ON_DEMAND"
      min_size        = 1
      max_size        = 3
      desired_size    = 2
      disk_size       = 50
      disk_type       = "gp3"

      labels = {
        role = "system"
      }

      taints = {
        system = {
          key    = "CriticalAddonsOnly"
          value  = "true"
          effect = "PREFER_NO_SCHEDULE"
        }
      }
    }
  }

  # GPU ノードグループ（オプション: LLM推論用）
  eks_managed_node_groups_extra = var.enable_gpu_nodes ? {
    gpu = {
      name           = "${var.cluster_name}-gpu"
      instance_types = [var.gpu_instance_type]
      capacity_type  = "ON_DEMAND"
      min_size       = var.gpu_node_min_count
      max_size       = var.gpu_node_max_count
      desired_size   = var.gpu_node_desired_count
      disk_size      = 200
      disk_type      = "gp3"
      ami_type       = "AL2_x86_64_GPU"

      labels = {
        role                         = "gpu"
        "nvidia.com/gpu.present"     = "true"
        "nexustext.ai/llm-inference" = "true"
      }

      taints = {
        gpu = {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }

      tags = {
        "k8s.io/cluster-autoscaler/enabled"            = "true"
        "k8s.io/cluster-autoscaler/${var.cluster_name}" = "owned"
      }
    }
  } : {}

  # OIDC プロバイダー（IRSA 用）
  enable_irsa = true

  # クラスターアクセス管理
  enable_cluster_creator_admin_permissions = true

  tags = {
    Name = var.cluster_name
  }
}

# EKS KMS キー（Secrets 暗号化）
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster ${var.cluster_name} secrets encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "${var.cluster_name}-eks-kms"
  }
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.cluster_name}-eks"
  target_key_id = aws_kms_key.eks.key_id
}

# VPC CNI IRSA
module "vpc_cni_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.34"

  role_name             = "${var.cluster_name}-vpc-cni"
  attach_vpc_cni_policy = true
  vpc_cni_enable_ipv4   = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-node"]
    }
  }
}

# EBS CSI Driver IRSA
module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.34"

  role_name             = "${var.cluster_name}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
}

# ---------------------------------------------------------------------------
# ECR リポジトリ
# ---------------------------------------------------------------------------
resource "aws_ecr_repository" "backend" {
  name                 = "nexustext/backend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name      = "nexustext-backend"
    Component = "backend"
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "nexustext/frontend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name      = "nexustext-frontend"
    Component = "frontend"
  }
}

# ECR ライフサイクルポリシー（古いイメージ自動削除）
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Remove untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Remove untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# S3 バケット（モデルアーティファクト / ドキュメントストレージ）
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "nexustext_data" {
  bucket = "${var.cluster_name}-data-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name      = "${var.cluster_name}-data"
    Component = "storage"
  }
}

resource "aws_s3_bucket_versioning" "nexustext_data" {
  bucket = aws_s3_bucket.nexustext_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "nexustext_data" {
  bucket = aws_s3_bucket.nexustext_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "nexustext_data" {
  bucket = aws_s3_bucket.nexustext_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "nexustext_data" {
  bucket = aws_s3_bucket.nexustext_data.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_logging" "nexustext_data" {
  bucket = aws_s3_bucket.nexustext_data.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access-logs/"
}

# S3 ログバケット
resource "aws_s3_bucket" "logs" {
  bucket = "${var.cluster_name}-logs-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name      = "${var.cluster_name}-logs"
    Component = "logging"
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

# S3 KMS キー
resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 bucket encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "${var.cluster_name}-s3-kms"
  }
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${var.cluster_name}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

# ---------------------------------------------------------------------------
# API Gateway REST API（レート制限 / 使用量プラン付き）
# ---------------------------------------------------------------------------
resource "aws_api_gateway_rest_api" "nexustext" {
  name        = "${var.cluster_name}-api"
  description = "NexusText AI v7.0 REST API Gateway"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  body = jsonencode({
    openapi = "3.0.1"
    info = {
      title   = "NexusText AI API"
      version = "7.0.0"
    }
    paths = {}
  })

  tags = {
    Name      = "${var.cluster_name}-api"
    Component = "api-gateway"
  }
}

# プロキシリソース（全パス）
resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.nexustext.id
  parent_id   = aws_api_gateway_rest_api.nexustext.root_resource_id
  path_part   = "{proxy+}"
}

# ANY メソッド
resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.nexustext.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
  api_key_required = true

  request_parameters = {
    "method.request.path.proxy" = true
  }
}

# VPC Link 用 NLB
resource "aws_lb" "api_nlb" {
  name               = "${var.cluster_name}-api-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = module.vpc.private_subnets

  enable_deletion_protection = var.environment == "production"

  tags = {
    Name      = "${var.cluster_name}-api-nlb"
    Component = "networking"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.cluster_name}-api-tg"
  port        = 80
  protocol    = "TCP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    protocol            = "HTTP"
    path                = "/health/live"
    port                = "traffic-port"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    interval            = 30
  }

  tags = {
    Name = "${var.cluster_name}-api-tg"
  }
}

resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api_nlb.arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# VPC Link
resource "aws_api_gateway_vpc_link" "nexustext" {
  name        = "${var.cluster_name}-vpclink"
  target_arns = [aws_lb.api_nlb.arn]

  tags = {
    Name = "${var.cluster_name}-vpclink"
  }
}

# HTTP プロキシ統合
resource "aws_api_gateway_integration" "proxy" {
  rest_api_id             = aws_api_gateway_rest_api.nexustext.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "ANY"
  uri                     = "http://${aws_lb.api_nlb.dns_name}/{proxy}"
  connection_type         = "VPC_LINK"
  connection_id           = aws_api_gateway_vpc_link.nexustext.id

  request_parameters = {
    "integration.request.path.proxy" = "method.request.path.proxy"
  }

  timeout_milliseconds = 29000
}

# デプロイメント
resource "aws_api_gateway_deployment" "nexustext" {
  rest_api_id = aws_api_gateway_rest_api.nexustext.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.proxy.id,
      aws_api_gateway_method.proxy.id,
      aws_api_gateway_integration.proxy.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ステージ
resource "aws_api_gateway_stage" "nexustext" {
  deployment_id = aws_api_gateway_deployment.nexustext.id
  rest_api_id   = aws_api_gateway_rest_api.nexustext.id
  stage_name    = var.environment

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      caller         = "$context.identity.caller"
      user           = "$context.identity.user"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      latency        = "$context.integrationLatency"
    })
  }

  xray_tracing_enabled = true

  tags = {
    Name = "${var.cluster_name}-${var.environment}"
  }
}

# メソッド設定（スロットリング）
resource "aws_api_gateway_method_settings" "nexustext" {
  rest_api_id = aws_api_gateway_rest_api.nexustext.id
  stage_name  = aws_api_gateway_stage.nexustext.stage_name
  method_path = "*/*"

  settings {
    throttling_burst_limit = var.api_throttle_burst_limit
    throttling_rate_limit  = var.api_throttle_rate_limit
    metrics_enabled        = true
    logging_level          = "INFO"
    data_trace_enabled     = var.environment != "production"
  }
}

# API キー
resource "aws_api_gateway_api_key" "nexustext" {
  name        = "${var.cluster_name}-api-key"
  description = "API key for NexusText AI v7.0"
  enabled     = true
}

# 使用量プラン
resource "aws_api_gateway_usage_plan" "nexustext" {
  name        = "${var.cluster_name}-usage-plan"
  description = "NexusText API usage plan with rate limiting and quota"

  api_stages {
    api_id = aws_api_gateway_rest_api.nexustext.id
    stage  = aws_api_gateway_stage.nexustext.stage_name

    throttle {
      path        = "/*/*"
      burst_limit = var.api_throttle_burst_limit
      rate_limit  = var.api_throttle_rate_limit
    }
  }

  quota_settings {
    limit  = var.api_quota_limit
    offset = 0
    period = "MONTH"
  }

  throttle_settings {
    burst_limit = var.api_throttle_burst_limit
    rate_limit  = var.api_throttle_rate_limit
  }
}

# 使用量プランにキーを関連付け
resource "aws_api_gateway_usage_plan_key" "nexustext" {
  key_id        = aws_api_gateway_api_key.nexustext.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.nexustext.id
}

# WAF（Web Application Firewall）
resource "aws_wafv2_web_acl" "api_gateway" {
  name        = "${var.cluster_name}-api-waf"
  description = "WAF for NexusText API Gateway"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # レート制限ルール
  rule {
    name     = "rate-limit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.cluster_name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # AWS マネージドルール - 共通脅威
  rule {
    name     = "aws-managed-common"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.cluster_name}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # SQL インジェクション防止
  rule {
    name     = "aws-managed-sqli"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.cluster_name}-sqli-rules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.cluster_name}-api-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name      = "${var.cluster_name}-api-waf"
    Component = "security"
  }
}

resource "aws_wafv2_web_acl_association" "api_gateway" {
  resource_arn = aws_api_gateway_stage.nexustext.arn
  web_acl_arn  = aws_wafv2_web_acl.api_gateway.arn
}

# ---------------------------------------------------------------------------
# Secrets Manager
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "nexustext_db" {
  name                    = "${var.cluster_name}/database"
  description             = "NexusText database credentials"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.secrets.arn

  tags = {
    Name      = "${var.cluster_name}-db-secret"
    Component = "secrets"
  }
}

resource "aws_secretsmanager_secret_version" "nexustext_db" {
  secret_id = aws_secretsmanager_secret.nexustext_db.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    host     = "postgres-primary"
    port     = 5432
    database = "nexustext"
  })
}

resource "aws_secretsmanager_secret" "nexustext_api" {
  name                    = "${var.cluster_name}/api-keys"
  description             = "NexusText API keys and secrets"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.secrets.arn

  tags = {
    Name      = "${var.cluster_name}-api-secret"
    Component = "secrets"
  }
}

resource "aws_secretsmanager_secret_version" "nexustext_api" {
  secret_id = aws_secretsmanager_secret.nexustext_api.id
  secret_string = jsonencode({
    api_secret_key = var.api_secret_key
    jwt_secret     = var.jwt_secret
    redis_password = var.redis_password
  })
}

# Secrets KMS キー
resource "aws_kms_key" "secrets" {
  description             = "KMS key for Secrets Manager encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "${var.cluster_name}-secrets-kms"
  }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.cluster_name}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# ---------------------------------------------------------------------------
# CloudWatch - モニタリング / アラーム
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = {
    Name      = "${var.cluster_name}-eks-logs"
    Component = "monitoring"
  }
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.cluster_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = {
    Name      = "${var.cluster_name}-apigw-logs"
    Component = "monitoring"
  }
}

resource "aws_cloudwatch_log_group" "application" {
  name              = "/nexustext/${var.environment}/application"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = {
    Name      = "${var.cluster_name}-app-logs"
    Component = "monitoring"
  }
}

# CloudWatch KMS キー
resource "aws_kms_key" "cloudwatch" {
  description             = "KMS key for CloudWatch Logs encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${var.cluster_name}-cloudwatch-kms"
  }
}

# CloudWatch ダッシュボード
resource "aws_cloudwatch_dashboard" "nexustext" {
  dashboard_name = "${var.cluster_name}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiName", "${var.cluster_name}-api", { stat = "Sum" }],
            ["AWS/ApiGateway", "4XXError", "ApiName", "${var.cluster_name}-api", { stat = "Sum" }],
            ["AWS/ApiGateway", "5XXError", "ApiName", "${var.cluster_name}-api", { stat = "Sum" }]
          ]
          period = 300
          region = var.region
          title  = "API Gateway - Request Metrics"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiName", "${var.cluster_name}-api", { stat = "Average" }],
            ["AWS/ApiGateway", "IntegrationLatency", "ApiName", "${var.cluster_name}-api", { stat = "Average" }]
          ]
          period = 300
          region = var.region
          title  = "API Gateway - Latency"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["ContainerInsights", "node_cpu_utilization", "ClusterName", var.cluster_name, { stat = "Average" }],
            ["ContainerInsights", "node_memory_utilization", "ClusterName", var.cluster_name, { stat = "Average" }]
          ]
          period = 300
          region = var.region
          title  = "EKS Cluster - Resource Utilization"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["ContainerInsights", "pod_cpu_utilization", "ClusterName", var.cluster_name, "Namespace", "nexustext", { stat = "Average" }],
            ["ContainerInsights", "pod_memory_utilization", "ClusterName", var.cluster_name, "Namespace", "nexustext", { stat = "Average" }]
          ]
          period = 300
          region = var.region
          title  = "NexusText Pods - Resource Utilization"
          view   = "timeSeries"
        }
      }
    ]
  })
}

# CloudWatch アラーム
resource "aws_cloudwatch_metric_alarm" "api_5xx_errors" {
  alarm_name          = "${var.cluster_name}-api-5xx-errors"
  alarm_description   = "API Gateway 5XX error rate exceeds threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = var.alarm_5xx_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = "${var.cluster_name}-api"
  }

  alarm_actions = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []
  ok_actions    = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  tags = {
    Name      = "${var.cluster_name}-5xx-alarm"
    Component = "monitoring"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${var.cluster_name}-api-high-latency"
  alarm_description   = "API Gateway latency exceeds threshold"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Latency"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Average"
  threshold           = var.alarm_latency_threshold_ms
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = "${var.cluster_name}-api"
  }

  alarm_actions = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  tags = {
    Name      = "${var.cluster_name}-latency-alarm"
    Component = "monitoring"
  }
}

# ---------------------------------------------------------------------------
# Backend Pod 用 IRSA（S3 / Secrets Manager アクセス）
# ---------------------------------------------------------------------------
module "backend_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.34"

  role_name = "${var.cluster_name}-backend"

  role_policy_arns = {
    s3_access      = aws_iam_policy.backend_s3.arn
    secrets_access = aws_iam_policy.backend_secrets.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["nexustext:nexustext-backend"]
    }
  }
}

resource "aws_iam_policy" "backend_s3" {
  name        = "${var.cluster_name}-backend-s3"
  description = "Allow NexusText backend to access S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.nexustext_data.arn,
          "${aws_s3_bucket.nexustext_data.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_policy" "backend_secrets" {
  name        = "${var.cluster_name}-backend-secrets"
  description = "Allow NexusText backend to read Secrets Manager secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.nexustext_db.arn,
          aws_secretsmanager_secret.nexustext_api.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = [
          aws_kms_key.secrets.arn
        ]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Kubernetes アプリケーションモジュール
# ---------------------------------------------------------------------------
module "k8s_app" {
  source = "../modules/k8s-app"

  namespace          = "nexustext"
  environment        = var.environment
  container_registry = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  image_tag          = var.image_tag
  image_pull_policy  = "Always"

  api_gateway_url = "https://${aws_api_gateway_rest_api.nexustext.id}.execute-api.${var.region}.amazonaws.com/${var.environment}"
  frontend_url    = var.frontend_url

  backend_replicas  = var.backend_replicas
  frontend_replicas = var.frontend_replicas

  postgres_user     = var.db_username
  postgres_password = var.db_password
  redis_password    = var.redis_password
  api_secret_key    = var.api_secret_key
  jwt_secret        = var.jwt_secret

  storage_class_name = "gp3"

  backend_service_account_annotations = {
    "eks.amazonaws.com/role-arn" = module.backend_irsa.iam_role_arn
  }

  extra_env_vars = [
    {
      name  = "AWS_REGION"
      value = var.region
    },
    {
      name  = "S3_BUCKET"
      value = aws_s3_bucket.nexustext_data.bucket
    },
    {
      name  = "SECRETS_MANAGER_DB_ARN"
      value = aws_secretsmanager_secret.nexustext_db.arn
    },
    {
      name  = "CLOUD_PROVIDER"
      value = "aws"
    }
  ]

  depends_on = [module.eks]
}
