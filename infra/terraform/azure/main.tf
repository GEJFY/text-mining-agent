###############################################################################
# NexusText AI v7.0 - Azure インフラストラクチャ定義
# AKS / APIM / Blob Storage / Key Vault / Log Analytics / ACR
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.90"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.47"
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

  backend "azurerm" {
    resource_group_name  = "nexustext-tfstate-rg"
    storage_account_name = "nexustexttfstate"
    container_name       = "tfstate"
    key                  = "azure/terraform.tfstate"
  }
}

# ---------------------------------------------------------------------------
# Provider 設定
# ---------------------------------------------------------------------------
provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
  }
}

provider "kubernetes" {
  host                   = azurerm_kubernetes_cluster.nexustext.kube_config[0].host
  client_certificate     = base64decode(azurerm_kubernetes_cluster.nexustext.kube_config[0].client_certificate)
  client_key             = base64decode(azurerm_kubernetes_cluster.nexustext.kube_config[0].client_key)
  cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.nexustext.kube_config[0].cluster_ca_certificate)
}

provider "helm" {
  kubernetes {
    host                   = azurerm_kubernetes_cluster.nexustext.kube_config[0].host
    client_certificate     = base64decode(azurerm_kubernetes_cluster.nexustext.kube_config[0].client_certificate)
    client_key             = base64decode(azurerm_kubernetes_cluster.nexustext.kube_config[0].client_key)
    cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.nexustext.kube_config[0].cluster_ca_certificate)
  }
}

# ---------------------------------------------------------------------------
# Data Sources
# ---------------------------------------------------------------------------
data "azurerm_client_config" "current" {}

data "azuread_client_config" "current" {}

# ---------------------------------------------------------------------------
# リソースグループ
# ---------------------------------------------------------------------------
resource "azurerm_resource_group" "nexustext" {
  name     = var.resource_group_name
  location = var.location

  tags = local.common_tags
}

locals {
  common_tags = {
    Project     = "NexusText"
    Version     = "v7.0"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Team        = "platform"
  }
}

# ---------------------------------------------------------------------------
# 仮想ネットワーク
# ---------------------------------------------------------------------------
resource "azurerm_virtual_network" "nexustext" {
  name                = "${var.cluster_name}-vnet"
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name
  address_space       = [var.vnet_address_space]

  tags = local.common_tags
}

resource "azurerm_subnet" "aks_nodes" {
  name                 = "aks-nodes"
  resource_group_name  = azurerm_resource_group.nexustext.name
  virtual_network_name = azurerm_virtual_network.nexustext.name
  address_prefixes     = [var.aks_subnet_cidr]
}

resource "azurerm_subnet" "aks_pods" {
  name                 = "aks-pods"
  resource_group_name  = azurerm_resource_group.nexustext.name
  virtual_network_name = azurerm_virtual_network.nexustext.name
  address_prefixes     = [var.aks_pods_subnet_cidr]

  delegation {
    name = "aks-delegation"
    service_delegation {
      name = "Microsoft.ContainerService/managedClusters"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action"
      ]
    }
  }
}

resource "azurerm_subnet" "apim" {
  name                 = "apim"
  resource_group_name  = azurerm_resource_group.nexustext.name
  virtual_network_name = azurerm_virtual_network.nexustext.name
  address_prefixes     = [var.apim_subnet_cidr]
}

resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints"
  resource_group_name  = azurerm_resource_group.nexustext.name
  virtual_network_name = azurerm_virtual_network.nexustext.name
  address_prefixes     = [var.private_endpoints_subnet_cidr]
}

# NSG for AKS Subnet
resource "azurerm_network_security_group" "aks" {
  name                = "${var.cluster_name}-aks-nsg"
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name

  tags = local.common_tags
}

resource "azurerm_subnet_network_security_group_association" "aks" {
  subnet_id                 = azurerm_subnet.aks_nodes.id
  network_security_group_id = azurerm_network_security_group.aks.id
}

# ---------------------------------------------------------------------------
# Log Analytics ワークスペース
# ---------------------------------------------------------------------------
resource "azurerm_log_analytics_workspace" "nexustext" {
  name                = "${var.cluster_name}-law"
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days

  tags = local.common_tags
}

