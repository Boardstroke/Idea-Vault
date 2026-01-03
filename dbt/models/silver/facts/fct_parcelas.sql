{{
    config(
        materialized='table',
        schema='silver'
    )
}}

/*
    Silver Layer: Fato de Compras Parceladas
    
    Agrupa parcelas da mesma compra e calcula informações
    sobre parcelas pagas e restantes.
*/

with parcelas_cartao as (
    select
        transaction_id,
        data_transacao,
        descricao_original,
        beneficiario,
        valor_absoluto,
        parcela_atual,
        total_parcelas,
        ano_mes,
        categoria_id,
        categoria_nome
    from {{ ref('fct_transacoes') }}
    where is_parcelado = true
      and fonte = 'cartao_credito'
      and parcela_atual is not null
      and total_parcelas is not null
),

-- Agrupar por compra (mesmo beneficiário e total de parcelas)
compras_agrupadas as (
    select
        beneficiario,
        total_parcelas,
        categoria_id,
        categoria_nome,
        -- Usar valor médio das parcelas (pode ter pequenas variações por IOF)
        round(avg(valor_absoluto)::numeric, 2) as valor_parcela,
        count(*) as parcelas_pagas,
        min(parcela_atual) as primeira_parcela_paga,
        max(parcela_atual) as ultima_parcela_paga,
        min(data_transacao) as data_primeira_parcela,
        max(data_transacao) as data_ultima_parcela,
        sum(valor_absoluto) as total_pago,
        array_agg(distinct parcela_atual order by parcela_atual) as parcelas_pagas_lista
    from parcelas_cartao
    group by 1, 2, 3, 4
),

-- Calcular informações adicionais
compras_detalhadas as (
    select
        *,
        -- Valor total da compra
        round((valor_parcela * total_parcelas)::numeric, 2) as valor_total_compra,
        
        -- Parcelas restantes
        total_parcelas - ultima_parcela_paga as parcelas_restantes,
        
        -- Valor restante
        round((valor_parcela * (total_parcelas - ultima_parcela_paga))::numeric, 2) as valor_restante,
        
        -- Status da compra
        case
            when ultima_parcela_paga >= total_parcelas then 'quitada'
            when ultima_parcela_paga < total_parcelas then 'em_andamento'
            else 'desconhecido'
        end as status_compra,
        
        -- Próxima parcela esperada
        case
            when ultima_parcela_paga < total_parcelas then
                data_ultima_parcela + interval '1 month'
            else null
        end as data_proxima_parcela
    from compras_agrupadas
)

select
    md5(beneficiario || total_parcelas::text || data_primeira_parcela::text) as compra_id,
    beneficiario as estabelecimento,
    categoria_id,
    categoria_nome,
    total_parcelas,
    parcelas_pagas,
    parcelas_restantes,
    valor_parcela,
    valor_total_compra,
    total_pago,
    valor_restante,
    status_compra,
    data_primeira_parcela,
    data_ultima_parcela,
    data_proxima_parcela::date as data_proxima_parcela,
    parcelas_pagas_lista,
    -- Mês de início
    to_char(data_primeira_parcela, 'YYYY-MM') as mes_inicio,
    -- Previsão de término
    to_char(data_primeira_parcela + (total_parcelas - 1) * interval '1 month', 'YYYY-MM') as mes_fim_previsto,
    current_timestamp as _created_at
from compras_detalhadas
order by valor_restante desc nulls last


