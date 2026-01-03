{{
    config(
        materialized='table',
        schema='silver'
    )
}}

/*
    Silver Layer: Fato de Assinaturas
    
    Identifica serviços recorrentes (assinaturas) baseado em:
    - Categoria = 'assinaturas'
    - Ocorrência em múltiplos meses
    - Valores similares
*/

with transacoes_assinaturas as (
    select
        beneficiario,
        descricao_original,
        valor_absoluto,
        ano_mes,
        data_transacao,
        transaction_id
    from {{ ref('fct_transacoes') }}
    where categoria_id = 'assinaturas'
      and is_saida = true
      and is_iof = false
),

-- Agrupar por serviço e identificar recorrência
servicos_agrupados as (
    select
        beneficiario,
        -- Normalizar nome do serviço
        case
            when beneficiario ilike '%netflix%' then 'Netflix'
            when beneficiario ilike '%spotify%' then 'Spotify'
            when beneficiario ilike '%openai%' or beneficiario ilike '%chatgpt%' then 'OpenAI ChatGPT'
            when beneficiario ilike '%cursor%' then 'Cursor AI'
            when beneficiario ilike '%github%' then 'GitHub'
            when beneficiario ilike '%amazon%prime%' or beneficiario ilike '%amazonprime%' then 'Amazon Prime'
            when beneficiario ilike '%hbo%' then 'HBO Max'
            when beneficiario ilike '%google one%' or beneficiario ilike '%dl*google%' then 'Google One'
            when beneficiario ilike '%youtube%' then 'YouTube Premium'
            when beneficiario ilike '%microsoft%' then 'Microsoft 365'
            when beneficiario ilike '%aws%' then 'AWS'
            when beneficiario ilike '%tim%' then 'TIM'
            when beneficiario ilike '%nu seguro%' then 'Nubank Seguro Vida'
            when beneficiario ilike '%ifood club%' then 'iFood Club'
            when beneficiario ilike '%melimais%' then 'Mercado Livre Meli+'
            when beneficiario ilike '%surfview%' then 'Surfline'
            else beneficiario
        end as servico_nome,
        count(distinct ano_mes) as meses_cobranca,
        count(*) as total_cobrancas,
        avg(valor_absoluto) as valor_medio,
        min(valor_absoluto) as valor_minimo,
        max(valor_absoluto) as valor_maximo,
        min(data_transacao) as primeira_cobranca,
        max(data_transacao) as ultima_cobranca,
        array_agg(distinct ano_mes order by ano_mes) as meses_cobrados
    from transacoes_assinaturas
    group by 1, 2
),

-- Determinar status da assinatura
assinaturas_status as (
    select
        *,
        -- Status baseado na última cobrança
        case
            when ultima_cobranca >= current_date - interval '45 days' then 'ativa'
            when ultima_cobranca >= current_date - interval '90 days' then 'inativa_recente'
            else 'cancelada'
        end as status,
        
        -- Tipo de cobrança
        case
            when meses_cobranca >= 3 and (valor_maximo - valor_minimo) / nullif(valor_medio, 0) < 0.1 then 'fixa'
            when meses_cobranca >= 2 then 'variavel'
            else 'pontual'
        end as tipo_cobranca,
        
        -- Origem (nacional ou internacional)
        case
            when servico_nome in ('GitHub', 'OpenAI ChatGPT', 'Cursor AI', 'AWS') then 'internacional'
            else 'nacional'
        end as origem
    from servicos_agrupados
    where meses_cobranca >= 1  -- Pelo menos 1 mês para considerar assinatura
)

select
    md5(servico_nome) as assinatura_id,
    servico_nome,
    status,
    tipo_cobranca,
    origem,
    meses_cobranca,
    total_cobrancas,
    round(valor_medio::numeric, 2) as valor_medio,
    valor_minimo,
    valor_maximo,
    primeira_cobranca,
    ultima_cobranca,
    meses_cobrados,
    -- Estimativa de gasto anual
    round((valor_medio * 12)::numeric, 2) as custo_anual_estimado,
    current_timestamp as _created_at
from assinaturas_status
order by custo_anual_estimado desc


