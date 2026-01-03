terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

# Configuração do provider Kubernetes (conecta ao Minikube)
provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kube_context
  }
}

# Namespace para ML workloads
resource "kubernetes_namespace" "ml_serving" {
  metadata {
    name = "ml-serving"
    labels = {
      "istio-injection" = "enabled"
    }
  }
}

resource "kubernetes_namespace" "ml_training" {
  metadata {
    name = "ml-training"
  }
}

# ConfigMap com configurações do projeto
resource "kubernetes_config_map" "ml_config" {
  metadata {
    name      = "ml-pipeline-config"
    namespace = kubernetes_namespace.ml_serving.metadata[0].name
  }

  data = {
    POSTGRES_HOST     = var.postgres_host
    POSTGRES_PORT     = var.postgres_port
    POSTGRES_DB       = var.postgres_db
    POSTGRES_USER     = var.postgres_user
    MINIO_ENDPOINT    = var.minio_endpoint
    MINIO_BUCKET      = var.minio_bucket
    MODEL_NAME        = "anomaly-detector"
    MODEL_VERSION     = "v1"
  }
}

# Secret com credenciais
resource "kubernetes_secret" "ml_secrets" {
  metadata {
    name      = "ml-pipeline-secrets"
    namespace = kubernetes_namespace.ml_serving.metadata[0].name
  }

  data = {
    POSTGRES_PASSWORD = base64encode(var.postgres_password)
    MINIO_ACCESS_KEY  = base64encode(var.minio_access_key)
    MINIO_SECRET_KEY  = base64encode(var.minio_secret_key)
  }

  type = "Opaque"
}

# Instalar Istio (pré-requisito do KServe)
resource "helm_release" "istio_base" {
  name             = "istio-base"
  repository       = "https://istio-release.storage.googleapis.com/charts"
  chart            = "base"
  namespace        = "istio-system"
  create_namespace = true
  version          = "1.20.0"

  wait = true
}

resource "helm_release" "istiod" {
  name       = "istiod"
  repository = "https://istio-release.storage.googleapis.com/charts"
  chart      = "istiod"
  namespace  = "istio-system"
  version    = "1.20.0"

  depends_on = [helm_release.istio_base]
  wait       = true
}

resource "helm_release" "istio_ingress" {
  name       = "istio-ingressgateway"
  repository = "https://istio-release.storage.googleapis.com/charts"
  chart      = "gateway"
  namespace  = "istio-system"
  version    = "1.20.0"
  timeout    = 600

  depends_on = [helm_release.istiod]
  wait       = true
}

# Instalar cert-manager (pré-requisito do KServe)
resource "helm_release" "cert_manager" {
  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  namespace        = "cert-manager"
  create_namespace = true
  version          = "v1.13.0"

  set {
    name  = "installCRDs"
    value = "true"
  }

  wait = true
}

# Instalar Knative Serving (pré-requisito do KServe)
resource "null_resource" "install_knative_serving" {
  depends_on = [
    helm_release.istiod,
    helm_release.istio_ingress
  ]

  provisioner "local-exec" {
    command = <<-EOT
      # Instalar Knative Serving CRDs
      kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.12.0/serving-crds.yaml
      
      # Aguardar CRDs
      sleep 10
      
      # Instalar Knative Serving Core
      kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.12.0/serving-core.yaml
      
      # Aguardar pods
      kubectl wait --for=condition=ready pod --all -n knative-serving --timeout=300s || true
    EOT
  }
}

# Instalar Knative Istio Controller (integração com Istio)
resource "null_resource" "install_knative_istio" {
  depends_on = [null_resource.install_knative_serving]

  provisioner "local-exec" {
    command = <<-EOT
      # Instalar Net-Istio para integração Knative + Istio
      kubectl apply -f https://github.com/knative/net-istio/releases/download/knative-v1.12.0/net-istio.yaml
      
      # Aguardar pods
      kubectl wait --for=condition=ready pod --all -n knative-serving --timeout=300s || true
      
      # Configurar domínio para testes locais
      kubectl patch configmap/config-domain \
        --namespace knative-serving \
        --type merge \
        --patch '{"data":{"example.com":""}}'
    EOT
  }
}

# Instalar KServe
resource "null_resource" "install_kserve" {
  depends_on = [
    null_resource.install_knative_istio,
    helm_release.cert_manager
  ]

  provisioner "local-exec" {
    command = <<-EOT
      # Instalar KServe
      kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.12.1/kserve.yaml
      
      # Aguardar o controller estar pronto
      sleep 30
      kubectl wait --for=condition=ready pod -l control-plane=kserve-controller-manager -n kserve --timeout=300s || true
      
      # Instalar runtimes padrão (sklearn, xgboost, etc)
      kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.12.1/kserve-cluster-resources.yaml || true
    EOT
  }
}

# Aguardar KServe estar pronto
resource "null_resource" "wait_kserve" {
  depends_on = [null_resource.install_kserve]

  provisioner "local-exec" {
    command = <<-EOT
      echo "Aguardando KServe ficar pronto..."
      kubectl wait --for=condition=ready pod -l control-plane=kserve-controller-manager -n kserve --timeout=300s
      echo "KServe instalado com sucesso!"
      kubectl get pods -n kserve
      kubectl get pods -n knative-serving
    EOT
  }
}

# Output
output "ml_serving_namespace" {
  value = kubernetes_namespace.ml_serving.metadata[0].name
}

output "kserve_status" {
  value = "KServe installed - run 'kubectl get pods -n kserve' to verify"
}

