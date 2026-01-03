-- Migration: Migrate existing seeds data to landing.raw_transactions
-- Description: Populates landing.raw_transactions with data from CSV seeds
-- Date: 2025-12-26
-- Note: Run this AFTER 001_create_ingestion_tables.sql

-- ============================================================
-- Create a "migration" upload record to track this data
-- ============================================================
INSERT INTO ingestion.uploads (
    datasource_id, 
    nome_arquivo, 
    status, 
    workflow_id,
    total_linhas,
    linhas_inseridas,
    linhas_duplicadas,
    created_at,
    completed_at
)
VALUES 
    ('nubank_extrato', 'seed_migration_extrato', 'completed', 'migration-seeds-extrato', 0, 0, 0, NOW(), NOW()),
    ('nubank_fatura', 'seed_migration_fatura', 'completed', 'migration-seeds-fatura', 0, 0, 0, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Get the upload IDs for reference
DO $$
DECLARE
    extrato_upload_id INTEGER;
    fatura_upload_id INTEGER;
    extrato_count INTEGER;
    fatura_count INTEGER;
BEGIN
    SELECT id INTO extrato_upload_id 
    FROM ingestion.uploads 
    WHERE workflow_id = 'migration-seeds-extrato';
    
    SELECT id INTO fatura_upload_id 
    FROM ingestion.uploads 
    WHERE workflow_id = 'migration-seeds-fatura';

    -- ============================================================
    -- Migrate Nubank Extrato Seeds
    -- ============================================================
    INSERT INTO landing.raw_transactions (
        datasource_id,
        transaction_hash,
        data_transacao,
        valor,
        descricao,
        dados_raw,
        upload_id
    )
    SELECT 
        'nubank_extrato' as datasource_id,
        md5('nubank_extrato|' || identificador) as transaction_hash,
        to_date(data, 'DD/MM/YYYY') as data_transacao,
        valor::decimal(15,2) as valor,
        "descrição" as descricao,
        jsonb_build_object(
            'data', data,
            'valor', valor::text,
            'identificador', identificador,
            'descricao', "descrição"
        ) as dados_raw,
        extrato_upload_id as upload_id
    FROM (
        SELECT * FROM landing."NU_19098187_01JAN2025_31JAN2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01FEV2025_28FEV2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01MAR2025_31MAR2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01ABR2025_30ABR2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01MAI2025_31MAI2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01JUN2025_30JUN2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01JUL2025_31JUL2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01AGO2025_31AGO2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01SET2025_30SET2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01OUT2025_31OUT2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01NOV2025_30NOV2025"
        UNION ALL SELECT * FROM landing."NU_19098187_01DEZ2025_21DEZ2025"
    ) seeds
    WHERE data IS NOT NULL 
      AND identificador IS NOT NULL
    ON CONFLICT (transaction_hash) DO NOTHING;

    GET DIAGNOSTICS extrato_count = ROW_COUNT;

    -- ============================================================
    -- Migrate Nubank Fatura Seeds
    -- ============================================================
    INSERT INTO landing.raw_transactions (
        datasource_id,
        transaction_hash,
        data_transacao,
        valor,
        descricao,
        dados_raw,
        upload_id
    )
    SELECT 
        'nubank_fatura' as datasource_id,
        md5('nubank_fatura|' || date || '|' || title || '|' || amount::text) as transaction_hash,
        date::date as data_transacao,
        amount::decimal(15,2) as valor,
        title as descricao,
        jsonb_build_object(
            'date', date,
            'title', title,
            'amount', amount::text
        ) as dados_raw,
        fatura_upload_id as upload_id
    FROM (
        SELECT * FROM landing."Nubank_2025-01-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-02-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-03-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-04-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-05-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-06-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-07-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-08-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-09-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-10-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-11-09"
        UNION ALL SELECT * FROM landing."Nubank_2025-12-09"
    ) seeds
    WHERE date IS NOT NULL 
      AND title IS NOT NULL
    ON CONFLICT (transaction_hash) DO NOTHING;

    GET DIAGNOSTICS fatura_count = ROW_COUNT;

    -- ============================================================
    -- Update upload records with counts
    -- ============================================================
    UPDATE ingestion.uploads 
    SET 
        total_linhas = extrato_count,
        linhas_inseridas = extrato_count
    WHERE id = extrato_upload_id;

    UPDATE ingestion.uploads 
    SET 
        total_linhas = fatura_count,
        linhas_inseridas = fatura_count
    WHERE id = fatura_upload_id;

    RAISE NOTICE 'Migrated % extrato transactions and % fatura transactions', extrato_count, fatura_count;
END $$;

-- ============================================================
-- Verify migration
-- ============================================================
SELECT 
    datasource_id,
    COUNT(*) as total_transactions,
    MIN(data_transacao) as primeira_transacao,
    MAX(data_transacao) as ultima_transacao
FROM landing.raw_transactions
GROUP BY datasource_id
ORDER BY datasource_id;

