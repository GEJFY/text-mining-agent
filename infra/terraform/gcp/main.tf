###############################################################################
# NexusText AI v7.0 - GCP インフラストラクチャ定義
# GKE / Cloud Endpoints (API Gateway) / GCS / Secret Manager /
# Cloud Monitoring / Artifact Registry
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.20"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.20"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }

  backend "gcs" {
    bucket = "nexustext-terraform-state"
    prefix = "gcp/terraform.tfstate"
  }
}

# ---------------------------------------------------------------------------
# Provider 設定
# ---------------------------------------------------------------------------
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

provider "kubernetes" {
  host                   = "https://${google_container_cluster.nexustext.endpoint}"
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(google_container_cluster.nexustext.master_auth[0].cluster_ca_certificate)
}

provider "helm" {
  kubernetes {
    host                   = "https://${google_container_cluster.nexustext.endpoint}"
    token                  = data.google_client_config.default.access_token
    cluster_ca_certificate = base64decode(google_container_cluster.nexustext.master_auth[0].cluster_ca_certificate)
  }
}

# ---------------------------------------------------------------------------
# Data Sources
# ---------------------------------------------------------------------------
data "google_client_config" "default" {}

data "google_project" "current" {}

data "google_compute_zones" "available" {
  region = var.region
  status = "UP"
}

# ---------------------------------------------------------------------------
# 有効化する API サービス
# ---------------------------------------------------------------------------
resource "google_project_service" "required_services" {
  for_each = toset([
    "container.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "apigateway.googleapis.com",
    "servicecontrol.googleapis.com",
    "servicemanagement.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
  ])

  project = var.project_id
  service = each.key

  disable_dependent_services = false
  disable_on_destroy         = false
}

# ---------------------------------------------------------------------------
# VPC ネットワーク
# ---------------------------------------------------------------------------
resource "google_compute_network" "nexustext" {
  name                    = "${var.cluster_name}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required_services]
}

resource "google_compute_subnetwork" "gke_nodes" {
  name          = "${var.cluster_name}-nodes"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.nexustext.id
  ip_cidr_range = var.nodes_subnet_cidr

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.services_cidr
  }

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Cloud NAT（プライベートノードから外部アクセス用）
resource "google_compute_router" "nexustext" {
  name    = "${var.cluster_name}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.nexustext.id
}

resource "google_compute_router_nat" "nexustext" {
  name                               = "${var.cluster_name}-nat"
  project                            = var.project_id
  router                             = google_compute_router.nexustext.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ファイアウォールルール
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.cluster_name}-allow-internal"
  project = var.project_id
  network = google_compute_network.nexustext.id

  allow {
    protocol = "tcp"
  }

  allow {
    protocol = "udp"
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [
    var.nodes_subnet_cidr,
    var.pods_cidr,
    var.services_cidr,
  ]
}

