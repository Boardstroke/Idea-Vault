"""Data preparation and feature engineering."""

import logging
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from spending_forecast.config import SEQ_LEN, PRED_LEN

logger = logging.getLogger(__name__)


def prepare_data(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, Dict[str, int], Dict[str, Dict[str, float]]]:
    """
    Prepare data for training with per-category normalization.
    
    Returns:
    - df: DataFrame with normalized columns
    - category_mapping: {category_name: id}
    - scaler_params: {category_name: {mean, std, trend_mean, trend_std}}
    """
    logger.info("Preparing data...")
    
    # Create category mapping
    categories = df["categoria"].unique()
    category_mapping = {cat: idx for idx, cat in enumerate(categories)}
    df["categoria_id"] = df["categoria"].map(category_mapping)
    
    # Sort by category and ano_mes (real date ordering - critical!)
    df = df.sort_values(["categoria", "ano_mes"]).copy()
    
    # Calculate trend (difference from previous month)
    df["tendencia"] = df.groupby("categoria")["valor_total"].diff().fillna(0)
    
    # Per-category normalization (z-score)
    logger.info("Applying per-category z-score normalization...")
    scaler_params = {}
    
    for cat in categories:
        mask = df["categoria"] == cat
        cat_values = df.loc[mask, "valor_total"]
        cat_trends = df.loc[mask, "tendencia"]
        
        mean_val = float(cat_values.mean())
        std_val = float(cat_values.std()) if cat_values.std() > 0 else 1.0
        mean_trend = float(cat_trends.mean())
        std_trend = float(cat_trends.std()) if cat_trends.std() > 0 else 1.0
        
        scaler_params[cat] = {
            "mean": mean_val,
            "std": std_val,
            "trend_mean": mean_trend,
            "trend_std": std_trend,
        }
        
        # Apply normalization
        df.loc[mask, "valor_normalizado"] = (cat_values - mean_val) / std_val
        df.loc[mask, "tendencia_normalizada"] = (cat_trends - mean_trend) / std_trend
    
    # Store global stats for reference
    scaler_params["_global"] = {
        "mean": float(df["valor_total"].mean()),
        "std": float(df["valor_total"].std()) or 1.0,
        "trend_mean": float(df["tendencia"].mean()),
        "trend_std": float(df["tendencia"].std()) or 1.0,
    }
    
    logger.info(f"Prepared {len(categories)} categories")
    
    return df, category_mapping, scaler_params


def create_sequences(
    df: pd.DataFrame,
    category_mapping: Dict[str, int],
    seq_len: int = SEQ_LEN,
    pred_len: int = PRED_LEN,
) -> List[Dict]:
    """
    Create training sequences from prepared data.
    
    Each sequence contains:
    - x_numeric: (seq_len, 2) - [valor_normalizado, tendencia_normalizada]
    - categories: (seq_len,) - category IDs
    - months: (seq_len,) - month numbers (1-12)
    - y: (pred_len,) - target values (normalized)
    - target_ano_mes: last target date (for temporal splits)
    """
    logger.info("Creating sequences...")
    
    sequences = []
    
    for cat_id, group in df.groupby("categoria_id"):
        group = group.sort_values("ano_mes")
        
        if len(group) < seq_len + pred_len:
            continue
        
        values = group["valor_normalizado"].values
        trends = group["tendencia_normalizada"].values
        months = group["mes"].values.astype(int)
        ano_mes_list = group["ano_mes"].values
        
        # Create sliding windows
        for i in range(len(values) - seq_len - pred_len + 1):
            x_values = values[i : i + seq_len]
            x_trends = trends[i : i + seq_len]
            x_months = months[i : i + seq_len]
            
            y_values = values[i + seq_len : i + seq_len + pred_len]
            
            # Get the last target date for temporal splitting
            target_date = ano_mes_list[i + seq_len + pred_len - 1]
            
            sequences.append({
                "x_numeric": np.stack([x_values, x_trends], axis=-1).astype(np.float32),
                "categories": np.full(seq_len, cat_id, dtype=np.int64),
                "months": x_months.astype(np.int64),
                "y": y_values.astype(np.float32),
                "target_ano_mes": target_date,
            })
    
    logger.info(f"Created {len(sequences)} sequences")
    return sequences

