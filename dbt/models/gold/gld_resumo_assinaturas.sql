{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Gold Layer: Resumo de Assinaturas
    
    Visão consolidada de todas as assinaturas com custo total e status.
*/

with assinaturas as (
    select * from {{ ref('fct_assinaturas') }}
),

-- Resumo geral
resumo as (
    select
        assinatura_id,
        servico_nome,
        status,
        tipo_cobranca,
        origem,
        meses_cobranca,
        total_cobrancas,
        valor_medio,
        valor_minimo,
        valor_maximo,
        primeira_cobranca,
        ultima_cobranca,
        meses_cobrados,
        custo_anual_estimado,
        
        -- Classificar por tipo de serviço
        case
            when servico_nome in ('Netflix', 'HBO Max', 'Amazon Prime', 'YouTube Premium') then 'streaming_video'
            when servico_nome in ('Spotify') then 'streaming_audio'
            when servico_nome in ('OpenAI ChatGPT', 'Cursor AI', 'GitHub', 'AWS', 'Microsoft 365') then 'ferramentas_dev'
            when servico_nome in ('Google One') then 'armazenamento'
            when servico_nome in ('TIM') then 'telecom'
            when servico_nome in ('Nubank Seguro Vida') then 'seguro'
            when servico_nome in ('iFood Club', 'Mercado Livre Meli+') then 'beneficios'
            else 'outros'
        end as tipo_servico,
        
        _created_at
    from assinaturas
)

select
    assinatura_id,
    servico_nome,
    status,
    tipo_servico,
    tipo_cobranca,
    origem,
    meses_cobranca,
    total_cobrancas,
    valor_medio as valor_mensal,
    valor_minimo,
    valor_maximo,
    custo_anual_estimado,
    primeira_cobranca,
    ultima_cobranca,
    meses_cobrados,
    
    -- Há quantos meses não é cobrado
    case 
        when ultima_cobranca is not null then
            extract(month from age(current_date, ultima_cobranca))::integer
        else null
    end as meses_sem_cobranca,
    
    _created_at as _gold_loaded_at
from resumo
order by 
    case status when 'ativa' then 1 when 'inativa_recente' then 2 else 3 end,
    custo_anual_estimado desc