resource "azurerm_log_analytics_solution" "containers" {
  solution_name         = "ContainerInsights"
  location              = azurerm_resource_group.nexustext.location
  resource_group_name   = azurerm_resource_group.nexustext.name
  workspace_resource_id = azurerm_log_analytics_workspace.nexustext.id
  workspace_name        = azurerm_log_analytics_workspace.nexustext.name

  plan {
    publisher = "Microsoft"
    product   = "OMSGallery/ContainerInsights"
  }
}

# ---------------------------------------------------------------------------
# AKS クラスター
# ---------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "aks" {
  name                = "${var.cluster_name}-identity"
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name

  tags = local.common_tags
}

resource "azurerm_role_assignment" "aks_network_contributor" {
  scope                = azurerm_virtual_network.nexustext.id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_user_assigned_identity.aks.principal_id
}

resource "azurerm_kubernetes_cluster" "nexustext" {
  name                = var.cluster_name
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name
  dns_prefix          = var.cluster_name
  kubernetes_version  = var.kubernetes_version
  sku_tier            = var.environment == "production" ? "Standard" : "Free"

  # ネットワーク設定
  network_profile {
    network_plugin    = "azure"
    network_policy    = "calico"
    load_balancer_sku = "standard"
    service_cidr      = "172.16.0.0/16"
    dns_service_ip    = "172.16.0.10"

    load_balancer_profile {
      managed_outbound_ip_count = var.environment == "production" ? 2 : 1
    }
  }

  # マネージド ID
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.aks.id]
  }

  # デフォルトノードプール（システム）
  default_node_pool {
    name                 = "system"
    vm_size              = var.system_vm_size
    min_count            = 1
    max_count            = 3
    enable_auto_scaling  = true
    os_disk_size_gb      = 100
    os_disk_type         = "Managed"
    vnet_subnet_id       = azurerm_subnet.aks_nodes.id
    max_pods             = 50
    type                 = "VirtualMachineScaleSets"
    zones                = var.environment == "production" ? ["1", "2", "3"] : ["1"]

    node_labels = {
      role = "system"
    }

    upgrade_settings {
      max_surge = "33%"
    }
  }

  # 自動アップグレード
  automatic_channel_upgrade = "stable"

  # Azure AD RBAC
  azure_active_directory_role_based_access_control {
    managed                = true
    azure_rbac_enabled     = true
    admin_group_object_ids = var.aks_admin_group_ids
  }

  # モニタリング
  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.nexustext.id
  }

  microsoft_defender {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.nexustext.id
  }

  # メンテナンスウィンドウ
  maintenance_window {
    allowed {
      day   = "Sunday"
      hours = [2, 3, 4]
    }
  }

  key_vault_secrets_provider {
    secret_rotation_enabled = true
  }

  tags = local.common_tags

  depends_on = [
    azurerm_role_assignment.aks_network_contributor
  ]

  lifecycle {
    ignore_changes = [
      default_node_pool[0].node_count,
    ]
  }
}

# アプリケーションノードプール
resource "azurerm_kubernetes_cluster_node_pool" "app" {
  name                  = "app"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.nexustext.id
  vm_size               = var.app_vm_size
  min_count             = var.app_node_min_count
  max_count             = var.app_node_max_count
  enable_auto_scaling   = true
  os_disk_size_gb       = 128
  os_disk_type          = "Managed"
  vnet_subnet_id        = azurerm_subnet.aks_nodes.id
  max_pods              = 50
  zones                 = var.environment == "production" ? ["1", "2", "3"] : ["1"]
  priority              = var.use_spot_instances ? "Spot" : "Regular"
  eviction_policy       = var.use_spot_instances ? "Delete" : null
  spot_max_price        = var.use_spot_instances ? -1 : null

  node_labels = {
    role        = "app"
    environment = var.environment
  }

  node_taints = var.use_spot_instances ? ["kubernetes.azure.com/scalesetpriority=spot:NoSchedule"] : []

  upgrade_settings {
    max_surge = "25%"
  }

  tags = local.common_tags

  lifecycle {
    ignore_changes = [
      node_count,
    ]
  }
}

