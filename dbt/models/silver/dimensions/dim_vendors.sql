{{
    config(
        materialized='table',
        schema='silver'
    )
}}

/*
    Silver Layer: Dimensão de Vendors
    
    Processa o seed de vendors e expande as keywords para facilitar o match
    com descrições de transações. Cada keyword gera uma linha separada.
*/

with vendors_raw as (
    select
        vendor_id,
        vendor_nome,
        keywords,
        logo_url,
        icone_emoji,
        cor_hex,
        categoria_sugerida
    from {{ ref('vendors') }}
),

-- Expande as keywords em linhas separadas para facilitar o join
vendors_expanded as (
    select
        vendor_id,
        vendor_nome,
        lower(trim(unnest(string_to_array(keywords, ',')))) as keyword,
        logo_url,
        icone_emoji,
        cor_hex,
        categoria_sugerida
    from vendors_raw
)

select
    vendor_id,
    vendor_nome,
    keyword,
    -- Se logo_url estiver vazio, retorna null
    case when logo_url = '' then null else logo_url end as logo_url,
    icone_emoji,
    cor_hex,
    categoria_sugerida,
    -- Comprimento da keyword para priorizar matches mais específicos
    length(keyword) as keyword_length,
    current_timestamp as _created_at
from vendors_expanded
where keyword is not null 
  and keyword != ''

