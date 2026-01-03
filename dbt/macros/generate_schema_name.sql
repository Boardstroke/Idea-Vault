/*
    Macro customizada para geração de nomes de schema.
    
    Por padrão, o dbt concatena o schema base com o schema customizado:
    - public + bronze = public_bronze
    
    Esta macro sobrescreve esse comportamento para usar apenas
    o nome do schema customizado quando definido:
    - bronze → bronze
    - silver → silver  
    - gold → gold
    - landing → landing
*/

{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- set default_schema = target.schema -%}
    
    {%- if custom_schema_name is none -%}
        {{ default_schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}

