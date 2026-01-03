{{
    config(
        materialized='table',
        schema='gold'
    )
}}

/*
    Gold Layer: Top Beneficiários
    
    Ranking dos principais destinatários de transferências (Pix, TED, etc).
*/

with beneficiarios as (
    select * from {{ ref('dim_beneficiarios') }}
),

transacoes_beneficiario as (
    select
        beneficiario,
        ano_mes,
        count(*) as qtd_transacoes,
        sum(case when is_saida then abs(valor) else 0 end) as total_enviado,
        sum(case when is_entrada then valor else 0 end) as total_recebido
    from {{ ref('fct_transacoes') }}
    where beneficiario is not null
      and beneficiario != ''
    group by 1, 2
),

-- Agregar por beneficiário com timeline
timeline_beneficiario as (
    select
        beneficiario,
        array_agg(ano_mes order by ano_mes) as meses_ativo,
        count(distinct ano_mes) as qtd_meses_ativo
    from transacoes_beneficiario
    group by 1
)

select
    b.beneficiario_id,
    b.nome_beneficiario,
    b.total_transacoes,
    round(b.total_enviado::numeric, 2) as total_enviado,
    round(b.total_recebido::numeric, 2) as total_recebido,
    round(b.saldo_liquido::numeric, 2) as saldo_liquido,
    b.primeira_transacao,
    b.ultima_transacao,
    b.frequencia_classificacao,
    
    -- Classificar tipo de beneficiário
    case
        when b.total_recebido > b.total_enviado then 'pagador'
        when b.total_enviado > b.total_recebido then 'recebedor'
        else 'equilibrado'
    end as tipo_beneficiario,
    
    -- Ticket médio
    round((b.total_enviado / nullif(b.total_transacoes, 0))::numeric, 2) as ticket_medio,
    
    -- Timeline
    t.meses_ativo,
    t.qtd_meses_ativo,
    
    -- Ranking por valor enviado
    row_number() over (order by b.total_enviado desc) as ranking_por_valor,
    
    -- Ranking por frequência
    row_number() over (order by b.total_transacoes desc) as ranking_por_frequencia,
    
    current_timestamp as _gold_loaded_at
from beneficiarios b
left join timeline_beneficiario t on b.nome_beneficiario = t.beneficiario
where b.total_enviado > 0 or b.total_recebido > 0
order by b.total_enviado desc
limit 50


