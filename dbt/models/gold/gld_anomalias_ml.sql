{{
    config(
        materialized='table',
        schema='gold'
    )
}}

-- depends_on: {{ ref('fct_transacoes') }}

/*
    Gold Layer: Detecção de Anomalias
    
    Identifica transações anômalas baseado em regras estatísticas.
    Pode ser enriquecido com predições do modelo ML quando disponível.
    
    Critérios de anomalia:
    - Valor muito acima da média da categoria
    - Transação em horário incomum (não aplicável sem hora)
    - Primeiro gasto em estabelecimento novo com valor alto
    - Valor acima de X desvios padrão da média
*/

with transacoes as (
    select * from {{ ref('fct_transacoes') }}
    where is_saida = true
      and not is_iof
      and not is_estorno
),

-- Estatísticas por categoria
stats_categoria as (
    select
        categoria_id,
        avg(valor_absoluto) as media_categoria,
        stddev(valor_absoluto) as desvio_categoria,
        percentile_cont(0.75) within group (order by valor_absoluto) as p75_categoria,
        percentile_cont(0.95) within group (order by valor_absoluto) as p95_categoria,
        max(valor_absoluto) as max_categoria
    from transacoes
    group by 1
),

-- Estatísticas por beneficiário
stats_beneficiario as (
    select
        beneficiario,
        count(*) as qtd_transacoes_benef,
        avg(valor_absoluto) as media_benef,
        min(data_transacao) as primeira_transacao_benef
    from transacoes
    where beneficiario is not null
    group by 1
),

-- Juntar transações com estatísticas
transacoes_com_stats as (
    select
        t.*,
        sc.media_categoria,
        sc.desvio_categoria,
        sc.p75_categoria,
        sc.p95_categoria,
        sb.qtd_transacoes_benef,
        sb.media_benef,
        sb.primeira_transacao_benef
    from transacoes t
    left join stats_categoria sc on t.categoria_id = sc.categoria_id
    left join stats_beneficiario sb on t.beneficiario = sb.beneficiario
),

-- Calcular scores de anomalia
anomalias as (
    select
        transaction_id,
        data_transacao,
        descricao_original,
        beneficiario,
        categoria_id,
        categoria_nome,
        fonte,
        valor_absoluto,
        is_fim_semana,
        ano_mes,
        media_categoria,
        desvio_categoria,
        p75_categoria,
        p95_categoria,
        qtd_transacoes_benef,
        media_benef,
        primeira_transacao_benef,
        -- Score baseado em desvios padrão
        case
            when desvio_categoria > 0 then
                (valor_absoluto - media_categoria) / desvio_categoria
            else 0
        end as z_score,
        
        -- Flags de anomalia
        case when valor_absoluto > p95_categoria then true else false end as is_acima_p95,
        case when valor_absoluto > media_categoria * 3 then true else false end as is_3x_media,
        case 
            when data_transacao = primeira_transacao_benef 
                 and valor_absoluto > 500 
            then true 
            else false 
        end as is_primeiro_gasto_alto
    from transacoes_com_stats
),

-- Classificar anomalias
anomalias_classificadas as (
    select
        *,
        -- Score composto de anomalia (0-100)
        least(100, greatest(0,
            (case when z_score > 2 then 30 else 0 end) +
            (case when is_acima_p95 then 25 else 0 end) +
            (case when is_3x_media then 30 else 0 end) +
            (case when is_primeiro_gasto_alto then 15 else 0 end)
        )) as anomaly_score,
        
        -- Motivos da anomalia
        array_remove(array[
            case when z_score > 2 then 'valor_acima_2_desvios' end,
            case when is_acima_p95 then 'acima_percentil_95' end,
            case when is_3x_media then 'valor_3x_acima_media' end,
            case when is_primeiro_gasto_alto then 'primeiro_gasto_alto' end
        ], null) as motivos_anomalia
    from anomalias
)

select
    transaction_id,
    data_transacao,
    descricao_original,
    beneficiario,
    categoria_nome,
    fonte,
    round(valor_absoluto::numeric, 2) as valor,
    round(media_categoria::numeric, 2) as media_categoria,
    round(z_score::numeric, 2) as z_score,
    anomaly_score,
    
    -- É anomalia se score >= 50
    case when anomaly_score >= 50 then true else false end as is_anomaly,
    
    -- Severidade
    case
        when anomaly_score >= 80 then 'alta'
        when anomaly_score >= 50 then 'media'
        when anomaly_score >= 25 then 'baixa'
        else 'normal'
    end as severidade,
    
    motivos_anomalia,
    is_acima_p95,
    is_3x_media,
    is_primeiro_gasto_alto,
    is_fim_semana,
    ano_mes,
    
    current_timestamp as _gold_loaded_at
from anomalias_classificadas
where anomaly_score > 0  -- Apenas transações com algum indicativo de anomalia
order by anomaly_score desc, data_transacao desc

