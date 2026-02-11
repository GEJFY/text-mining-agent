###############################################################################
# NexusText AI v7.0 - 共有 Kubernetes アプリケーションデプロイメントモジュール
# Helm チャートテンプレートによる backend / frontend / redis / postgres 構成
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.25.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.12.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
resource "kubernetes_namespace" "nexustext" {
  metadata {
    name = var.namespace

    labels = {
      app         = "nexustext"
      environment = var.environment
      managed-by  = "terraform"
      version     = "v7.0"
    }
  }
}

# ---------------------------------------------------------------------------
# ConfigMap - アプリケーション共通設定
# ---------------------------------------------------------------------------
resource "kubernetes_config_map" "nexustext_config" {
  metadata {
    name      = "nexustext-config"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  data = {
    APP_ENV              = var.environment
    APP_VERSION          = "7.0.0"
    LOG_LEVEL            = var.log_level
    REDIS_HOST           = "redis-master.${kubernetes_namespace.nexustext.metadata[0].name}.svc.cluster.local"
    REDIS_PORT           = "6379"
    POSTGRES_HOST        = "postgres-primary.${kubernetes_namespace.nexustext.metadata[0].name}.svc.cluster.local"
    POSTGRES_PORT        = "5432"
    POSTGRES_DB          = var.postgres_db_name
    API_RATE_LIMIT       = tostring(var.api_rate_limit)
    MAX_TOKENS_PER_REQ   = tostring(var.max_tokens_per_request)
    CORS_ALLOWED_ORIGINS = join(",", var.cors_allowed_origins)
    BACKEND_REPLICAS     = tostring(var.backend_replicas)
    FRONTEND_URL         = var.frontend_url
    TELEMETRY_ENABLED    = tostring(var.telemetry_enabled)
  }
}

# ---------------------------------------------------------------------------
# Secret - 機密情報（外部シークレットマネージャーから注入）
# ---------------------------------------------------------------------------
resource "kubernetes_secret" "nexustext_secrets" {
  metadata {
    name      = "nexustext-secrets"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  type = "Opaque"

  data = {
    POSTGRES_USER     = base64encode(var.postgres_user)
    POSTGRES_PASSWORD = base64encode(var.postgres_password)
    REDIS_PASSWORD    = base64encode(var.redis_password)
    API_SECRET_KEY    = base64encode(var.api_secret_key)
    JWT_SECRET        = base64encode(var.jwt_secret)
  }
}

# ---------------------------------------------------------------------------
# PostgreSQL - StatefulSet (プライマリ)
# ---------------------------------------------------------------------------
resource "kubernetes_stateful_set" "postgres" {
  metadata {
    name      = "postgres-primary"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "postgres"
      tier      = "database"
    }
  }

  spec {
    service_name = "postgres-primary"
    replicas     = 1

    selector {
      match_labels = {
        app       = "nexustext"
        component = "postgres"
      }
    }

    template {
      metadata {
        labels = {
          app       = "nexustext"
          component = "postgres"
          tier      = "database"
        }

        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "9187"
        }
      }

      spec {
        security_context {
          fs_group    = 999
          run_as_user = 999
        }

        container {
          name  = "postgres"
          image = "postgres:16-alpine"

          port {
            container_port = 5432
            name           = "postgresql"
          }

          env {
            name  = "POSTGRES_DB"
            value = var.postgres_db_name
          }

          env {
            name = "POSTGRES_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.nexustext_secrets.metadata[0].name
                key  = "POSTGRES_USER"
              }
            }
          }

          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.nexustext_secrets.metadata[0].name
                key  = "POSTGRES_PASSWORD"
              }
            }
          }

          env {
            name  = "PGDATA"
            value = "/var/lib/postgresql/data/pgdata"
          }

          resources {
            requests = {
              cpu    = var.postgres_resources.requests_cpu
              memory = var.postgres_resources.requests_memory
            }
            limits = {
              cpu    = var.postgres_resources.limits_cpu
              memory = var.postgres_resources.limits_memory
            }
          }

          volume_mount {
            name       = "postgres-data"
            mount_path = "/var/lib/postgresql/data"
          }

          liveness_probe {
            exec {
              command = ["pg_isready", "-U", "nexustext"]
            }
            initial_delay_seconds = 30
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 6
          }

          readiness_probe {
            exec {
              command = ["pg_isready", "-U", "nexustext"]
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 3
          }
        }

        # PostgreSQL Exporter サイドカー（メトリクス収集用）
        container {
          name  = "postgres-exporter"
          image = "prometheuscommunity/postgres-exporter:v0.15.0"

          port {
            container_port = 9187
            name           = "metrics"
          }

          env {
            name  = "DATA_SOURCE_URI"
            value = "localhost:5432/${var.postgres_db_name}?sslmode=disable"
          }

          env {
            name = "DATA_SOURCE_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.nexustext_secrets.metadata[0].name
                key  = "POSTGRES_USER"
              }
            }
          }

          env {
            name = "DATA_SOURCE_PASS"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.nexustext_secrets.metadata[0].name
                key  = "POSTGRES_PASSWORD"
              }
            }
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "64Mi"
            }
            limits = {
              cpu    = "100m"
              memory = "128Mi"
            }
          }
        }
      }
    }

    volume_claim_template {
      metadata {
        name = "postgres-data"
      }
      spec {
        access_modes       = ["ReadWriteOnce"]
        storage_class_name = var.storage_class_name

        resources {
          requests = {
            storage = var.postgres_storage_size
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "postgres" {
  metadata {
    name      = "postgres-primary"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "postgres"
    }
  }

  spec {
    type = "ClusterIP"

    selector = {
      app       = "nexustext"
      component = "postgres"
    }

    port {
      name        = "postgresql"
      port        = 5432
      target_port = 5432
    }

    port {
      name        = "metrics"
      port        = 9187
      target_port = 9187
    }
  }
}

# ---------------------------------------------------------------------------
# Redis - Deployment (キャッシュ / セッション / キュー)
# ---------------------------------------------------------------------------
resource "kubernetes_deployment" "redis" {
  metadata {
    name      = "redis-master"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "redis"
      tier      = "cache"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app       = "nexustext"
        component = "redis"
      }
    }

    template {
      metadata {
        labels = {
          app       = "nexustext"
          component = "redis"
          tier      = "cache"
        }

        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "9121"
        }
      }

      spec {
        security_context {
          fs_group    = 1000
          run_as_user = 1000
        }

        container {
          name  = "redis"
          image = "redis:7-alpine"

          command = [
            "redis-server",
            "--requirepass", "$(REDIS_PASSWORD)",
            "--maxmemory", var.redis_max_memory,
            "--maxmemory-policy", "allkeys-lru",
            "--appendonly", "yes",
            "--appendfsync", "everysec"
          ]

          port {
            container_port = 6379
            name           = "redis"
          }

          env {
            name = "REDIS_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.nexustext_secrets.metadata[0].name
                key  = "REDIS_PASSWORD"
              }
            }
          }

          resources {
            requests = {
              cpu    = var.redis_resources.requests_cpu
              memory = var.redis_resources.requests_memory
            }
            limits = {
              cpu    = var.redis_resources.limits_cpu
              memory = var.redis_resources.limits_memory
            }
          }

          volume_mount {
            name       = "redis-data"
            mount_path = "/data"
          }

          liveness_probe {
            exec {
              command = ["redis-cli", "ping"]
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 5
          }

          readiness_probe {
            exec {
              command = ["redis-cli", "ping"]
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
          }
        }

        # Redis Exporter サイドカー
        container {
          name  = "redis-exporter"
          image = "oliver006/redis_exporter:v1.56.0"

          port {
            container_port = 9121
            name           = "metrics"
          }

          env {
            name = "REDIS_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.nexustext_secrets.metadata[0].name
                key  = "REDIS_PASSWORD"
              }
            }
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "64Mi"
            }
            limits = {
              cpu    = "100m"
              memory = "128Mi"
            }
          }
        }

        volume {
          name = "redis-data"
          empty_dir {
            size_limit = "2Gi"
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "redis" {
  metadata {
    name      = "redis-master"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "redis"
    }
  }

  spec {
    type = "ClusterIP"

    selector = {
      app       = "nexustext"
      component = "redis"
    }

    port {
      name        = "redis"
      port        = 6379
      target_port = 6379
    }

    port {
      name        = "metrics"
      port        = 9121
      target_port = 9121
    }
  }
}

# ---------------------------------------------------------------------------
# Backend API - Deployment
# ---------------------------------------------------------------------------
resource "kubernetes_deployment" "backend" {
  metadata {
    name      = "nexustext-backend"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "backend"
      tier      = "api"
      version   = "v7.0"
    }
  }

  spec {
    replicas = var.backend_replicas

    strategy {
      type = "RollingUpdate"
      rolling_update {
        max_surge       = "25%"
        max_unavailable = "10%"
      }
    }

    selector {
      match_labels = {
        app       = "nexustext"
        component = "backend"
      }
    }

    template {
      metadata {
        labels = {
          app       = "nexustext"
          component = "backend"
          tier      = "api"
          version   = "v7.0"
        }

        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "8000"
          "prometheus.io/path"   = "/metrics"
        }
      }

      spec {
        service_account_name             = kubernetes_service_account.backend.metadata[0].name
        automount_service_account_token  = true
        termination_grace_period_seconds = 60

        # Pod Anti-Affinity: 可用性のために異なるノードに分散
        affinity {
          pod_anti_affinity {
            preferred_during_scheduling_ignored_during_execution {
              weight = 100
              pod_affinity_term {
                label_selector {
                  match_expressions {
                    key      = "component"
                    operator = "In"
                    values   = ["backend"]
                  }
                }
                topology_key = "kubernetes.io/hostname"
              }
            }
          }
        }

        init_container {
          name  = "wait-for-postgres"
          image = "busybox:1.36"
          command = [
            "sh", "-c",
            "until nc -z postgres-primary 5432; do echo 'Waiting for PostgreSQL...'; sleep 2; done"
          ]
        }

        init_container {
          name  = "wait-for-redis"
          image = "busybox:1.36"
          command = [
            "sh", "-c",
            "until nc -z redis-master 6379; do echo 'Waiting for Redis...'; sleep 2; done"
          ]
        }

        init_container {
          name  = "run-migrations"
          image = "${var.container_registry}/${var.backend_image}:${var.image_tag}"
          command = ["python", "-m", "alembic", "upgrade", "head"]

          env_from {
            config_map_ref {
              name = kubernetes_config_map.nexustext_config.metadata[0].name
            }
          }

          env_from {
            secret_ref {
              name = kubernetes_secret.nexustext_secrets.metadata[0].name
            }
          }
        }

        container {
          name              = "backend"
          image             = "${var.container_registry}/${var.backend_image}:${var.image_tag}"
          image_pull_policy = var.image_pull_policy

          port {
            container_port = 8000
            name           = "http"
            protocol       = "TCP"
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.nexustext_config.metadata[0].name
            }
          }

          env_from {
            secret_ref {
              name = kubernetes_secret.nexustext_secrets.metadata[0].name
            }
          }

          # クラウドプロバイダー固有の環境変数
          dynamic "env" {
            for_each = var.extra_env_vars
            content {
              name  = env.value.name
              value = env.value.value
            }
          }

          resources {
            requests = {
              cpu    = var.backend_resources.requests_cpu
              memory = var.backend_resources.requests_memory
            }
            limits = {
              cpu    = var.backend_resources.limits_cpu
              memory = var.backend_resources.limits_memory
            }
          }

          liveness_probe {
            http_get {
              path = "/health/live"
              port = 8000
            }
            initial_delay_seconds = 30
            period_seconds        = 15
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/health/ready"
              port = 8000
            }
            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          startup_probe {
            http_get {
              path = "/health/live"
              port = 8000
            }
            initial_delay_seconds = 5
            period_seconds        = 5
            failure_threshold     = 30
          }

          volume_mount {
            name       = "tmp"
            mount_path = "/tmp"
          }
        }

        volume {
          name = "tmp"
          empty_dir {}
        }
      }
    }
  }

  depends_on = [
    kubernetes_stateful_set.postgres,
    kubernetes_deployment.redis,
  ]
}

