variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "Kubernetes context to use"
  type        = string
  default     = "minikube"
}

variable "postgres_host" {
  description = "PostgreSQL host"
  type        = string
  default     = "host.minikube.internal"
}

variable "postgres_port" {
  description = "PostgreSQL port"
  type        = string
  default     = "5433"
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "dbt_medallion"
}

variable "postgres_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "dbt_user"
}

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  default     = "dbt_password"
  sensitive   = true
}

variable "minio_endpoint" {
  description = "MinIO endpoint"
  type        = string
  default     = "host.minikube.internal:9000"
}

variable "minio_bucket" {
  description = "MinIO bucket for models"
  type        = string
  default     = "ml-models"
}

variable "minio_access_key" {
  description = "MinIO access key"
  type        = string
  default     = "minioadmin"
  sensitive   = true
}

variable "minio_secret_key" {
  description = "MinIO secret key"
  type        = string
  default     = "minioadmin"
  sensitive   = true
}


