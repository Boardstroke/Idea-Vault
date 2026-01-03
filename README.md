# MLOps Pipeline: dbt + KServe + Temporal

Pipeline completo de MLOps para detecção de anomalias em transações financeiras, combinando:

- **dbt** - Transformações de dados em arquitetura medallion
- **KServe** - Serving de modelos ML em Kubernetes
- **Temporal** - Orquestração de workflows
- **Terraform** - Infraestrutura como código

## 🏗️ Arquitetura

```mermaid
flowchart TB
    subgraph DataPipeline [Data Pipeline - dbt]
        Seeds[Seeds/Landing]
        Bronze[Bronze Layer]
        Silver[Silver Layer]
        Gold[Gold Layer + ML]
        Seeds --> Bronze --> Silver --> Gold
    end

    subgraph MLPipeline [ML Pipeline - Temporal]
        TrainWF[Train Workflow]
        InferWF[Inference Workflow]
    end

    subgraph Infrastructure [Infrastructure]
        K8s[Kubernetes/Minikube]
        KServe[KServe]
        Temporal[Temporal Server]
        Postgres[(PostgreSQL)]
        MinIO[(MinIO)]
    end

    Silver -->|Features| TrainWF
    TrainWF -->|Deploy| KServe
    InferWF -->|Predict| KServe
    InferWF -->|Write| Postgres
    Postgres -->|Predictions| Gold
```

## 📁 Estrutura do Projeto

```
├── dbt/                      # Projeto dbt
│   ├── models/
│   │   ├── bronze/          # Limpeza básica
│   │   ├── silver/          # Transformações
│   │   └── gold/            # Métricas + ML
│   ├── seeds/               # Dados de exemplo
│   ├── snapshots/           # SCD Type 2
│   └── tests/               # Testes de qualidade
│
├── infrastructure/           # Terraform
│   ├── main.tf              # Recursos principais
│   ├── variables.tf         # Variáveis
│   └── scripts/             # Scripts de setup
│
├── ml/                       # Machine Learning
│   ├── training/            # Script de treino
│   ├── serving/             # KServe model server
│   └── models/              # Modelos salvos
│
├── kserve/                   # Kubernetes manifests
│   ├── inference-service.yaml
│   └── test-inference.sh
│
├── temporal/                 # Workflows Temporal
│   ├── workflows/           # Definições de workflow
│   └── worker/              # Worker e activities
│
└── docker/                   # Dockerfiles
    ├── ml-training/
    ├── temporal-worker/
    └── kserve-model/
```

## 🚀 Quick Start

### Pré-requisitos

- Docker Desktop
- Minikube
- kubectl
- Terraform >= 1.0
- Python 3.10+
- Helm 3

### 1. Subir Infraestrutura Local

```bash
# Subir PostgreSQL, Temporal e MinIO
docker-compose up -d

# Verificar se está rodando
docker-compose ps
```

### 2. Configurar dbt

```bash
cd dbt

# Criar virtualenv
python -m venv .venv
source .venv/bin/activate

# Instalar dependências
pip install -r requirements.txt
dbt deps

# Testar conexão
dbt debug

# Carregar seeds e executar modelos
dbt seed
dbt snapshot
dbt run
dbt test
```

### 3. Treinar Modelo (Local)

```bash
cd ml/training

# Instalar dependências
pip install -r requirements.txt

# Treinar modelo
python train.py
```

### 4. Setup Kubernetes (Opcional - para KServe)

```bash
# Iniciar Minikube
./infrastructure/scripts/setup-minikube.sh

# Aplicar Terraform
cd infrastructure
terraform init
terraform apply

# Verificar KServe
kubectl get pods -n kserve
kubectl get inferenceservices -n ml-serving
```

### 5. Iniciar Worker Temporal

```bash
cd temporal

# Instalar dependências
pip install -r requirements.txt

# Iniciar worker
python -m temporal.worker.main
```

### 6. Executar Workflows

