/*
    Macro: Gerar chave surrogate customizada
    
    Esta macro é um wrapper para a função do dbt_utils
    com algumas customizações para o projeto.
    
    Uso: {{ generate_sk(['campo1', 'campo2']) }}
*/

{% macro generate_sk(field_list) %}
    {{ dbt_utils.generate_surrogate_key(field_list) }}
{% endmacro %}


/*
    Macro: Formatar valor monetário
    
    Uso: {{ format_currency('amount') }}
*/

{% macro format_currency(column_name) %}
    'R$ ' || to_char({{ column_name }}, 'FM999,999,999.00')
{% endmacro %}


/*
    Macro: Classificar valor em faixas
    
    Uso: {{ classify_amount('amount', [50, 200, 1000, 5000]) }}
*/

{% macro classify_amount(column_name, thresholds=[50, 200, 1000, 5000]) %}
    case 
        when abs({{ column_name }}) < {{ thresholds[0] }} then 'Micro'
        when abs({{ column_name }}) < {{ thresholds[1] }} then 'Pequeno'
        when abs({{ column_name }}) < {{ thresholds[2] }} then 'Médio'
        when abs({{ column_name }}) < {{ thresholds[3] }} then 'Grande'
        else 'Muito Grande'
    end
{% endmacro %}

