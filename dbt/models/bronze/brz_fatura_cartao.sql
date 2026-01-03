{{
    config(
        materialized='view',
        schema='bronze'
    )
}}

/*
    Bronze Layer: Fatura Cartão de Crédito Nubank
    
    Lê dados de duas fontes:
    1. landing.raw_transactions (novos uploads via interface)
    2. Seeds CSV (dados históricos migrados)
    
    Realiza limpeza básica e padronização.
*/

-- Fonte 1: Dados da nova tabela de landing (uploads via interface)
with landing_data as (
    select
        transaction_hash as transaction_id,
        data_transacao,
        valor::decimal(15,2) as valor,
        descricao as titulo,
        to_char(data_transacao, 'YYYY-MM') as fatura_ref,
        created_at as _loaded_at
    from {{ source('landing', 'raw_transactions') }}
    where datasource_id = 'nubank_fatura'
),

-- Fonte 2: Seeds CSV legados (para retrocompatibilidade)
seeds_data as (
    {% set seed_names = [
        'Nubank_2025-01-09',
        'Nubank_2025-02-09',
        'Nubank_2025-03-09',
        'Nubank_2025-04-09',
        'Nubank_2025-05-09',
        'Nubank_2025-06-09',
        'Nubank_2025-07-09',
        'Nubank_2025-08-09',
        'Nubank_2025-09-09',
        'Nubank_2025-10-09',
        'Nubank_2025-11-09',
        'Nubank_2025-12-09'
    ] %}
    
    {% for seed_name in seed_names %}
    select 
        md5(date || title || amount::text || '{{ seed_name }}') as transaction_id,
        date::date as data_transacao,
        amount::decimal(15,2) as valor,
        title as titulo,
        '{{ seed_name[7:14] }}' as fatura_ref,
        current_timestamp as _loaded_at
    from {{ ref(seed_name) }}
    {% if not loop.last %}union all{% endif %}
    {% endfor %}
),

-- Unifica as duas fontes, priorizando landing (mais recente)
unified_data as (
    -- Primeiro, dados do landing
    select * from landing_data
    
    union all
    
    -- Depois, dados dos seeds que NÃO existem no landing
    select s.*
    from seeds_data s
    left join landing_data l on s.transaction_id = l.transaction_id
    where l.transaction_id is null
),

limpeza as (
    select
        transaction_id,
        data_transacao,
        valor,
        trim(titulo) as titulo,
        
        -- Detectar se é parcela
        case 
            when titulo ~* 'Parcela [0-9]+/[0-9]+' then true
            when titulo ~* '- [0-9]+/[0-9]+$' then true
            else false
        end as is_parcelado,
        
        -- Extrair número da parcela atual
        case 
            when titulo ~* 'Parcela ([0-9]+)/[0-9]+' then
                (regexp_match(titulo, 'Parcela ([0-9]+)/[0-9]+'))[1]::integer
            when titulo ~* '- ([0-9]+)/[0-9]+$' then
                (regexp_match(titulo, '- ([0-9]+)/[0-9]+$'))[1]::integer
            else null
        end as parcela_atual,
        
        -- Extrair total de parcelas
        case 
            when titulo ~* 'Parcela [0-9]+/([0-9]+)' then
                (regexp_match(titulo, 'Parcela [0-9]+/([0-9]+)'))[1]::integer
            when titulo ~* '- [0-9]+/([0-9]+)$' then
                (regexp_match(titulo, '- [0-9]+/([0-9]+)$'))[1]::integer
            else null
        end as total_parcelas,
        
        -- Nome do estabelecimento (sem parcela)
        case 
            when titulo ~* ' - Parcela [0-9]+/[0-9]+' then
                trim(regexp_replace(titulo, ' - Parcela [0-9]+/[0-9]+', ''))
            when titulo ~* ' - [0-9]+/[0-9]+$' then
                trim(regexp_replace(titulo, ' - [0-9]+/[0-9]+$', ''))
            else trim(titulo)
        end as estabelecimento,
        
        -- Detectar se é IOF
        case when titulo ilike 'IOF de%' then true else false end as is_iof,
        
        -- Detectar se é pagamento recebido
        case when titulo ilike 'Pagamento recebido%' then true else false end as is_pagamento,
        
        -- Detectar se é estorno
        case when titulo ilike 'Estorno%' then true else false end as is_estorno,
        
        -- Flags
        case when valor < 0 then true else false end as is_credito,
        case when valor > 0 then true else false end as is_debito,
        
        -- Referência da fatura
        fatura_ref,
        
        -- Metadados
        _loaded_at
        
    from unified_data
    where data_transacao is not null
      and titulo is not null
)

select * from limpeza