# ---------------------------------------------------------------------------
# GKE クラスター
# ---------------------------------------------------------------------------
resource "google_container_cluster" "nexustext" {
  provider = google-beta

  name     = var.cluster_name
  project  = var.project_id
  location = var.regional_cluster ? var.region : "${var.region}-a"

  # VPC ネイティブクラスター
  network    = google_compute_network.nexustext.id
  subnetwork = google_compute_subnetwork.gke_nodes.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # デフォルトノードプールは削除（別途管理）
  remove_default_node_pool = true
  initial_node_count       = 1

  # リリースチャネル
  release_channel {
    channel = var.environment == "production" ? "STABLE" : "REGULAR"
  }

  # プライベートクラスター
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr
  }

  # Master authorized networks
  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_cidrs
      content {
        cidr_block   = cidr_blocks.value.cidr
        display_name = cidr_blocks.value.name
      }
    }
  }

  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # セキュリティ設定
  enable_shielded_nodes = true

  binary_authorization {
    evaluation_mode = var.environment == "production" ? "PROJECT_SINGLETON_POLICY_ENFORCE" : "DISABLED"
  }

  # ネットワークポリシー
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  # クラスターアドオン
  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
    network_policy_config {
      disabled = false
    }
    gce_persistent_disk_csi_driver_config {
      enabled = true
    }
    dns_cache_config {
      enabled = true
    }
  }

  # ロギング / モニタリング
  logging_config {
    enable_components = [
      "SYSTEM_COMPONENTS",
      "WORKLOADS",
      "APISERVER",
      "CONTROLLER_MANAGER",
      "SCHEDULER"
    ]
  }

  monitoring_config {
    enable_components = [
      "SYSTEM_COMPONENTS",
      "APISERVER",
      "CONTROLLER_MANAGER",
      "SCHEDULER"
    ]

    managed_prometheus {
      enabled = true
    }
  }

  # メンテナンスウィンドウ
  maintenance_policy {
    recurring_window {
      start_time = "2024-01-01T02:00:00Z"
      end_time   = "2024-01-01T06:00:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=SU"
    }
  }

  # 暗号化
  database_encryption {
    state    = "ENCRYPTED"
    key_name = google_kms_crypto_key.gke.id
  }

  resource_labels = {
    project     = "nexustext"
    environment = var.environment
    managed-by  = "terraform"
    version     = "v7-0"
  }

  depends_on = [
    google_project_service.required_services,
    google_kms_crypto_key_iam_member.gke_encrypt,
  ]
}

# システムノードプール
resource "google_container_node_pool" "system" {
  name     = "system"
  project  = var.project_id
  location = var.regional_cluster ? var.region : "${var.region}-a"
  cluster  = google_container_cluster.nexustext.name

  initial_node_count = 1

  autoscaling {
    min_node_count = 1
    max_node_count = 3
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
    strategy        = "SURGE"
  }

  node_config {
    machine_type = var.system_machine_type
    disk_size_gb = 100
    disk_type    = "pd-ssd"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = {
      role = "system"
    }

    taint {
      key    = "CriticalAddonsOnly"
      value  = "true"
      effect = "PREFER_NO_SCHEDULE"
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }
}

# アプリケーションノードプール
resource "google_container_node_pool" "app" {
  name     = "app"
  project  = var.project_id
  location = var.regional_cluster ? var.region : "${var.region}-a"
  cluster  = google_container_cluster.nexustext.name

  initial_node_count = var.app_node_min_count

  autoscaling {
    min_node_count = var.app_node_min_count
    max_node_count = var.app_node_max_count
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 2
    max_unavailable = 0
    strategy        = "SURGE"
  }

  node_config {
    machine_type = var.app_machine_type
    disk_size_gb = 128
    disk_type    = "pd-ssd"
    spot         = var.use_preemptible_nodes

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = {
      role        = "app"
      environment = var.environment
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }
  }
}

# GKE 暗号化用 KMS
resource "google_kms_key_ring" "nexustext" {
  name     = "${var.cluster_name}-keyring"
  project  = var.project_id
  location = var.region

  depends_on = [google_project_service.required_services]
}

resource "google_kms_crypto_key" "gke" {
  name     = "${var.cluster_name}-gke-key"
  key_ring = google_kms_key_ring.nexustext.id

  rotation_period = "7776000s" # 90 日

  lifecycle {
    prevent_destroy = true
  }
}

# GKE サービスアカウントに KMS 暗号化権限を付与
resource "google_kms_crypto_key_iam_member" "gke_encrypt" {
  crypto_key_id = google_kms_crypto_key.gke.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@container-engine-robot.iam.gserviceaccount.com"
}

# ---------------------------------------------------------------------------
# Artifact Registry
# ---------------------------------------------------------------------------
resource "google_artifact_registry_repository" "nexustext" {
  provider = google-beta

  location      = var.region
  project       = var.project_id
  repository_id = "nexustext"
  description   = "NexusText AI v7.0 container images"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-tagged-releases"
    action = "KEEP"

    condition {
      tag_state  = "TAGGED"
      tag_prefixes = ["v"]
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7日
    }
  }

  docker_config {
    immutable_tags = true
  }

  depends_on = [google_project_service.required_services]
}

