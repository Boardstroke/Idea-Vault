# MLOps Pipeline Makefile
# Comandos comuns para desenvolvimento e operação

.PHONY: help setup dev-up dev-down dbt-run dbt-test train worker k8s-setup k8s-deploy clean

# Default target
help:
	@echo "MLOps Pipeline - Comandos disponíveis:"
	@echo ""
	@echo "Setup:"
	@echo "  make setup        - Configurar ambiente de desenvolvimento"
	@echo "  make dev-up       - Subir infraestrutura local (Docker)"
	@echo "  make dev-down     - Parar infraestrutura local"
	@echo ""
	@echo "MLflow:"
	@echo "  make mlflow-up    - Subir MLflow + MinIO"
	@echo "  make mlflow-ui    - Abrir MLflow UI (http://localhost:5000)"
	@echo ""
	@echo "dbt:"
	@echo "  make dbt-setup    - Instalar dependências dbt"
	@echo "  make dbt-run      - Executar pipeline dbt completo"
	@echo "  make dbt-test     - Executar testes dbt"
	@echo ""
	@echo "ML (Anomaly Detection):"
	@echo "  make train                - Treinar modelo localmente"
	@echo "  make worker               - Iniciar Temporal worker"
	@echo "  make workflow-train-wait  - Treinar via Temporal"
	@echo ""
	@echo "ML (Forecast Transformer):"
	@echo "  make forecast-train                - Treinar modelo V1 (attention pooling)"
	@echo "  make forecast-train-with-baselines - Treinar + logar baselines no MLflow"
	@echo "  make forecast-evaluate             - Avaliar modelo vs baselines"
	@echo "  make forecast-train-experiment     - Treinar com params customizados"
	@echo "  make forecast-train-wait           - Treinar via Temporal"
	@echo "  make forecast-inference            - Gerar previsões"
	@echo "  make forecast-full-deploy          - Build + Deploy no KServe"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make k8s-setup    - Configurar Minikube"
	@echo "  make k8s-deploy   - Deploy infraestrutura via Terraform"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        - Limpar arquivos temporários"

# ==================== Setup ====================

setup: dev-up dbt-setup mlflow-up
	@echo "✅ Setup completo!"

dev-up:
	@echo "🚀 Subindo infraestrutura..."
	docker compose up -d
	@echo "⏳ Aguardando PostgreSQL..."
	@sleep 5
	docker compose ps

dev-down:
	@echo "🛑 Parando infraestrutura..."
	docker-compose down

# ==================== MLflow ====================

mlflow-up:
	@echo "📊 Subindo MLflow + MinIO..."
	docker compose up -d minio minio-init mlflow
	@echo "⏳ Aguardando serviços..."
	@sleep 10
	@echo "✅ MLflow disponível em http://localhost:5000"
	@echo "✅ MinIO Console em http://localhost:9001"

mlflow-down:
	@echo "🛑 Parando MLflow..."
	docker compose stop mlflow minio-init minio

mlflow-ui:
	@echo "📊 Abrindo MLflow UI..."
	@echo "MLflow: http://localhost:5000"
	@which xdg-open > /dev/null && xdg-open http://localhost:5000 || open http://localhost:5000 2>/dev/null || echo "Acesse http://localhost:5000"

mlflow-logs:
	@docker compose logs -f mlflow

# ==================== dbt ====================

dbt-setup:
	@echo "📦 Instalando dependências dbt..."
	cd dbt && pip install -r requirements.txt
	cd dbt && dbt deps

dbt-run:
	@echo "🔄 Executando pipeline dbt..."
	cd dbt && dbt seed --full-refresh
	cd dbt && dbt snapshot
	cd dbt && dbt run
	@echo "✅ Pipeline dbt completo!"

dbt-test:
	@echo "🧪 Executando testes dbt..."
	cd dbt && dbt test

dbt-docs:
	@echo "📚 Gerando documentação dbt..."
	cd dbt && dbt docs generate
	cd dbt && dbt docs serve

# ==================== ML ====================

train:
	@echo "🤖 Treinando modelo..."
	cd ml/training && pip install -r requirements.txt
	cd ml/training && python train.py

