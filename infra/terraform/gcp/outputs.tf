output "gke_cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.nexustext.endpoint
  sensitive   = true
}

output "gke_cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.nexustext.name
}

output "api_gateway_url" {
  description = "GCP API Gateway URL"
  value       = google_api_gateway_gateway.nexustext.default_hostname
}

output "gcs_bucket_name" {
  description = "GCS bucket name"
  value       = google_storage_bucket.nexustext.name
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.nexustext.name}"
}