# ---------------------------------------------------------------------------
# GCS バケット（モデルアーティファクト / ドキュメントストレージ）
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "nexustext_data" {
  name          = "${var.project_id}-nexustext-data"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.gcs.id
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 5
    }
    action {
      type = "Delete"
    }
  }

  logging {
    log_bucket = google_storage_bucket.logs.id
  }

  labels = {
    project     = "nexustext"
    environment = var.environment
    managed-by  = "terraform"
  }

  depends_on = [google_kms_crypto_key_iam_member.gcs_encrypt]
}

# ログバケット
resource "google_storage_bucket" "logs" {
  name          = "${var.project_id}-nexustext-logs"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    project     = "nexustext"
    environment = var.environment
    component   = "logging"
  }
}

# GCS 暗号化 KMS キー
resource "google_kms_crypto_key" "gcs" {
  name     = "${var.cluster_name}-gcs-key"
  key_ring = google_kms_key_ring.nexustext.id

  rotation_period = "7776000s" # 90 日

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "gcs_encrypt" {
  crypto_key_id = google_kms_crypto_key.gcs.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@gs-project-accounts.iam.gserviceaccount.com"
}

# ---------------------------------------------------------------------------
# API Gateway (Cloud Endpoints + API Gateway)
# ---------------------------------------------------------------------------

# API Gateway 用サービスアカウント
resource "google_service_account" "api_gateway" {
  account_id   = "${var.cluster_name}-apigw"
  display_name = "NexusText API Gateway Service Account"
  project      = var.project_id
}

# API Gateway API 定義
resource "google_api_gateway_api" "nexustext" {
  provider = google-beta

  api_id  = "${var.cluster_name}-api"
  project = var.project_id

  depends_on = [google_project_service.required_services]
}

# OpenAPI 仕様（レート制限 / 認証設定含む）
resource "google_api_gateway_api_config" "nexustext" {
  provider = google-beta

  api           = google_api_gateway_api.nexustext.api_id
  api_config_id = "${var.cluster_name}-config-${formatdate("YYYYMMDDHHmmss", timestamp())}"
  project       = var.project_id

  openapi_documents {
    document {
      path = "openapi.yaml"
      contents = base64encode(templatefile("${path.module}/templates/openapi.yaml.tpl", {
        project_id       = var.project_id
        cluster_name     = var.cluster_name
        backend_address  = google_container_cluster.nexustext.endpoint
        api_title        = "NexusText AI API"
        api_version      = "7.0.0"
        rate_limit_rpm   = var.api_rate_limit_rpm
        quota_per_day    = var.api_quota_per_day
      }))
    }
  }

  gateway_config {
    backend_config {
      google_service_account = google_service_account.api_gateway.email
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# API Gateway デプロイメント
resource "google_api_gateway_gateway" "nexustext" {
  provider = google-beta

  api_config = google_api_gateway_api_config.nexustext.id
  gateway_id = "${var.cluster_name}-gateway"
  project    = var.project_id
  region     = var.region

  depends_on = [google_api_gateway_api_config.nexustext]
}

# ---------------------------------------------------------------------------
# Secret Manager
# ---------------------------------------------------------------------------
resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.cluster_name}-db-password"
  project   = var.project_id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    project     = "nexustext"
    environment = var.environment
    component   = "database"
  }

  depends_on = [google_project_service.required_services]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}

resource "google_secret_manager_secret" "redis_password" {
  secret_id = "${var.cluster_name}-redis-password"
  project   = var.project_id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    project     = "nexustext"
    environment = var.environment
    component   = "cache"
  }

  depends_on = [google_project_service.required_services]
}

resource "google_secret_manager_secret_version" "redis_password" {
  secret      = google_secret_manager_secret.redis_password.id
  secret_data = var.redis_password
}

