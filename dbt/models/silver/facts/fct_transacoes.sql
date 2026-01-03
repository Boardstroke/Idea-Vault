{{
    config(
        materialized='table',
        schema='silver'
    )
}}

/*
    Silver Layer: Fato de Transações Consolidadas
    
    Unifica extrato bancário e fatura de cartão em uma tabela única
    com categorização automática e enriquecimento de vendors.
*/

with extrato as (
    select
        transaction_id,
        data_transacao,
        valor,
        descricao as descricao_original,
        tipo_transacao,
        beneficiario,
        is_entrada,
        is_saida,
        'conta_corrente' as fonte,
        false as is_parcelado,
        null::integer as parcela_atual,
        null::integer as total_parcelas,
        false as is_iof,
        false as is_estorno,
        _loaded_at
    from {{ ref('brz_extrato_bancario') }}
),

cartao as (
    select
        transaction_id,
        data_transacao,
        -- Inverter sinal para padronizar: negativo = saída
        case when is_debito then -valor else valor end as valor,
        titulo as descricao_original,
        case
            when is_pagamento then 'pagamento_fatura'
            when is_estorno then 'estorno'
            when is_iof then 'iof'
            else 'cartao_credito'
        end as tipo_transacao,
        estabelecimento as beneficiario,
        is_credito as is_entrada,
        is_debito as is_saida,
        'cartao_credito' as fonte,
        is_parcelado,
        parcela_atual,
        total_parcelas,
        is_iof,
        is_estorno,
        _loaded_at
    from {{ ref('brz_fatura_cartao') }}
),

transacoes_unificadas as (
    select * from extrato
    union all
    select * from cartao
),

categorias as (
    select * from {{ ref('dim_categorias') }}
),

vendors as (
    select * from {{ ref('dim_vendors') }}
),

-- Função para encontrar a categoria baseada em palavras-chave
transacoes_categorizadas as (
    select
        t.*,
        coalesce(
            (
                select c.categoria_id
                from categorias c
                where exists (
                    select 1
                    from unnest(c.palavras_chave) as pk
                    where t.descricao_original ilike '%' || pk || '%'
                )
                limit 1
            ),
            'outros'
        ) as categoria_id
    from transacoes_unificadas t
),

-- Enriquecimento com vendors (match por keyword)
transacoes_com_vendor as (
    select
        tc.*,
        v.vendor_id,
        v.vendor_nome,
        v.logo_url as vendor_logo_url,
        v.icone_emoji as vendor_icone,
        v.cor_hex as vendor_cor
    from transacoes_categorizadas tc
    left join lateral (
        -- Encontra o vendor com keyword mais longa que dá match (mais específico)
        select 
            vendor_id,
            vendor_nome,
            logo_url,
            icone_emoji,
            cor_hex
        from vendors v
        where lower(tc.descricao_original) like '%' || v.keyword || '%'
        order by v.keyword_length desc
        limit 1
    ) v on true
)

select
    tv.transaction_id,
    tv.data_transacao,
    tv.valor,
    abs(tv.valor) as valor_absoluto,
    tv.descricao_original,
    tv.tipo_transacao,
    tv.beneficiario,
    tv.is_entrada,
    tv.is_saida,
    tv.fonte,
    tv.is_parcelado,
    tv.parcela_atual,
    tv.total_parcelas,
    tv.is_iof,
    tv.is_estorno,
    tv.categoria_id,
    coalesce(c.categoria_nome, 'Outros') as categoria_nome,
    
    -- Campos de vendor (enriquecimento)
    tv.vendor_id,
    tv.vendor_nome,
    tv.vendor_logo_url,
    tv.vendor_icone,
    tv.vendor_cor,
    
    -- Campos de data derivados
    extract(year from tv.data_transacao) as ano,
    extract(month from tv.data_transacao) as mes,
    extract(dow from tv.data_transacao) as dia_semana,
    to_char(tv.data_transacao, 'YYYY-MM') as ano_mes,
    case when extract(dow from tv.data_transacao) in (0, 6) then true else false end as is_fim_semana,
    
    tv._loaded_at,
    current_timestamp as _silver_loaded_at
from transacoes_com_vendor tv
left join categorias c on tv.categoria_id = c.categoria_id
