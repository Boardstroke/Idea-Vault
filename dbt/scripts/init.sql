-- Inicialização do banco de dados para o projeto dbt Medallion + ML
-- Este script é executado automaticamente quando o container PostgreSQL é criado

-- Criar schemas para cada camada da arquitetura medallion
CREATE SCHEMA IF NOT EXISTS bronze;
CREATE SCHEMA IF NOT EXISTS silver;
CREATE SCHEMA IF NOT EXISTS gold;
CREATE SCHEMA IF NOT EXISTS snapshots;
CREATE SCHEMA IF NOT EXISTS landing;

-- Schema para ML predictions
CREATE SCHEMA IF NOT EXISTS ml_output;

-- Conceder permissões ao usuário dbt
GRANT ALL PRIVILEGES ON SCHEMA bronze TO dbt_user;
GRANT ALL PRIVILEGES ON SCHEMA silver TO dbt_user;
GRANT ALL PRIVILEGES ON SCHEMA gold TO dbt_user;
GRANT ALL PRIVILEGES ON SCHEMA snapshots TO dbt_user;
GRANT ALL PRIVILEGES ON SCHEMA landing TO dbt_user;
GRANT ALL PRIVILEGES ON SCHEMA ml_output TO dbt_user;

-- Tabela para armazenar predictions do modelo ML
CREATE TABLE IF NOT EXISTS ml_output.anomaly_predictions (
    prediction_id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    anomaly_score DECIMAL(10, 6) NOT NULL,
    is_anomaly BOOLEAN NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(transaction_id, model_version)
);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_predictions_transaction_id 
ON ml_output.anomaly_predictions(transaction_id);

CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at 
ON ml_output.anomaly_predictions(predicted_at);

-- Mensagem de confirmação
DO $$
BEGIN
    RAISE NOTICE 'Database initialized with all schemas and ML tables!';
END $$;