resource "google_secret_manager_secret" "api_secret_key" {
  secret_id = "${var.cluster_name}-api-secret-key"
  project   = var.project_id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    project     = "nexustext"
    environment = var.environment
    component   = "api"
  }

  depends_on = [google_project_service.required_services]
}

resource "google_secret_manager_secret_version" "api_secret_key" {
  secret      = google_secret_manager_secret.api_secret_key.id
  secret_data = var.api_secret_key
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "${var.cluster_name}-jwt-secret"
  project   = var.project_id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = {
    project     = "nexustext"
    environment = var.environment
    component   = "auth"
  }

  depends_on = [google_project_service.required_services]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = var.jwt_secret
}

# ---------------------------------------------------------------------------
# Workload Identity - バックエンド用サービスアカウント
# ---------------------------------------------------------------------------
resource "google_service_account" "backend" {
  account_id   = "${var.cluster_name}-backend"
  display_name = "NexusText Backend Workload Identity"
  project      = var.project_id
}

# GCS アクセス権限
resource "google_storage_bucket_iam_member" "backend_gcs" {
  bucket = google_storage_bucket.nexustext_data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

# Secret Manager アクセス権限
resource "google_secret_manager_secret_iam_member" "backend_db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_redis_password" {
  secret_id = google_secret_manager_secret.redis_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_api_secret" {
  secret_id = google_secret_manager_secret.api_secret_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_jwt_secret" {
  secret_id = google_secret_manager_secret.jwt_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

# Monitoring メトリクス書き込み権限
resource "google_project_iam_member" "backend_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "backend_trace" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Workload Identity バインディング
resource "google_service_account_iam_member" "backend_workload_identity" {
  service_account_id = google_service_account.backend.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[nexustext/nexustext-backend]"
}

# ---------------------------------------------------------------------------
# Cloud Monitoring - アラートポリシー
# ---------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "email" {
  for_each = toset(var.alert_email_addresses)

  display_name = "NexusText Alert - ${each.value}"
  type         = "email"
  project      = var.project_id

  labels = {
    email_address = each.value
  }
}

resource "google_monitoring_alert_policy" "api_error_rate" {
  display_name = "${var.cluster_name} - High API Error Rate"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "API 5xx Error Rate > ${var.alert_error_rate_threshold}%"

    condition_threshold {
      filter          = "resource.type = \"api\" AND metric.type = \"apigateway.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_error_rate_threshold
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [
    for ch in google_monitoring_notification_channel.email : ch.name
  ]

  alert_strategy {
    auto_close = "1800s"

    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "NexusText API Gateway is experiencing elevated 5xx error rates. Investigate backend pod health and API Gateway logs."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "gke_cpu" {
  display_name = "${var.cluster_name} - High GKE CPU Utilization"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "GKE CPU Utilization > 85%"

    condition_threshold {
      filter          = "resource.type = \"k8s_node\" AND resource.labels.cluster_name = \"${var.cluster_name}\" AND metric.type = \"kubernetes.io/node/cpu/allocatable_utilization\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [
    for ch in google_monitoring_notification_channel.email : ch.name
  ]

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "GKE cluster node CPU utilization is above 85%. Consider scaling up the node pool or optimizing workloads."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "gke_memory" {
  display_name = "${var.cluster_name} - High GKE Memory Utilization"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "GKE Memory Utilization > 85%"

    condition_threshold {
      filter          = "resource.type = \"k8s_node\" AND resource.labels.cluster_name = \"${var.cluster_name}\" AND metric.type = \"kubernetes.io/node/memory/allocatable_utilization\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [
    for ch in google_monitoring_notification_channel.email : ch.name
  ]

  alert_strategy {
    auto_close = "1800s"
  }
}

# Cloud Monitoring ダッシュボード
resource "google_monitoring_dashboard" "nexustext" {
  project        = var.project_id
  dashboard_json = jsonencode({
    displayName = "NexusText AI v7.0 - Overview"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          xPos   = 0
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "API Gateway - Request Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type = \"apigateway.googleapis.com/Gateway\" AND metric.type = \"apigateway.googleapis.com/request_count\""
                    aggregation = {
                      alignmentPeriod  = "300s"
                      perSeriesAligner = "ALIGN_RATE"
                    }
                  }
                }
              }]
            }
          }
        },
        {
          xPos   = 6
          yPos   = 0
          width  = 6
          height = 4
          widget = {
            title = "API Gateway - Latency (p99)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type = \"apigateway.googleapis.com/Gateway\" AND metric.type = \"apigateway.googleapis.com/response_latencies\""
                    aggregation = {
                      alignmentPeriod    = "300s"
                      perSeriesAligner   = "ALIGN_PERCENTILE_99"
                    }
                  }
                }
              }]
            }
          }
        },
        {
          xPos   = 0
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "GKE Node CPU Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type = \"k8s_node\" AND resource.labels.cluster_name = \"${var.cluster_name}\" AND metric.type = \"kubernetes.io/node/cpu/allocatable_utilization\""
                    aggregation = {
                      alignmentPeriod  = "300s"
                      perSeriesAligner = "ALIGN_MEAN"
                    }
                  }
                }
              }]
            }
          }
        },
        {
          xPos   = 6
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "GKE Pod Count (nexustext namespace)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type = \"k8s_pod\" AND resource.labels.cluster_name = \"${var.cluster_name}\" AND resource.labels.namespace_name = \"nexustext\" AND metric.type = \"kubernetes.io/pod/network/received_bytes_count\""
                    aggregation = {
                      alignmentPeriod    = "300s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_COUNT"
                    }
                  }
                }
              }]
            }
          }
        }
      ]
    }
  })
}

