###############################################################################
# NexusText AI v7.0 - Azure アウトプット定義
###############################################################################

# ---------------------------------------------------------------------------
# AKS クラスター
# ---------------------------------------------------------------------------
output "aks_cluster_endpoint" {
  description = "AKS cluster API server FQDN"
  value       = azurerm_kubernetes_cluster.nexustext.fqdn
}

output "aks_cluster_name" {
  description = "AKS cluster name"
  value       = azurerm_kubernetes_cluster.nexustext.name
}

output "aks_cluster_id" {
  description = "AKS cluster resource ID"
  value       = azurerm_kubernetes_cluster.nexustext.id
}

output "aks_node_resource_group" {
  description = "AKS managed resource group name (node infrastructure)"
  value       = azurerm_kubernetes_cluster.nexustext.node_resource_group
}

output "aks_kubelet_identity_object_id" {
  description = "AKS kubelet managed identity object ID"
  value       = azurerm_kubernetes_cluster.nexustext.kubelet_identity[0].object_id
}

output "aks_kubeconfig_command" {
  description = "Azure CLI command to get kubeconfig"
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.nexustext.name} --name ${azurerm_kubernetes_cluster.nexustext.name}"
}

# ---------------------------------------------------------------------------
# APIM
# ---------------------------------------------------------------------------
output "apim_gateway_url" {
  description = "APIM gateway URL"
  value       = azurerm_api_management.nexustext.gateway_url
}

output "apim_management_url" {
  description = "APIM management API URL"
  value       = azurerm_api_management.nexustext.management_api_url
}

output "apim_developer_portal_url" {
  description = "APIM developer portal URL"
  value       = azurerm_api_management.nexustext.developer_portal_url
}

output "apim_name" {
  description = "APIM instance name"
  value       = azurerm_api_management.nexustext.name
}

output "apim_identity_principal_id" {
  description = "APIM system-assigned managed identity principal ID"
  value       = azurerm_api_management.nexustext.identity[0].principal_id
}

# ---------------------------------------------------------------------------
# ACR
# ---------------------------------------------------------------------------
output "acr_login_server" {
  description = "ACR login server URL"
  value       = azurerm_container_registry.nexustext.login_server
}

output "acr_name" {
  description = "ACR name"
  value       = azurerm_container_registry.nexustext.name
}

output "acr_id" {
  description = "ACR resource ID"
  value       = azurerm_container_registry.nexustext.id
}

# ---------------------------------------------------------------------------
# Blob Storage
# ---------------------------------------------------------------------------
output "storage_account_name" {
  description = "Storage account name"
  value       = azurerm_storage_account.nexustext.name
}

output "storage_account_primary_blob_endpoint" {
  description = "Storage account primary blob service endpoint"
  value       = azurerm_storage_account.nexustext.primary_blob_endpoint
}

output "storage_container_models" {
  description = "Blob container name for ML models"
  value       = azurerm_storage_container.models.name
}

output "storage_container_documents" {
  description = "Blob container name for documents"
  value       = azurerm_storage_container.documents.name
}

# ---------------------------------------------------------------------------
# Key Vault
# ---------------------------------------------------------------------------
output "key_vault_uri" {
  description = "Key Vault URI"
  value       = azurerm_key_vault.nexustext.vault_uri
}

output "key_vault_name" {
  description = "Key Vault name"
  value       = azurerm_key_vault.nexustext.name
}

output "key_vault_id" {
  description = "Key Vault resource ID"
  value       = azurerm_key_vault.nexustext.id
}

# ---------------------------------------------------------------------------
# モニタリング
# ---------------------------------------------------------------------------
output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  value       = azurerm_log_analytics_workspace.nexustext.id
}

output "log_analytics_workspace_name" {
  description = "Log Analytics workspace name"
  value       = azurerm_log_analytics_workspace.nexustext.name
}

output "application_insights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = azurerm_application_insights.nexustext.instrumentation_key
  sensitive   = true
}

output "application_insights_connection_string" {
  description = "Application Insights connection string"
  value       = azurerm_application_insights.nexustext.connection_string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# ネットワーク
# ---------------------------------------------------------------------------
output "vnet_id" {
  description = "Virtual network ID"
  value       = azurerm_virtual_network.nexustext.id
}

output "aks_subnet_id" {
  description = "AKS nodes subnet ID"
  value       = azurerm_subnet.aks_nodes.id
}

# ---------------------------------------------------------------------------
# リソースグループ
# ---------------------------------------------------------------------------
output "resource_group_name" {
  description = "Resource group name"
  value       = azurerm_resource_group.nexustext.name
}

output "resource_group_location" {
  description = "Resource group location"
  value       = azurerm_resource_group.nexustext.location
}
