/*
    Teste Genérico: Validar que o sinal do valor corresponde ao tipo de categoria
    
    - Income deve ter amount > 0
    - Expense deve ter amount < 0
    - Transfer pode ser qualquer sinal
    
    Uso no schema.yml:
    - amount_sign_matches_category
*/

{% test amount_sign_matches_category(model, amount_column, category_type_column) %}

select *
from {{ model }}
where 
    ({{ category_type_column }} = 'income' and {{ amount_column }} < 0)
    or ({{ category_type_column }} = 'expense' and {{ amount_column }} > 0)

{% endtest %}