# ---------------------------------------------------------------------------
# ACR (Azure Container Registry)
# ---------------------------------------------------------------------------
resource "azurerm_container_registry" "nexustext" {
  name                = replace("${var.cluster_name}acr", "-", "")
  resource_group_name = azurerm_resource_group.nexustext.name
  location            = azurerm_resource_group.nexustext.location
  sku                 = var.environment == "production" ? "Premium" : "Standard"
  admin_enabled       = false

  dynamic "georeplications" {
    for_each = var.environment == "production" ? var.acr_georeplication_locations : []
    content {
      location                = georeplications.value
      zone_redundancy_enabled = true
    }
  }

  dynamic "retention_policy" {
    for_each = var.environment == "production" ? [1] : []
    content {
      days    = 30
      enabled = true
    }
  }

  tags = local.common_tags
}

# AKS に ACR pull 権限を付与
resource "azurerm_role_assignment" "aks_acr_pull" {
  scope                = azurerm_container_registry.nexustext.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.nexustext.kubelet_identity[0].object_id
}

# ---------------------------------------------------------------------------
# Azure API Management (APIM)
# ---------------------------------------------------------------------------
resource "azurerm_api_management" "nexustext" {
  name                = "${var.cluster_name}-apim"
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name
  publisher_name      = var.apim_publisher_name
  publisher_email     = var.apim_publisher_email
  sku_name            = var.apim_sku

  identity {
    type = "SystemAssigned"
  }

  virtual_network_type = "Internal"

  virtual_network_configuration {
    subnet_id = azurerm_subnet.apim.id
  }

  tags = local.common_tags
}

# APIM API 定義
resource "azurerm_api_management_api" "nexustext" {
  name                  = "nexustext-api"
  resource_group_name   = azurerm_resource_group.nexustext.name
  api_management_name   = azurerm_api_management.nexustext.name
  revision              = "1"
  display_name          = "NexusText AI API"
  path                  = "api"
  protocols             = ["https"]
  service_url           = "http://${azurerm_kubernetes_cluster.nexustext.fqdn}"
  subscription_required = true

  subscription_key_parameter_names {
    header = "X-API-Key"
    query  = "api-key"
  }
}

# APIM API オペレーション（ワイルドカード）
resource "azurerm_api_management_api_operation" "all_operations" {
  operation_id        = "all-operations"
  api_name            = azurerm_api_management_api.nexustext.name
  api_management_name = azurerm_api_management.nexustext.name
  resource_group_name = azurerm_resource_group.nexustext.name
  display_name        = "All Operations"
  method              = "POST"
  url_template        = "/*"
}