```bash
# Treinar modelo via Temporal
temporal workflow start \
    --task-queue ml-pipeline \
    --type TrainWorkflow \
    --input '{"contamination": 0.1, "n_estimators": 100}'

# Executar inferência
temporal workflow start \
    --task-queue ml-pipeline \
    --type InferenceWorkflow \
    --input '{"batch_size": 100, "trigger_dbt": true}'

# Agendar inferência a cada hora
temporal schedule create \
    --schedule-id hourly-inference \
    --cron "0 * * * *" \
    --workflow-id scheduled-inference \
    --task-queue ml-pipeline \
    --workflow-type ScheduledInferenceWorkflow
```

## 📊 Camadas de Dados

### Bronze Layer
- Deduplicação de registros
- Conversão de tipos
- Tracking de carga (`_loaded_at`)

### Silver Layer
- **dim_accounts**: Dimensão de contas com SCD Type 2
- **dim_categories**: Dimensão de categorias
- **fct_transactions**: Fato de transações com:
  - Tratamento de datas futuras
  - Flags de late arriving
  - Correção de sinais
  - Score de qualidade de dados

### Gold Layer
- **gld_daily_balance**: Balanço diário por conta
- **gld_category_summary**: Resumo por categoria
- **gld_transactions_with_ml**: Transações + predictions ML
- **gld_anomaly_summary**: Dashboard de anomalias

## 🤖 Modelo de ML

### Isolation Forest
- **Objetivo**: Detectar transações anômalas
- **Features**:
  - `absolute_amount` - Valor absoluto
  - `day_of_week` - Dia da semana
  - `transaction_month` - Mês
  - `is_weekend` - Flag de fim de semana

### Output
- `anomaly_score` (0-1): Maior = mais anômalo
- `is_anomaly` (bool): Flag de anomalia
- `model_version`: Versão do modelo

## 🔄 Workflows Temporal

### TrainWorkflow
1. Extrai features do PostgreSQL
2. Treina Isolation Forest
3. Salva modelo no storage
4. Deploy para KServe

### InferenceWorkflow
1. Busca transações sem prediction
2. Chama KServe para batch inference
3. Escreve predictions no PostgreSQL
4. Trigger dbt Gold refresh

## 🔧 Configuração

### Variáveis de Ambiente

```bash
# Database
DATABASE_URL=postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion

# Temporal
TEMPORAL_HOST=localhost
TEMPORAL_PORT=7233
TASK_QUEUE=ml-pipeline

# Model
MODEL_DIR=/app/ml/models
CONTAMINATION=0.1
N_ESTIMATORS=100

# KServe
KSERVE_HOST=localhost
KSERVE_PORT=8080
```

## 🧪 Testes

```bash
# Testes dbt
cd dbt && dbt test

# Testar KServe localmente
./kserve/test-inference.sh

# Verificar workflows no Temporal UI
open http://localhost:8080
```

## 📈 Monitoramento

### Temporal UI
- URL: http://localhost:8080
- Visualize workflows em execução
- Histórico de execuções
- Logs de activities

### PostgreSQL
```sql
-- Verificar predictions
SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN is_anomaly THEN 1 END) as anomalies
FROM ml_output.anomaly_predictions;

-- Taxa de anomalia por modelo
SELECT 
    model_version,
    COUNT(*) as predictions,
    AVG(anomaly_score) as avg_score
FROM ml_output.anomaly_predictions
GROUP BY model_version;
```

## 🐳 Build Docker Images

```bash
# Build training image
docker build -f docker/ml-training/Dockerfile -t ml-training:latest .

# Build temporal worker
docker build -f docker/temporal-worker/Dockerfile -t temporal-worker:latest .

# Build KServe model
docker build -f docker/kserve-model/Dockerfile -t kserve-model:latest .
```

## 📝 TODO

- [ ] Implementar upload para MinIO no `save_model_to_storage`
- [ ] Adicionar métricas Prometheus
- [ ] Implementar model registry
- [ ] Adicionar A/B testing de modelos
- [ ] CI/CD pipeline

## 📄 Licença

MIT
