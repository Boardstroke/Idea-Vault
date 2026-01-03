output "namespaces" {
  description = "Created namespaces"
  value = {
    ml_serving  = kubernetes_namespace.ml_serving.metadata[0].name
    ml_training = kubernetes_namespace.ml_training.metadata[0].name
  }
}

output "kserve_endpoint" {
  description = "KServe inference endpoint pattern"
  value       = "http://<model-name>.<namespace>.svc.cluster.local/v1/models/<model-name>:predict"
}

output "next_steps" {
  description = "Next steps after terraform apply"
  value       = <<-EOT
    
    ✅ Infrastructure deployed!
    
    Next steps:
    1. Verify KServe: kubectl get pods -n kserve
    2. Apply InferenceService: kubectl apply -f ../kserve/inference-service.yaml
    3. Start Temporal worker: python ../temporal/worker/main.py
    4. Trigger training: temporal workflow start --task-queue ml-pipeline --type TrainWorkflow
    
  EOT
}