worker:
	@echo "⚙️ Iniciando Temporal worker..."
	cd temporal && pip install -r requirements.txt
	PYTHONPATH=$(PWD) python -m temporal.worker.main

# ==================== Kubernetes ====================

k8s-setup:
	@echo "☸️ Configurando Minikube..."
	chmod +x infrastructure/scripts/setup-minikube.sh
	./infrastructure/scripts/setup-minikube.sh

k8s-deploy:
	@echo "🏗️ Aplicando Terraform..."
	cd infrastructure && terraform init
	cd infrastructure && terraform apply -auto-approve

k8s-destroy:
	@echo "💥 Destruindo recursos Kubernetes..."
	cd infrastructure && terraform destroy -auto-approve

# ==================== Docker ====================

docker-build:
	@echo "🐳 Building Docker images..."
	docker build -f docker/ml-training/Dockerfile -t ml-training:latest .
	docker build -f docker/temporal-worker/Dockerfile -t temporal-worker:latest .
	docker build -f docker/kserve-model/Dockerfile -t kserve-model:latest .

# ==================== Workflows ====================

workflow-train:
	@echo "🚀 Iniciando TrainWorkflow..."
	PYTHONPATH=$(PWD) python temporal/start_workflow.py train --input '{"contamination": 0.1, "n_estimators": 100}'

workflow-inference:
	@echo "🔮 Iniciando InferenceWorkflow..."
	PYTHONPATH=$(PWD) python temporal/start_workflow.py inference --input '{"batch_size": 100, "trigger_dbt": true, "lookback_hours": 0}'

workflow-train-wait:
	@echo "🚀 Iniciando TrainWorkflow (aguardando conclusão)..."
	PYTHONPATH=$(PWD) python temporal/start_workflow.py train --wait --input '{"contamination": 0.1, "n_estimators": 100}'

workflow-inference-wait:
	@echo "🔮 Iniciando InferenceWorkflow (aguardando conclusão)..."
	PYTHONPATH=$(PWD) python temporal/start_workflow.py inference --wait --input '{"batch_size": 100, "trigger_dbt": true, "lookback_hours": 0}'

# ==================== Forecast ML Workflows ====================
# Usa nova estrutura: ml/spending_forecast/

# Treinar modelo V1 com attention pooling (padrão)
forecast-train:
	@echo "🧠 Treinando Forecast Transformer V1 (attention pooling)..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.train \
		--model-arch v1 \
		--pooling-type attention \
		--loss-type gaussian_nll \
		--epochs 100

# Treinar modelo V2 com forecast tokens
forecast-train-v2:
	@echo "🧠 Treinando Forecast Transformer V2 (forecast tokens)..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.train \
		--model-arch v2 \
		--loss-type gaussian_nll \
		--epochs 100

# Treinar modelo + logar baselines no MLflow para comparação
forecast-train-with-baselines:
	@echo "🧠 Treinando Transformer + Baselines no MLflow..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.train \
		--model-arch v1 \
		--pooling-type attention \
		--loss-type gaussian_nll \
		--epochs 100 \
		--with-baselines

# Treinar modelo V2 + baselines
forecast-train-v2-with-baselines:
	@echo "🧠 Treinando V2 + Baselines no MLflow..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.train \
		--model-arch v2 \
		--loss-type gaussian_nll \
		--epochs 100 \
		--with-baselines

# Treinar modelo V1 com flatten pooling (baseline de arquitetura)
forecast-train-flatten:
	@echo "🧠 Treinando Forecast Transformer V1 (flatten pooling)..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.train \
		--model-arch v1 \
		--pooling-type flatten \
		--loss-type mse \
		--epochs 100

# Treinar modelo V1 com CLS token
forecast-train-cls:
	@echo "🧠 Treinando Forecast Transformer V1 (CLS token)..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.train \
		--model-arch v1 \
		--pooling-type cls \
		--loss-type gaussian_nll \
		--epochs 100

# Treinar com parâmetros customizados (usar variáveis de ambiente)
# Exemplo: EPOCHS=50 MODEL_ARCH=v2 make forecast-train-experiment
forecast-train-experiment:
	@echo "🧪 Treinando com configuração experimental..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.train \
		--model-arch $${MODEL_ARCH:-v1} \
		--pooling-type $${POOLING:-attention} \
		--loss-type $${LOSS:-gaussian_nll} \
		--epochs $${EPOCHS:-100} \
		--d-model $${D_MODEL:-64} \
		--num-layers $${NUM_LAYERS:-2} \
		--experiment-name $${EXPERIMENT:-spending-forecast} \
		$${WITH_BASELINES:+--with-baselines}

