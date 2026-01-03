#!/bin/bash
set -e

echo "🚀 Setting up Minikube for MLOps Pipeline"

# Check if minikube is installed
if ! command -v minikube &> /dev/null; then
    echo "❌ Minikube not found. Please install it first."
    echo "   https://minikube.sigs.k8s.io/docs/start/"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install it first."
    exit 1
fi

# Start minikube with enough resources for KServe
echo "📦 Starting Minikube..."
minikube start \
    --cpus=4 \
    --memory=8192 \
    --driver=docker \
    --kubernetes-version=v1.28.0 \
    --addons=ingress,metrics-server

# Enable required addons
echo "🔧 Enabling addons..."
minikube addons enable ingress
minikube addons enable metrics-server

# Configure Docker to use Minikube's registry
echo "🐳 Configuring Docker..."
eval $(minikube docker-env)

# Create MinIO bucket
echo "📁 Waiting for services to be ready..."
sleep 10

echo "✅ Minikube is ready!"
echo ""
echo "Next steps:"
echo "  1. cd infrastructure && terraform init && terraform apply"
echo "  2. kubectl get pods -A (verify all pods are running)"
echo ""
echo "Useful commands:"
echo "  - minikube dashboard      # Open Kubernetes dashboard"
echo "  - minikube tunnel         # Expose LoadBalancer services"
echo "  - minikube stop           # Stop cluster"
echo "  - minikube delete         # Delete cluster"


