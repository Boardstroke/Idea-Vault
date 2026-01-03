{{
    config(
        materialized='table',
        schema='silver'
    )
}}

/*
    Silver Layer: Dimensão de Categorias
    
    Regras de categorização automática baseadas em palavras-chave.
    Esta tabela é usada como lookup para classificar transações.
*/

with regras_categoria as (
    select * from (
        values
        -- Moradia e Utilidades
        ('moradia', 'Moradia', array['CELESC', 'CASAN', 'aluguel', 'luz', 'agua', 'condominio', 'energia', 'DMAE']),
        
        -- Transporte
        ('transporte', 'Transporte', array['Posto', 'Uber', 'combustivel', 'AUTOPISTA', 'ClickBus', 'Taxi', 'gasolina', '99App', '99Pop', 'Shell', 'Ipiranga', 'BR Distribuidora', 'Palhocinha', 'Hangar']),
        
        -- Alimentação
        ('alimentacao', 'Alimentação', array['Supermercado', 'Mercado', 'iFood', 'Ifood', 'restaurante', 'Acai', 'Burger', 'Padaria', 'Confeitaria', 'Lancheria', 'Hortifruti', 'Granja', 'Koch', 'Silveira', 'Biffao', 'lanche', 'pizza', 'Subway', 'McDonald', 'coffee', 'Cafe', 'Sorveteria', 'Ana Supermercado', 'Komprao']),
        
        -- Saúde
        ('saude', 'Saúde', array['Farmacia', 'Laboratorio', 'Panvel', 'Medico', 'hospital', 'clinica', 'drogaria', 'consulta', 'exame', 'Preco Popular', 'Farma', 'Diagnostico', 'Ostermann']),
        
        -- Assinaturas e Serviços Digitais
        ('assinaturas', 'Assinaturas', array['Netflix', 'Spotify', 'ChatGPT', 'Openai', 'Cursor', 'GitHub', 'Prime', 'HBO', 'Amazon Prime', 'Google One', 'Youtube', 'Microsoft', 'Aws', 'Nu Seguro', 'Melimais', 'Ifood Club', 'Tim*Tim', 'Digital Games', 'Surfview']),
        
        -- Transferências
        ('transferencias', 'Transferências', array['Pix', 'Transferencia', 'TED', 'DOC']),
        
        -- Investimentos
        ('investimentos', 'Investimentos', array['RDB', 'Aplicacao', 'Resgate', 'CDB', 'poupanca', 'investimento']),
        
        -- Compras Online
        ('compras_online', 'Compras Online', array['Kabum', 'Magazine', 'Magalu', 'Mercado Livre', 'Mercadolivre', 'Amazon', 'Shopee', 'AliExpress']),
        
        -- Pets
        ('pets', 'Pets', array['Pets', 'Vet', 'Agropecuaria', 'pet shop', 'veterinario', 'Vicentin', 'Finpet']),
        
        -- Lazer e Entretenimento
        ('lazer', 'Lazer', array['Bar', 'Cerveja', 'Bilhar', 'cinema', 'teatro', 'show', 'ingresso', 'Uhuu', '4beer']),
        
        -- Telecomunicações
        ('telecom', 'Telecomunicações', array['Internet', 'Tim', 'Claro', 'Vivo', 'Oi', 'telefone', 'celular']),
        
        -- Vestuário e Beleza
        ('vestuario_beleza', 'Vestuário e Beleza', array['roupa', 'sapato', 'moda', 'beleza', 'Barber', 'cabeleireiro', 'Emporio da Beleza', 'Estilo', 'Cigana']),
        
        -- Serviços e Manutenção
        ('servicos', 'Serviços', array['Oficina', 'Mecanica', 'eletricista', 'encanador', 'reparo', 'manutencao', 'Materiais de Constr', 'Lavanderia', 'Laundrexpress']),
        
        -- IOF e Taxas
        ('taxas', 'IOF e Taxas', array['IOF de']),
        
        -- Pagamentos e Faturas
        ('pagamentos', 'Pagamentos', array['Pagamento recebido', 'Pagamento de fatura', 'boleto']),
        
        -- Viagens
        ('viagens', 'Viagens', array['Hotel', 'Pousada', 'Garibaldi', 'viagem', 'passagem', 'Locadora', 'aereo'])
        
    ) as t(categoria_id, categoria_nome, palavras_chave)
)

select 
    categoria_id,
    categoria_nome,
    palavras_chave,
    current_timestamp as _created_at
from regras_categoria