# Avaliar modelo contra baselines
forecast-evaluate:
	@echo "📊 Avaliando modelo vs baselines..."
	cd ml/training && PYTHONPATH=$(PWD)/ml python evaluate_baselines.py

# Avaliar apenas baselines (sem modelo treinado)
forecast-baselines:
	@echo "📊 Avaliando baselines..."
	cd ml/training && PYTHONPATH=$(PWD)/ml python evaluate_baselines.py --model-path none

# Treinar via Temporal Workflow
forecast-train-temporal:
	@echo "🧠 Iniciando ForecastTrainWorkflow..."
	PYTHONPATH=$(PWD) python temporal/start_forecast_workflow.py train --min-months 6 --epochs 50

forecast-train-wait:
	@echo "🧠 Treinando modelo Transformer (aguardando conclusão)..."
	PYTHONPATH=$(PWD) python temporal/start_forecast_workflow.py train --wait --min-months 6 --epochs 50

forecast-inference:
	@echo "🔮 Iniciando ForecastInferenceWorkflow..."
	PYTHONPATH=$(PWD) python temporal/start_forecast_workflow.py inference --save

forecast-inference-wait:
	@echo "🔮 Gerando previsões (aguardando conclusão)..."
	PYTHONPATH=$(PWD) python temporal/start_forecast_workflow.py inference --wait --save

# Inferência batch local (sem Temporal) usando modelo V2
forecast-inference-local:
	@echo "🔮 Executando inferência batch local..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.inference \
		--model-dir models \
		--write-to-db \
		--output-format summary

# Inferência batch local sem salvar no banco (dry run)
forecast-inference-dry:
	@echo "🔮 Executando inferência batch (dry run)..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.inference \
		--model-dir models \
		--output-format summary

# Inferência batch com output em tabela
forecast-inference-table:
	@echo "🔮 Executando inferência batch..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.inference \
		--model-dir models \
		--output-format table

# Inferência batch com output em JSON
forecast-inference-json:
	@echo "🔮 Executando inferência batch..."
	cd ml && PYTHONPATH=$(PWD)/ml python -m spending_forecast.scripts.inference \
		--model-dir models \
		--output-format json

# Comparar diferentes configurações de modelo
forecast-compare:
	@echo "📊 Comparando configurações de modelo..."
	@echo "Treinando flatten..."
	@POOLING=flatten LOSS=mse EPOCHS=50 EXPERIMENT=forecast-comparison $(MAKE) forecast-train-experiment
	@echo "Treinando attention..."
	@POOLING=attention LOSS=gaussian_nll EPOCHS=50 EXPERIMENT=forecast-comparison $(MAKE) forecast-train-experiment
	@echo "Treinando cls..."
	@POOLING=cls LOSS=gaussian_nll EPOCHS=50 EXPERIMENT=forecast-comparison $(MAKE) forecast-train-experiment
	@echo "✅ Comparação completa! Veja resultados em http://localhost:5000"

# ==================== Forecast Docker/KServe ====================

forecast-build:
	@echo "🐳 Building forecast model image..."
	docker build -f docker/forecast-model/Dockerfile -t spending-forecast:latest .

forecast-load-minikube:
	@echo "☸️ Loading image into Minikube..."
	minikube image load spending-forecast:latest

forecast-deploy:
	@echo "🚀 Deploying to KServe..."
	kubectl apply -f kserve/forecast-inference-service.yaml

forecast-full-deploy: forecast-build forecast-load-minikube forecast-deploy
	@echo "✅ Forecast model deployed to KServe!"

# ==================== Cleanup ====================

clean:
	@echo "🧹 Limpando arquivos temporários..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	rm -rf dbt/target dbt/dbt_packages dbt/logs 2>/dev/null || true
	rm -rf ml/models/*.joblib 2>/dev/null || true
	rm -rf infrastructure/.terraform 2>/dev/null || true
	@echo "✅ Limpeza completa!"