# APIM ポリシー（レート制限 + トークントラッキング）
resource "azurerm_api_management_api_policy" "nexustext" {
  api_name            = azurerm_api_management_api.nexustext.name
  api_management_name = azurerm_api_management.nexustext.name
  resource_group_name = azurerm_resource_group.nexustext.name

  xml_content = <<-XML
    <policies>
      <inbound>
        <base />
        <!-- レート制限: サブスクリプションキー毎に制限 -->
        <rate-limit-by-key
          calls="${var.apim_rate_limit_calls}"
          renewal-period="${var.apim_rate_limit_period}"
          counter-key="@(context.Subscription?.Key ?? context.Request.IpAddress)"
          increment-condition="@(context.Response.StatusCode >= 200 && context.Response.StatusCode < 400)" />

        <!-- クォータ制限: 月間リクエスト数制限 -->
        <quota-by-key
          calls="${var.apim_quota_limit}"
          renewal-period="2592000"
          counter-key="@(context.Subscription?.Key ?? context.Request.IpAddress)" />

        <!-- CORS ポリシー -->
        <cors allow-credentials="true">
          <allowed-origins>
            <origin>*</origin>
          </allowed-origins>
          <allowed-methods preflight-result-max-age="300">
            <method>GET</method>
            <method>POST</method>
            <method>PUT</method>
            <method>DELETE</method>
            <method>PATCH</method>
            <method>OPTIONS</method>
          </allowed-methods>
          <allowed-headers>
            <header>*</header>
          </allowed-headers>
        </cors>

        <!-- リクエストID付与 -->
        <set-header name="X-Request-Id" exists-action="skip">
          <value>@(Guid.NewGuid().ToString())</value>
        </set-header>

        <!-- トークン使用量トラッキング用ヘッダー -->
        <set-header name="X-Token-Tracking" exists-action="override">
          <value>@{
            var subscriptionKey = context.Subscription?.Key ?? "anonymous";
            var timestamp = DateTime.UtcNow.ToString("o");
            return $"sub={subscriptionKey};ts={timestamp}";
          }</value>
        </set-header>
      </inbound>

      <backend>
        <base />
        <!-- バックエンドタイムアウト設定 -->
        <forward-request timeout="120" follow-redirects="false" />
      </backend>

      <outbound>
        <base />
        <!-- レスポンスヘッダー追加 -->
        <set-header name="X-Powered-By" exists-action="delete" />
        <set-header name="X-NexusText-Version" exists-action="override">
          <value>7.0.0</value>
        </set-header>

        <!-- トークン使用量をログに記録 -->
        <log-to-eventhub logger-id="token-usage-logger" partition-id="0">@{
          var responseBody = context.Response.Body?.As<string>(preserveContent: true);
          var tokenCount = 0;
          if (responseBody != null) {
            try {
              var json = Newtonsoft.Json.Linq.JObject.Parse(responseBody);
              tokenCount = json["usage"]?["total_tokens"]?.Value<int>() ?? 0;
            } catch { }
          }
          return new JObject(
            new JProperty("subscription", context.Subscription?.Key ?? "anonymous"),
            new JProperty("operation", context.Operation?.Id),
            new JProperty("tokens", tokenCount),
            new JProperty("status", context.Response.StatusCode),
            new JProperty("latency", context.Elapsed.TotalMilliseconds),
            new JProperty("timestamp", DateTime.UtcNow.ToString("o"))
          ).ToString();
        }</log-to-eventhub>
      </outbound>

      <on-error>
        <base />
        <set-header name="X-Error-Source" exists-action="override">
          <value>apim</value>
        </set-header>
        <return-response>
          <set-status code="500" reason="Internal Server Error" />
          <set-body>@{
            return new JObject(
              new JProperty("error", true),
              new JProperty("message", "An internal error occurred. Please try again later."),
              new JProperty("requestId", context.RequestId.ToString())
            ).ToString();
          }</set-body>
        </return-response>
      </on-error>
    </policies>
  XML
}

# APIM プロダクト
resource "azurerm_api_management_product" "nexustext" {
  product_id            = "nexustext-standard"
  api_management_name   = azurerm_api_management.nexustext.name
  resource_group_name   = azurerm_resource_group.nexustext.name
  display_name          = "NexusText Standard"
  description           = "Standard tier access to NexusText AI v7.0 API"
  subscription_required = true
  subscriptions_limit   = 10
  approval_required     = true
  published             = true
}

resource "azurerm_api_management_product_api" "nexustext" {
  api_name            = azurerm_api_management_api.nexustext.name
  product_id          = azurerm_api_management_product.nexustext.product_id
  api_management_name = azurerm_api_management.nexustext.name
  resource_group_name = azurerm_resource_group.nexustext.name
}

# APIM 診断設定
resource "azurerm_api_management_diagnostic" "nexustext" {
  identifier               = "azuremonitor"
  resource_group_name      = azurerm_resource_group.nexustext.name
  api_management_name      = azurerm_api_management.nexustext.name
  api_management_logger_id = azurerm_api_management_logger.nexustext.id

  sampling_percentage       = 100
  always_log_errors         = true
  log_client_ip             = true
  verbosity                 = "information"
  http_correlation_protocol = "W3C"

  frontend_request {
    body_bytes = 1024
    headers_to_log = [
      "X-Request-Id",
      "X-API-Key",
      "Content-Type",
    ]
  }

  frontend_response {
    body_bytes = 1024
    headers_to_log = [
      "X-Request-Id",
      "X-NexusText-Version",
    ]
  }

  backend_request {
    body_bytes = 1024
  }

  backend_response {
    body_bytes = 1024
  }
}

