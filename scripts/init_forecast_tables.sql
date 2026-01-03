-- Create ML output schema and tables for spending forecasts
-- Run this script to initialize the database schema

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS ml_output;

-- Drop existing table if recreating
-- DROP TABLE IF EXISTS ml_output.spending_forecasts;

-- Create spending forecasts table
CREATE TABLE IF NOT EXISTS ml_output.spending_forecasts (
    id SERIAL PRIMARY KEY,
    categoria VARCHAR(100) NOT NULL,
    mes_referencia DATE NOT NULL,
    valor_previsto DECIMAL(15,2) NOT NULL,
    intervalo_inferior DECIMAL(15,2),
    intervalo_superior DECIMAL(15,2),
    modelo_versao VARCHAR(50) NOT NULL,
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_spending_forecasts_categoria 
    ON ml_output.spending_forecasts(categoria);

CREATE INDEX IF NOT EXISTS idx_spending_forecasts_mes 
    ON ml_output.spending_forecasts(mes_referencia);

CREATE INDEX IF NOT EXISTS idx_spending_forecasts_modelo 
    ON ml_output.spending_forecasts(modelo_versao);

-- Create unique constraint to avoid duplicate predictions
-- (same category, month, and model version)
CREATE UNIQUE INDEX IF NOT EXISTS idx_spending_forecasts_unique
    ON ml_output.spending_forecasts(categoria, mes_referencia, modelo_versao);

-- Grant permissions (adjust as needed for your setup)
GRANT ALL ON SCHEMA ml_output TO dbt_user;
GRANT ALL ON ALL TABLES IN SCHEMA ml_output TO dbt_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ml_output TO dbt_user;

-- Add comment to table
COMMENT ON TABLE ml_output.spending_forecasts IS 
    'Previsões de gastos geradas pelo modelo Transformer';

COMMENT ON COLUMN ml_output.spending_forecasts.categoria IS 
    'Categoria de gasto (Alimentação, Transporte, etc)';

COMMENT ON COLUMN ml_output.spending_forecasts.mes_referencia IS 
    'Mês para o qual a previsão foi feita';

COMMENT ON COLUMN ml_output.spending_forecasts.valor_previsto IS 
    'Valor previsto de gasto para a categoria no mês';

COMMENT ON COLUMN ml_output.spending_forecasts.intervalo_inferior IS 
    'Limite inferior do intervalo de confiança (95%)';

COMMENT ON COLUMN ml_output.spending_forecasts.intervalo_superior IS 
    'Limite superior do intervalo de confiança (95%)';

COMMENT ON COLUMN ml_output.spending_forecasts.modelo_versao IS 
    'Versão do modelo que gerou a previsão';

-- View for latest forecasts only
CREATE OR REPLACE VIEW ml_output.v_latest_forecasts AS
SELECT DISTINCT ON (categoria, mes_referencia)
    id,
    categoria,
    mes_referencia,
    valor_previsto,
    intervalo_inferior,
    intervalo_superior,
    modelo_versao,
    criado_em
FROM ml_output.spending_forecasts
ORDER BY categoria, mes_referencia, criado_em DESC;

COMMENT ON VIEW ml_output.v_latest_forecasts IS 
    'Últimas previsões por categoria e mês';


