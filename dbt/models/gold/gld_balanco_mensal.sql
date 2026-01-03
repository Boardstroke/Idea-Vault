{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Gold Layer: Balanço Mensal
    
    Resumo financeiro mensal com entradas, saídas, saldo e métricas comparativas.
*/

with transacoes_mensais as (
    select
        ano_mes,
        ano,
        mes,
        fonte,
        -- Entradas
        sum(case when is_entrada and valor > 0 then valor else 0 end) as total_entradas,
        -- Saídas (valor absoluto)
        sum(case when is_saida then abs(valor) else 0 end) as total_saidas,
        -- Contagens
        count(*) as total_transacoes,
        count(case when is_entrada then 1 end) as qtd_entradas,
        count(case when is_saida then 1 end) as qtd_saidas
    from {{ ref('fct_transacoes') }}
    where not is_iof  -- Excluir IOF para não duplicar
    group by 1, 2, 3, 4
),

-- Agregar por mês (combinando conta e cartão)
balanco_mensal as (
    select
        ano_mes,
        ano,
        mes,
        sum(total_entradas) as total_entradas,
        sum(total_saidas) as total_saidas,
        sum(total_transacoes) as total_transacoes,
        sum(qtd_entradas) as qtd_entradas,
        sum(qtd_saidas) as qtd_saidas,
        sum(case when fonte = 'conta_corrente' then total_saidas else 0 end) as saidas_conta,
        sum(case when fonte = 'cartao_credito' then total_saidas else 0 end) as saidas_cartao
    from transacoes_mensais
    group by 1, 2, 3
),

-- Calcular métricas adicionais
balanco_com_metricas as (
    select
        *,
        -- Saldo do mês
        total_entradas - total_saidas as saldo_mensal,
        
        -- Saldo acumulado (running total)
        sum(total_entradas - total_saidas) over (order by ano_mes) as saldo_acumulado,
        
        -- Mês anterior para comparação
        lag(total_saidas) over (order by ano_mes) as saidas_mes_anterior,
        lag(total_entradas) over (order by ano_mes) as entradas_mes_anterior,
        
        -- Taxa de poupança
        case 
            when total_entradas > 0 then 
                round(((total_entradas - total_saidas) / total_entradas * 100)::numeric, 1)
            else 0 
        end as taxa_poupanca_pct,
        
        -- Ticket médio
        round((total_saidas / nullif(qtd_saidas, 0))::numeric, 2) as ticket_medio_saida
    from balanco_mensal
)

select
    ano_mes,
    ano,
    mes,
    -- Valores principais
    round(total_entradas::numeric, 2) as total_entradas,
    round(total_saidas::numeric, 2) as total_saidas,
    round(saldo_mensal::numeric, 2) as saldo_mensal,
    round(saldo_acumulado::numeric, 2) as saldo_acumulado,
    
    -- Breakdown por fonte
    round(saidas_conta::numeric, 2) as saidas_conta_corrente,
    round(saidas_cartao::numeric, 2) as saidas_cartao_credito,
    
    -- Contagens
    total_transacoes,
    qtd_entradas,
    qtd_saidas,
    
    -- Métricas
    taxa_poupanca_pct,
    ticket_medio_saida,
    
    -- Variação MoM (Month over Month)
    case 
        when saidas_mes_anterior > 0 then
            round(((total_saidas - saidas_mes_anterior) / saidas_mes_anterior * 100)::numeric, 1)
        else null
    end as variacao_saidas_pct,
    
    case 
        when entradas_mes_anterior > 0 then
            round(((total_entradas - entradas_mes_anterior) / entradas_mes_anterior * 100)::numeric, 1)
        else null
    end as variacao_entradas_pct,
    
    -- Status do mês
    case
        when saldo_mensal > 0 then 'superavit'
        when saldo_mensal < 0 then 'deficit'
        else 'equilibrado'
    end as status_mes,
    
    current_timestamp as _gold_loaded_at
from balanco_com_metricas
order by ano_mes


