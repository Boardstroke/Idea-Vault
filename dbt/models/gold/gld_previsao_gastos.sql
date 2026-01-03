{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Gold Layer: Previsão de Gastos
    
    Projeta gastos futuros baseado em:
    - Assinaturas ativas
    - Parcelas em andamento
    - Média histórica por categoria
*/

with assinaturas_ativas as (
    select
        servico_nome,
        valor_mensal,
        'assinatura' as tipo_gasto,
        status
    from {{ ref('gld_resumo_assinaturas') }}
    where status = 'ativa'
),

parcelas_futuras as (
    select
        estabelecimento,
        valor_parcela,
        parcelas_restantes,
        data_proxima_parcela,
        'parcela' as tipo_gasto
    from {{ ref('fct_parcelas') }}
    where status_compra = 'em_andamento'
      and parcelas_restantes > 0
),

-- Gastos variáveis: média dos últimos 3 meses por categoria
gastos_variaveis as (
    select
        categoria_nome,
        round(avg(total_gasto)::numeric, 2) as media_3m,
        'variavel' as tipo_gasto
    from {{ ref('gld_gastos_categoria') }}
    where ano_mes >= to_char(current_date - interval '3 months', 'YYYY-MM')
      and categoria_id not in ('assinaturas', 'investimentos', 'transferencias', 'pagamentos')
    group by 1
),

-- Próximo mês
proximo_mes as (
    select to_char(current_date + interval '1 month', 'YYYY-MM') as ano_mes_proximo
),

-- Consolidar previsões
previsao_assinaturas as (
    select
        (select ano_mes_proximo from proximo_mes) as ano_mes,
        servico_nome as descricao,
        valor_mensal as valor_previsto,
        tipo_gasto,
        'alta' as confianca,
        1 as meses_projetados
    from assinaturas_ativas
),

previsao_parcelas as (
    select
        to_char(data_proxima_parcela, 'YYYY-MM') as ano_mes,
        estabelecimento || ' (parcela)' as descricao,
        valor_parcela as valor_previsto,
        tipo_gasto,
        'alta' as confianca,
        1 as meses_projetados
    from parcelas_futuras
    where data_proxima_parcela is not null
),

previsao_variaveis as (
    select
        (select ano_mes_proximo from proximo_mes) as ano_mes,
        categoria_nome || ' (média)' as descricao,
        media_3m as valor_previsto,
        tipo_gasto,
        'media' as confianca,
        1 as meses_projetados
    from gastos_variaveis
),

todas_previsoes as (
    select * from previsao_assinaturas
    union all
    select * from previsao_parcelas
    union all
    select * from previsao_variaveis
)

select
    ano_mes,
    descricao,
    round(valor_previsto::numeric, 2) as valor_previsto,
    tipo_gasto,
    confianca,
    meses_projetados,
    
    -- Classificação
    case tipo_gasto
        when 'assinatura' then 1
        when 'parcela' then 2
        else 3
    end as ordem_tipo,
    
    current_timestamp as _gold_loaded_at
from todas_previsoes
where valor_previsto > 0
order by ano_mes, ordem_tipo, valor_previsto desc