resource "kubernetes_service" "backend" {
  metadata {
    name      = "nexustext-backend"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "backend"
    }

    annotations = var.backend_service_annotations
  }

  spec {
    type = var.backend_service_type

    selector = {
      app       = "nexustext"
      component = "backend"
    }

    port {
      name        = "http"
      port        = 80
      target_port = 8000
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_service_account" "backend" {
  metadata {
    name      = "nexustext-backend"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "backend"
    }

    annotations = var.backend_service_account_annotations
  }
}

# ---------------------------------------------------------------------------
# Backend Horizontal Pod Autoscaler
# ---------------------------------------------------------------------------
resource "kubernetes_horizontal_pod_autoscaler_v2" "backend" {
  metadata {
    name      = "nexustext-backend"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.backend.metadata[0].name
    }

    min_replicas = var.backend_replicas
    max_replicas = var.backend_max_replicas

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }

    metric {
      type = "Resource"
      resource {
        name = "memory"
        target {
          type                = "Utilization"
          average_utilization = 80
        }
      }
    }

    behavior {
      scale_up {
        stabilization_window_seconds = 60
        select_policy                = "Max"
        policy {
          type           = "Pods"
          value          = 2
          period_seconds = 60
        }
      }
      scale_down {
        stabilization_window_seconds = 300
        select_policy                = "Min"
        policy {
          type           = "Pods"
          value          = 1
          period_seconds = 120
        }
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Frontend - Deployment
# ---------------------------------------------------------------------------
resource "kubernetes_deployment" "frontend" {
  metadata {
    name      = "nexustext-frontend"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "frontend"
      tier      = "web"
      version   = "v7.0"
    }
  }

  spec {
    replicas = var.frontend_replicas

    strategy {
      type = "RollingUpdate"
      rolling_update {
        max_surge       = "50%"
        max_unavailable = "25%"
      }
    }

    selector {
      match_labels = {
        app       = "nexustext"
        component = "frontend"
      }
    }

    template {
      metadata {
        labels = {
          app       = "nexustext"
          component = "frontend"
          tier      = "web"
          version   = "v7.0"
        }
      }

      spec {
        automount_service_account_token  = false
        termination_grace_period_seconds = 30

        affinity {
          pod_anti_affinity {
            preferred_during_scheduling_ignored_during_execution {
              weight = 100
              pod_affinity_term {
                label_selector {
                  match_expressions {
                    key      = "component"
                    operator = "In"
                    values   = ["frontend"]
                  }
                }
                topology_key = "kubernetes.io/hostname"
              }
            }
          }
        }

        container {
          name              = "frontend"
          image             = "${var.container_registry}/${var.frontend_image}:${var.image_tag}"
          image_pull_policy = var.image_pull_policy

          port {
            container_port = 3000
            name           = "http"
            protocol       = "TCP"
          }

          env {
            name  = "NEXT_PUBLIC_API_URL"
            value = var.api_gateway_url
          }

          env {
            name  = "NEXT_PUBLIC_APP_VERSION"
            value = "7.0.0"
          }

          env {
            name  = "NODE_ENV"
            value = var.environment == "production" ? "production" : "development"
          }

          resources {
            requests = {
              cpu    = var.frontend_resources.requests_cpu
              memory = var.frontend_resources.requests_memory
            }
            limits = {
              cpu    = var.frontend_resources.limits_cpu
              memory = var.frontend_resources.limits_memory
            }
          }

          liveness_probe {
            http_get {
              path = "/api/health"
              port = 3000
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 5
          }

          readiness_probe {
            http_get {
              path = "/api/health"
              port = 3000
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "frontend" {
  metadata {
    name      = "nexustext-frontend"
    namespace = kubernetes_namespace.nexustext.metadata[0].name

    labels = {
      app       = "nexustext"
      component = "frontend"
    }

    annotations = var.frontend_service_annotations
  }

  spec {
    type = var.frontend_service_type

    selector = {
      app       = "nexustext"
      component = "frontend"
    }

    port {
      name        = "http"
      port        = 80
      target_port = 3000
      protocol    = "TCP"
    }
  }
}

# ---------------------------------------------------------------------------
# Frontend Horizontal Pod Autoscaler
# ---------------------------------------------------------------------------
resource "kubernetes_horizontal_pod_autoscaler_v2" "frontend" {
  metadata {
    name      = "nexustext-frontend"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.frontend.metadata[0].name
    }

    min_replicas = var.frontend_replicas
    max_replicas = var.frontend_max_replicas

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 75
        }
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Network Policy - Pod 間通信制御
# ---------------------------------------------------------------------------
resource "kubernetes_network_policy" "backend_policy" {
  metadata {
    name      = "nexustext-backend-netpol"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  spec {
    pod_selector {
      match_labels = {
        app       = "nexustext"
        component = "backend"
      }
    }

    policy_types = ["Ingress", "Egress"]

    # インバウンド: フロントエンド / Ingress コントローラーからのみ許可
    ingress {
      from {
        pod_selector {
          match_labels = {
            app       = "nexustext"
            component = "frontend"
          }
        }
      }
      from {
        namespace_selector {
          match_labels = {
            name = "ingress-nginx"
          }
        }
      }
      ports {
        port     = "8000"
        protocol = "TCP"
      }
    }

    # アウトバウンド: PostgreSQL, Redis, DNS, HTTPS
    egress {
      to {
        pod_selector {
          match_labels = {
            app       = "nexustext"
            component = "postgres"
          }
        }
      }
      ports {
        port     = "5432"
        protocol = "TCP"
      }
    }

    egress {
      to {
        pod_selector {
          match_labels = {
            app       = "nexustext"
            component = "redis"
          }
        }
      }
      ports {
        port     = "6379"
        protocol = "TCP"
      }
    }

    # DNS アクセス許可
    egress {
      ports {
        port     = "53"
        protocol = "UDP"
      }
      ports {
        port     = "53"
        protocol = "TCP"
      }
    }

    # 外部 HTTPS アクセス（AI モデル API など）
    egress {
      ports {
        port     = "443"
        protocol = "TCP"
      }
    }
  }
}

resource "kubernetes_network_policy" "postgres_policy" {
  metadata {
    name      = "nexustext-postgres-netpol"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  spec {
    pod_selector {
      match_labels = {
        app       = "nexustext"
        component = "postgres"
      }
    }

    policy_types = ["Ingress"]

    ingress {
      from {
        pod_selector {
          match_labels = {
            app       = "nexustext"
            component = "backend"
          }
        }
      }
      ports {
        port     = "5432"
        protocol = "TCP"
      }
    }
  }
}

resource "kubernetes_network_policy" "redis_policy" {
  metadata {
    name      = "nexustext-redis-netpol"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  spec {
    pod_selector {
      match_labels = {
        app       = "nexustext"
        component = "redis"
      }
    }

    policy_types = ["Ingress"]

    ingress {
      from {
        pod_selector {
          match_labels = {
            app       = "nexustext"
            component = "backend"
          }
        }
      }
      ports {
        port     = "6379"
        protocol = "TCP"
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Pod Disruption Budget - 可用性保証
# ---------------------------------------------------------------------------
resource "kubernetes_pod_disruption_budget_v1" "backend_pdb" {
  metadata {
    name      = "nexustext-backend-pdb"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  spec {
    min_available = var.backend_replicas > 1 ? "${ceil(var.backend_replicas * 0.5)}" : "1"

    selector {
      match_labels = {
        app       = "nexustext"
        component = "backend"
      }
    }
  }
}

resource "kubernetes_pod_disruption_budget_v1" "frontend_pdb" {
  metadata {
    name      = "nexustext-frontend-pdb"
    namespace = kubernetes_namespace.nexustext.metadata[0].name
  }

  spec {
    min_available = var.frontend_replicas > 1 ? "${ceil(var.frontend_replicas * 0.5)}" : "1"

    selector {
      match_labels = {
        app       = "nexustext"
        component = "frontend"
      }
    }
  }
}