resource "azurerm_api_management_logger" "nexustext" {
  name                = "${var.cluster_name}-logger"
  api_management_name = azurerm_api_management.nexustext.name
  resource_group_name = azurerm_resource_group.nexustext.name
  resource_id         = azurerm_log_analytics_workspace.nexustext.id

  application_insights {
    instrumentation_key = azurerm_application_insights.nexustext.instrumentation_key
  }
}

# ---------------------------------------------------------------------------
# Application Insights
# ---------------------------------------------------------------------------
resource "azurerm_application_insights" "nexustext" {
  name                = "${var.cluster_name}-appinsights"
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name
  workspace_id        = azurerm_log_analytics_workspace.nexustext.id
  application_type    = "web"
  retention_in_days   = var.log_retention_days

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Blob Storage
# ---------------------------------------------------------------------------
resource "azurerm_storage_account" "nexustext" {
  name                     = replace("${var.cluster_name}sa", "-", "")
  resource_group_name      = azurerm_resource_group.nexustext.name
  location                 = azurerm_resource_group.nexustext.location
  account_tier             = "Standard"
  account_replication_type = var.environment == "production" ? "GRS" : "LRS"
  account_kind             = "StorageV2"
  min_tls_version          = "TLS1_2"
  access_tier              = "Hot"

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }
  }

  network_rules {
    default_action             = "Deny"
    bypass                     = ["AzureServices", "Logging", "Metrics"]
    virtual_network_subnet_ids = [azurerm_subnet.aks_nodes.id]
  }

  tags = local.common_tags
}