# ---------------------------------------------------------------------------
# Log Sink（長期保存用 GCS エクスポート）
# ---------------------------------------------------------------------------
resource "google_logging_project_sink" "nexustext_logs" {
  name        = "${var.cluster_name}-log-sink"
  project     = var.project_id
  destination = "storage.googleapis.com/${google_storage_bucket.logs.name}"
  filter      = "resource.type = \"k8s_container\" AND resource.labels.cluster_name = \"${var.cluster_name}\" AND resource.labels.namespace_name = \"nexustext\""

  unique_writer_identity = true
}

resource "google_storage_bucket_iam_member" "log_sink_writer" {
  bucket = google_storage_bucket.logs.name
  role   = "roles/storage.objectCreator"
  member = google_logging_project_sink.nexustext_logs.writer_identity
}

# ---------------------------------------------------------------------------
# Kubernetes アプリケーションモジュール
# ---------------------------------------------------------------------------
module "k8s_app" {
  source = "../modules/k8s-app"

  namespace          = "nexustext"
  environment        = var.environment
  container_registry = "${var.region}-docker.pkg.dev/${var.project_id}/nexustext"
  image_tag          = var.image_tag
  image_pull_policy  = "Always"

  api_gateway_url = google_api_gateway_gateway.nexustext.default_hostname
  frontend_url    = var.frontend_url

  backend_replicas  = var.backend_replicas
  frontend_replicas = var.frontend_replicas

  postgres_user     = var.db_username
  postgres_password = var.db_password
  redis_password    = var.redis_password
  api_secret_key    = var.api_secret_key
  jwt_secret        = var.jwt_secret

  storage_class_name = "premium-rwo"

  backend_service_account_annotations = {
    "iam.gke.io/gcp-service-account" = google_service_account.backend.email
  }

  extra_env_vars = [
    {
      name  = "GCP_PROJECT_ID"
      value = var.project_id
    },
    {
      name  = "GCS_BUCKET"
      value = google_storage_bucket.nexustext_data.name
    },
    {
      name  = "SECRET_MANAGER_PROJECT"
      value = var.project_id
    },
    {
      name  = "CLOUD_PROVIDER"
      value = "gcp"
    }
  ]

  depends_on = [
    google_container_cluster.nexustext,
    google_container_node_pool.app,
  ]
}
