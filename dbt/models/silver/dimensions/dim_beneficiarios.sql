{{
    config(
        materialized='table',
        schema='silver'
    )
}}

/*
    Silver Layer: Dimensão de Beneficiários
    
    Extrai e agrega todos os beneficiários de Pix do extrato bancário.
*/

with beneficiarios_extrato as (
    select distinct
        beneficiario,
        count(*) as total_transacoes,
        sum(case when is_saida then abs(valor) else 0 end) as total_enviado,
        sum(case when is_entrada then valor else 0 end) as total_recebido,
        min(data_transacao) as primeira_transacao,
        max(data_transacao) as ultima_transacao
    from {{ ref('brz_extrato_bancario') }}
    where beneficiario is not null
      and beneficiario != ''
    group by beneficiario
)

select
    md5(beneficiario) as beneficiario_id,
    beneficiario as nome_beneficiario,
    total_transacoes,
    total_enviado,
    total_recebido,
    total_enviado - total_recebido as saldo_liquido,
    primeira_transacao,
    ultima_transacao,
    case 
        when total_transacoes >= 5 then 'frequente'
        when total_transacoes >= 2 then 'recorrente'
        else 'esporadico'
    end as frequencia_classificacao,
    current_timestamp as _created_at
from beneficiarios_extrato


