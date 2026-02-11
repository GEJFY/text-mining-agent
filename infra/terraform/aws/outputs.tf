###############################################################################
# NexusText AI v7.0 - AWS アウトプット定義
###############################################################################

# ---------------------------------------------------------------------------
# EKS クラスター
# ---------------------------------------------------------------------------
output "eks_cluster_endpoint" {
  description = "EKS cluster API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_version" {
  description = "EKS cluster Kubernetes version"
  value       = module.eks.cluster_version
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "eks_cluster_certificate_authority" {
  description = "Base64 encoded certificate data for cluster authentication"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_oidc_provider_arn" {
  description = "OIDC provider ARN for IRSA (IAM Roles for Service Accounts)"
  value       = module.eks.oidc_provider_arn
}

output "eks_kubeconfig_command" {
  description = "AWS CLI command to update kubeconfig"
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region}"
}

# ---------------------------------------------------------------------------
# API Gateway
# ---------------------------------------------------------------------------
output "api_gateway_url" {
  description = "API Gateway invocation URL"
  value       = "${aws_api_gateway_stage.nexustext.invoke_url}"
}

output "api_gateway_rest_api_id" {
  description = "API Gateway REST API ID"
  value       = aws_api_gateway_rest_api.nexustext.id
}

output "api_gateway_stage_name" {
  description = "API Gateway stage name"
  value       = aws_api_gateway_stage.nexustext.stage_name
}

output "api_key_id" {
  description = "API Gateway API key ID"
  value       = aws_api_gateway_api_key.nexustext.id
}

output "api_key_value" {
  description = "API Gateway API key value"
  value       = aws_api_gateway_api_key.nexustext.value
  sensitive   = true
}

# ---------------------------------------------------------------------------
# S3
# ---------------------------------------------------------------------------
output "s3_data_bucket_name" {
  description = "S3 bucket name for NexusText data storage"
  value       = aws_s3_bucket.nexustext_data.bucket
}

output "s3_data_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.nexustext_data.arn
}

output "s3_logs_bucket_name" {
  description = "S3 bucket name for access logs"
  value       = aws_s3_bucket.logs.bucket
}

# ---------------------------------------------------------------------------
# ECR
# ---------------------------------------------------------------------------
output "ecr_backend_repository_url" {
  description = "ECR repository URL for backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository_url" {
  description = "ECR repository URL for frontend image"
  value       = aws_ecr_repository.frontend.repository_url
}

# ---------------------------------------------------------------------------
# Secrets Manager
# ---------------------------------------------------------------------------
output "secrets_manager_db_arn" {
  description = "Secrets Manager ARN for database credentials"
  value       = aws_secretsmanager_secret.nexustext_db.arn
}

output "secrets_manager_api_arn" {
  description = "Secrets Manager ARN for API keys"
  value       = aws_secretsmanager_secret.nexustext_api.arn
}

# ---------------------------------------------------------------------------
# ネットワーク
# ---------------------------------------------------------------------------
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}

output "nlb_dns_name" {
  description = "Network Load Balancer DNS name for API backend"
  value       = aws_lb.api_nlb.dns_name
}

# ---------------------------------------------------------------------------
# モニタリング
# ---------------------------------------------------------------------------
output "cloudwatch_log_group_eks" {
  description = "CloudWatch log group for EKS cluster logs"
  value       = aws_cloudwatch_log_group.eks.name
}

output "cloudwatch_log_group_api_gateway" {
  description = "CloudWatch log group for API Gateway logs"
  value       = aws_cloudwatch_log_group.api_gateway.name
}

output "cloudwatch_dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${var.cluster_name}-overview"
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------
output "backend_irsa_role_arn" {
  description = "IAM role ARN for backend service account (IRSA)"
  value       = module.backend_irsa.iam_role_arn
}