resource "azurerm_storage_container" "models" {
  name                  = "models"
  storage_account_name  = azurerm_storage_account.nexustext.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "documents" {
  name                  = "documents"
  storage_account_name  = azurerm_storage_account.nexustext.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "backups" {
  name                  = "backups"
  storage_account_name  = azurerm_storage_account.nexustext.name
  container_access_type = "private"
}

# ストレージライフサイクル管理
resource "azurerm_storage_management_policy" "nexustext" {
  storage_account_id = azurerm_storage_account.nexustext.id

  rule {
    name    = "transition-to-cool"
    enabled = true

    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["documents/"]
    }

    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than    = 90
        tier_to_archive_after_days_since_modification_greater_than = 365
      }
      snapshot {
        delete_after_days_since_creation_greater_than = 90
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Key Vault
# ---------------------------------------------------------------------------
resource "azurerm_key_vault" "nexustext" {
  name                = "${var.cluster_name}-kv"
  location            = azurerm_resource_group.nexustext.location
  resource_group_name = azurerm_resource_group.nexustext.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  soft_delete_retention_days = 90
  purge_protection_enabled   = true
  enable_rbac_authorization  = true

  network_acls {
    bypass                     = "AzureServices"
    default_action             = "Deny"
    virtual_network_subnet_ids = [azurerm_subnet.aks_nodes.id]
  }

  tags = local.common_tags
}

# Key Vault Secrets
resource "azurerm_key_vault_secret" "db_password" {
  name         = "db-password"
  value        = var.db_password
  key_vault_id = azurerm_key_vault.nexustext.id

  depends_on = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "redis_password" {
  name         = "redis-password"
  value        = var.redis_password
  key_vault_id = azurerm_key_vault.nexustext.id

  depends_on = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "api_secret_key" {
  name         = "api-secret-key"
  value        = var.api_secret_key
  key_vault_id = azurerm_key_vault.nexustext.id

  depends_on = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "jwt-secret"
  value        = var.jwt_secret
  key_vault_id = azurerm_key_vault.nexustext.id

  depends_on = [azurerm_role_assignment.kv_admin]
}

# Terraform 実行者に Key Vault Admin 権限を付与
resource "azurerm_role_assignment" "kv_admin" {
  scope                = azurerm_key_vault.nexustext.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}

# AKS マネージド ID に Key Vault Secrets User 権限を付与
resource "azurerm_role_assignment" "aks_kv_secrets" {
  scope                = azurerm_key_vault.nexustext.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_kubernetes_cluster.nexustext.key_vault_secrets_provider[0].secret_identity[0].object_id
}

# ---------------------------------------------------------------------------
# 診断設定（全リソース → Log Analytics）
# ---------------------------------------------------------------------------
resource "azurerm_monitor_diagnostic_setting" "aks" {
  name                       = "${var.cluster_name}-aks-diag"
  target_resource_id         = azurerm_kubernetes_cluster.nexustext.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.nexustext.id

  enabled_log {
    category = "kube-apiserver"
  }

  enabled_log {
    category = "kube-audit-admin"
  }

  enabled_log {
    category = "kube-controller-manager"
  }

  enabled_log {
    category = "kube-scheduler"
  }

  enabled_log {
    category = "guard"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "apim" {
  name                       = "${var.cluster_name}-apim-diag"
  target_resource_id         = azurerm_api_management.nexustext.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.nexustext.id

  enabled_log {
    category = "GatewayLogs"
  }

  enabled_log {
    category = "WebSocketConnectionLogs"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

resource "azurerm_monitor_diagnostic_setting" "key_vault" {
  name                       = "${var.cluster_name}-kv-diag"
  target_resource_id         = azurerm_key_vault.nexustext.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.nexustext.id

  enabled_log {
    category = "AuditEvent"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

# ---------------------------------------------------------------------------
# Azure Monitor アラート
# ---------------------------------------------------------------------------
resource "azurerm_monitor_action_group" "nexustext" {
  name                = "${var.cluster_name}-action-group"
  resource_group_name = azurerm_resource_group.nexustext.name
  short_name          = "nexustxt"

  dynamic "email_receiver" {
    for_each = var.alert_email_addresses
    content {
      name                    = "email-${email_receiver.key}"
      email_address           = email_receiver.value
      use_common_alert_schema = true
    }
  }

  tags = local.common_tags
}

resource "azurerm_monitor_metric_alert" "apim_failed_requests" {
  name                = "${var.cluster_name}-apim-failed-requests"
  resource_group_name = azurerm_resource_group.nexustext.name
  scopes              = [azurerm_api_management.nexustext.id]
  description         = "APIM failed request rate exceeds threshold"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.ApiManagement/service"
    metric_name      = "FailedRequests"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = var.alert_failed_requests_threshold
  }

  action {
    action_group_id = azurerm_monitor_action_group.nexustext.id
  }

  tags = local.common_tags
}

resource "azurerm_monitor_metric_alert" "aks_cpu" {
  name                = "${var.cluster_name}-aks-high-cpu"
  resource_group_name = azurerm_resource_group.nexustext.name
  scopes              = [azurerm_kubernetes_cluster.nexustext.id]
  description         = "AKS cluster CPU utilization exceeds threshold"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Insights.Container/nodes"
    metric_name      = "cpuUsagePercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  action {
    action_group_id = azurerm_monitor_action_group.nexustext.id
  }

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Kubernetes アプリケーションモジュール
# ---------------------------------------------------------------------------
module "k8s_app" {
  source = "../modules/k8s-app"

  namespace          = "nexustext"
  environment        = var.environment
  container_registry = azurerm_container_registry.nexustext.login_server
  image_tag          = var.image_tag
  image_pull_policy  = "Always"

  api_gateway_url = "https://${azurerm_api_management.nexustext.gateway_url}"
  frontend_url    = var.frontend_url

  backend_replicas  = var.backend_replicas
  frontend_replicas = var.frontend_replicas

  postgres_user     = var.db_username
  postgres_password = var.db_password
  redis_password    = var.redis_password
  api_secret_key    = var.api_secret_key
  jwt_secret        = var.jwt_secret

  storage_class_name = "managed-premium"

  extra_env_vars = [
    {
      name  = "AZURE_STORAGE_ACCOUNT"
      value = azurerm_storage_account.nexustext.name
    },
    {
      name  = "AZURE_STORAGE_CONTAINER"
      value = azurerm_storage_container.documents.name
    },
    {
      name  = "AZURE_KEY_VAULT_URL"
      value = azurerm_key_vault.nexustext.vault_uri
    },
    {
      name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
      value = azurerm_application_insights.nexustext.connection_string
    },
    {
      name  = "CLOUD_PROVIDER"
      value = "azure"
    }
  ]

  depends_on = [azurerm_kubernetes_cluster.nexustext]
}
