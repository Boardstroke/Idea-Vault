"""Data fetching from Gold layer."""

import logging
import pandas as pd
from sqlalchemy import create_engine

from spending_forecast.config import DATABASE_URL

logger = logging.getLogger(__name__)


def fetch_spending_data(db_url: str = None) -> pd.DataFrame:
    """
    Fetch monthly spending data from Gold layer.
    
    Returns DataFrame with columns:
    - ano_mes: YYYY-MM date string
    - categoria: category name
    - valor_total: total spending (BRL)
    - quantidade_transacoes: transaction count
    - mes: month number (1-12)
    """
    db_url = db_url or DATABASE_URL
    engine = create_engine(db_url)
    
    query = """
    SELECT 
        ano_mes,
        categoria_nome as categoria,
        total_gasto as valor_total,
        qtd_transacoes as quantidade_transacoes,
        mes
    FROM gold.gld_gastos_categoria
    WHERE total_gasto > 0
    ORDER BY categoria_nome, ano_mes
    """
    
    df = pd.read_sql(query, engine)
    logger.info(f"Fetched {len(df)} records from gold.gld_gastos_categoria")
    
    return df

