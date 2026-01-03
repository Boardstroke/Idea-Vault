/*
    Teste Genérico: Validar que datas estão em um range válido
    
    - Não pode ser futura
    - Não pode ser muito antiga (antes de 2020 por padrão)
    
    Uso no schema.yml:
    - valid_date_range:
        min_date: '2020-01-01'
*/

{% test valid_date_range(model, column_name, min_date='2020-01-01') %}

select *
from {{ model }}
where 
    {{ column_name }} > current_date
    or {{ column_name }} < '{{ min_date }}'::date

{% endtest %}

