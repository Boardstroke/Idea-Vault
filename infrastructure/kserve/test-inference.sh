#!/bin/bash
# Test script for KServe InferenceService

set -e

# Get the InferenceService URL
SERVICE_NAME="anomaly-detector"
NAMESPACE="ml-serving"

echo "🔍 Getting InferenceService status..."
kubectl get inferenceservice $SERVICE_NAME -n $NAMESPACE

# Get the URL
INGRESS_HOST=$(kubectl -n istio-system get service istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
if [ -z "$INGRESS_HOST" ]; then
    # For minikube without LoadBalancer
    INGRESS_HOST=$(minikube ip)
    INGRESS_PORT=$(kubectl -n istio-system get service istio-ingressgateway -o jsonpath='{.spec.ports[?(@.name=="http2")].nodePort}')
else
    INGRESS_PORT=80
fi

SERVICE_HOSTNAME=$(kubectl get inferenceservice $SERVICE_NAME -n $NAMESPACE -o jsonpath='{.status.url}' | cut -d "/" -f 3)

echo ""
echo "📡 Testing inference..."
echo "   Host: $INGRESS_HOST:$INGRESS_PORT"
echo "   Service: $SERVICE_HOSTNAME"

# Test data: [amount, day_of_week, month, is_weekend]
# Normal transaction
echo ""
echo "Test 1: Normal transaction (amount=150, weekday)"
curl -v \
  -H "Host: $SERVICE_HOSTNAME" \
  -H "Content-Type: application/json" \
  http://${INGRESS_HOST}:${INGRESS_PORT}/v1/models/$SERVICE_NAME:predict \
  -d '{
    "instances": [
      [150.0, 2, 3, 0]
    ]
  }'

echo ""
echo ""

# Anomalous transaction (high amount)
echo "Test 2: Anomalous transaction (amount=100000, weekend)"
curl -v \
  -H "Host: $SERVICE_HOSTNAME" \
  -H "Content-Type: application/json" \
  http://${INGRESS_HOST}:${INGRESS_PORT}/v1/models/$SERVICE_NAME:predict \
  -d '{
    "instances": [
      [100000.0, 6, 3, 1]
    ]
  }'

echo ""
echo ""

# Multiple transactions
echo "Test 3: Batch prediction"
curl -v \
  -H "Host: $SERVICE_HOSTNAME" \
  -H "Content-Type: application/json" \
  http://${INGRESS_HOST}:${INGRESS_PORT}/v1/models/$SERVICE_NAME:predict \
  -d '{
    "instances": [
      [50.0, 1, 1, 0],
      [500.0, 3, 2, 0],
      [5000.0, 5, 3, 0],
      [50000.0, 0, 4, 1]
    ]
  }'

echo ""
echo "✅ Tests complete!"


