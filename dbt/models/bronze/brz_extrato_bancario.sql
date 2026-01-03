{{
    config(
        materialized='view',
        schema='bronze'
    )
}}

/*
    Bronze Layer: Extrato Bancário Nubank
    
    Lê dados de duas fontes:
    1. landing.raw_transactions (novos uploads via interface)
    2. Seeds CSV (dados históricos migrados)
    
    Realiza limpeza básica e padronização de tipos.
*/

-- Fonte 1: Dados da nova tabela de landing (uploads via interface)
with landing_data as (
    select
        data_transacao,
        valor::decimal(15,2) as valor,
        (dados_raw->>'identificador')::varchar as transaction_id,
        descricao,
        to_char(data_transacao, 'mon') as mes_ref,
        created_at as _loaded_at
    from {{ source('landing', 'raw_transactions') }}
    where datasource_id = 'nubank_extrato'
),

-- Fonte 2: Seeds CSV legados (para retrocompatibilidade)
seeds_data as (
    {% set seed_names = [
        'NU_19098187_01JAN2025_31JAN2025',
        'NU_19098187_01FEV2025_28FEV2025',
        'NU_19098187_01MAR2025_31MAR2025',
        'NU_19098187_01ABR2025_30ABR2025',
        'NU_19098187_01MAI2025_31MAI2025',
        'NU_19098187_01JUN2025_30JUN2025',
        'NU_19098187_01JUL2025_31JUL2025',
        'NU_19098187_01AGO2025_31AGO2025',
        'NU_19098187_01SET2025_30SET2025',
        'NU_19098187_01OUT2025_31OUT2025',
        'NU_19098187_01NOV2025_30NOV2025',
        'NU_19098187_01DEZ2025_21DEZ2025'
    ] %}
    
    {% for seed_name in seed_names %}
    select 
        to_date(data, 'DD/MM/YYYY') as data_transacao,
        valor::decimal(15,2) as valor,
        identificador as transaction_id,
        "descrição" as descricao,
        '{{ seed_name[-14:-11] | lower }}' as mes_ref,
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
        data_transacao,
        valor,
        transaction_id,
        trim(descricao) as descricao,
        
        -- Classificação básica do tipo de transação
        case
            when descricao ilike '%Transferência enviada pelo Pix%' then 'pix_enviado'
            when descricao ilike '%Transferência recebida pelo Pix%' then 'pix_recebido'
            when descricao ilike '%Transferência Recebida%' then 'transferencia_recebida'
            when descricao ilike '%Transferência enviada%' then 'transferencia_enviada'
            when descricao ilike '%Pagamento de fatura%' then 'pagamento_fatura'
            when descricao ilike '%Pagamento de boleto%' then 'pagamento_boleto'
            when descricao ilike '%Compra no débito%' then 'debito'
            when descricao ilike '%Resgate RDB%' then 'resgate_investimento'
            when descricao ilike '%Aplicação RDB%' then 'aplicacao_investimento'
            when descricao ilike '%Crédito em conta%' then 'credito'
            when descricao ilike '%Valor adicionado%' then 'credito_pix'
            else 'outros'
        end as tipo_transacao,
        
        -- Extrair beneficiário/pagador do Pix
        case
            when descricao ilike '%Pix%-%' then
                trim(split_part(split_part(descricao, ' - ', 2), ' - ', 1))
            when descricao ilike '%Pagamento de boleto efetuado%' then
                trim(split_part(descricao, ' - ', 2))
            else null
        end as beneficiario,
        
        -- Flags
        case when valor > 0 then true else false end as is_entrada,
        case when valor < 0 then true else false end as is_saida,
        
        -- Metadados
        mes_ref,
        _loaded_at
        
    from unified_data
    where data_transacao is not null
      and transaction_id is not null
)

select * from limpeza
