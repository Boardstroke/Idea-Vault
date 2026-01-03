-- Migration: Create Ingestion Schema and Tables
-- Description: Tables for managing datasources and file uploads
-- Date: 2025-12-26

-- Create ingestion schema
CREATE SCHEMA IF NOT EXISTS ingestion;

-- ============================================================
-- Table: datasources
-- Description: Supported financial institutions and their parsers
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion.datasources (
    id VARCHAR(50) PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('banco', 'cartao', 'corretora', 'investimento')),
    parser_id VARCHAR(50) NOT NULL,
    formato_esperado JSONB DEFAULT '{}',
    descricao TEXT,
    icone VARCHAR(10),
    cor VARCHAR(7),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for active datasources
CREATE INDEX IF NOT EXISTS idx_datasources_ativo ON ingestion.datasources(ativo);

-- ============================================================
-- Table: uploads
-- Description: Upload history and processing status
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion.uploads (
    id SERIAL PRIMARY KEY,
    datasource_id VARCHAR(50) NOT NULL REFERENCES ingestion.datasources(id),
    nome_arquivo VARCHAR(255) NOT NULL,
    tamanho_bytes BIGINT,
    periodo_inicio DATE,
    periodo_fim DATE,
    total_linhas INTEGER DEFAULT 0,
    linhas_inseridas INTEGER DEFAULT 0,
    linhas_duplicadas INTEGER DEFAULT 0,
    linhas_erro INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    workflow_id VARCHAR(100),
    erro TEXT,
    detalhes JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_uploads_datasource ON ingestion.uploads(datasource_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON ingestion.uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_workflow ON ingestion.uploads(workflow_id);
CREATE INDEX IF NOT EXISTS idx_uploads_created ON ingestion.uploads(created_at DESC);

-- ============================================================
-- Table: raw_transactions (Landing layer)
-- Description: Unified landing table for all financial transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS landing.raw_transactions (
    id SERIAL PRIMARY KEY,
    datasource_id VARCHAR(50) NOT NULL,
    transaction_hash VARCHAR(64) NOT NULL,
    data_transacao DATE NOT NULL,
    valor DECIMAL(15, 2) NOT NULL,
    descricao TEXT,
    dados_raw JSONB NOT NULL,
    upload_id INTEGER REFERENCES ingestion.uploads(id),
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint for deduplication
    CONSTRAINT uq_transaction_hash UNIQUE (transaction_hash)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_raw_transactions_datasource ON landing.raw_transactions(datasource_id);
CREATE INDEX IF NOT EXISTS idx_raw_transactions_data ON landing.raw_transactions(data_transacao);
CREATE INDEX IF NOT EXISTS idx_raw_transactions_upload ON landing.raw_transactions(upload_id);
CREATE INDEX IF NOT EXISTS idx_raw_transactions_created ON landing.raw_transactions(created_at DESC);

-- ============================================================
-- Seed: Initial Datasources
-- ============================================================
INSERT INTO ingestion.datasources (id, nome, tipo, parser_id, formato_esperado, descricao, icone, cor)
VALUES 
    (
        'nubank_extrato',
        'Nubank - Extrato Conta',
        'banco',
        'nubank_extrato',
        '{
            "colunas": ["Data", "Valor", "Identificador", "Descrição"],
            "delimitador": ",",
            "encoding": "utf-8",
            "data_format": "DD/MM/YYYY"
        }',
        'Extrato da conta corrente Nubank (NuConta)',
        '💜',
        '#8B5CF6'
    ),
    (
        'nubank_fatura',
        'Nubank - Fatura Cartão',
        'cartao',
        'nubank_fatura',
        '{
            "colunas": ["date", "title", "amount"],
            "delimitador": ",",
            "encoding": "utf-8",
            "data_format": "YYYY-MM-DD"
        }',
        'Fatura do cartão de crédito Nubank',
        '💳',
        '#8B5CF6'
    )
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    formato_esperado = EXCLUDED.formato_esperado,
    descricao = EXCLUDED.descricao,
    updated_at = NOW();

-- ============================================================
-- Function: Update timestamp trigger
-- ============================================================
CREATE OR REPLACE FUNCTION ingestion.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for datasources
DROP TRIGGER IF EXISTS tr_datasources_updated_at ON ingestion.datasources;
CREATE TRIGGER tr_datasources_updated_at
    BEFORE UPDATE ON ingestion.datasources
    FOR EACH ROW
    EXECUTE FUNCTION ingestion.update_updated_at();

-- ============================================================
-- Grant permissions (adjust as needed)
-- ============================================================
GRANT USAGE ON SCHEMA ingestion TO dbt_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ingestion TO dbt_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ingestion TO dbt_user;
GRANT ALL PRIVILEGES ON landing.raw_transactions TO dbt_user;

