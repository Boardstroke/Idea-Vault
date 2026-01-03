/*
    Macro para usar variáveis do projeto nos modelos
    
    Uso: {{ var('anomaly_threshold') }}
*/

{% macro get_anomaly_threshold() %}
    {{ var('anomaly_threshold', 50000) }}
{% endmacro %}

{% macro get_late_arriving_days() %}
    {{ var('late_arriving_days', 90) }}
{% endmacro %}

