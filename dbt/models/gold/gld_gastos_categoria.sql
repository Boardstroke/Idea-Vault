{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Gold Layer: Gastos por Categoria
    
    Análise detalhada de gastos por categoria com métricas comparativas.
*/

with gastos_por_categoria as (
    select
        ano_mes,
        ano,
        mes,
        categoria_id,
        categoria_nome,
        sum(abs(valor)) as total_gasto,
        count(*) as qtd_transacoes,
        avg(abs(valor)) as ticket_medio,
        min(abs(valor)) as menor_gasto,
        max(abs(valor)) as maior_gasto
    from {{ ref('fct_transacoes') }}
    where is_saida = true
      and not is_iof
      and not is_estorno
    group by 1, 2, 3, 4, 5
),

-- Total mensal para calcular percentuais
totais_mensais as (
    select
        ano_mes,
        sum(total_gasto) as total_mes
    from gastos_por_categoria
    group by 1
),

-- Juntar com totais
gastos_com_percentual as (
    select
        g.*,
        t.total_mes,
        round((g.total_gasto / t.total_mes * 100)::numeric, 1) as percentual_do_total
    from gastos_por_categoria g
    join totais_mensais t on g.ano_mes = t.ano_mes
),

-- Calcular médias móveis e comparativos
gastos_com_metricas as (
    select
        *,
        -- Média móvel 3 meses
        round(avg(total_gasto) over (
            partition by categoria_id 
            order by ano_mes 
            rows between 2 preceding and current row
        )::numeric, 2) as media_movel_3m,
        
        -- Gasto do mês anterior na mesma categoria
        lag(total_gasto) over (
            partition by categoria_id 
            order by ano_mes
        ) as gasto_mes_anterior,
        
        -- Ranking da categoria no mês
        row_number() over (
            partition by ano_mes 
            order by total_gasto desc
        ) as ranking_mes
    from gastos_com_percentual
)

select
    ano_mes,
    ano,
    mes,
    categoria_id,
    categoria_nome,
    round(total_gasto::numeric, 2) as total_gasto,
    qtd_transacoes,
    round(ticket_medio::numeric, 2) as ticket_medio,
    round(menor_gasto::numeric, 2) as menor_gasto,
    round(maior_gasto::numeric, 2) as maior_gasto,
    percentual_do_total,
    media_movel_3m,
    
    -- Variação vs mês anterior
    case 
        when gasto_mes_anterior > 0 then
            round(((total_gasto - gasto_mes_anterior) / gasto_mes_anterior * 100)::numeric, 1)
        else null
    end as variacao_pct,
    
    -- Tendência
    case
        when gasto_mes_anterior is null then 'primeiro_registro'
        when total_gasto > gasto_mes_anterior * 1.1 then 'aumentando'
        when total_gasto < gasto_mes_anterior * 0.9 then 'diminuindo'
        else 'estavel'
    end as tendencia,
    
    ranking_mes,
    
    -- Acumulado do ano na categoria
    sum(total_gasto) over (
        partition by categoria_id, ano 
        order by mes
    ) as acumulado_ano,
    
    current_timestamp as _gold_loaded_at
from gastos_com_metricas
order by ano_mes, total_gasto desc


