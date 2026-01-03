"""
KServe Model Server for Spending Forecast

Custom predictor that wraps the SpendingTransformer model (V1/V2)
for real-time inference via KServe.

Supports:
- V1: Attention pooling architecture
- V2: Forecast query tokens architecture (recommended)
"""

import os
import logging
from typing import Dict, Any, List
from pathlib import Path

import numpy as np
import pandas as pd
from kserve import Model, ModelServer
from kserve.errors import ModelMissingError
from sqlalchemy import create_engine

# Add spending_forecast to path
import sys

ML_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ML_DIR))

from spending_forecast.inference import load_model, ForecastPredictor, ModelBundle

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SpendingForecastModel(Model):
    """
    Custom KServe model for spending forecast.

    Supports V1 and V2 model architectures:
    - V1: Attention pooling (original)
    - V2: Forecast query tokens (recommended)

    Expects input in the format:
    {
        "instances": [
            {
                "categoria": "Alimentação",
                "history": [100.0, 150.0, 120.0, 180.0, 140.0, 160.0]
            },
            ...
        ]
    }

    Or for database-based inference:
    {
        "categories": ["Alimentação", "Transporte"],
        "history_months": 6
    }

    Returns:
    {
        "predictions": [
            {
                "categoria": "Alimentação",
                "forecast": [170.0, 165.0, 175.0],
                "lower_bound": [150.0, 145.0, 155.0],
                "upper_bound": [190.0, 185.0, 195.0]
            },
            ...
        ],
        "model_version": "v2_20251224_...",
        "model_arch": "v2"
    }
    """

    def __init__(self, name: str, model_dir: str = "/mnt/models", db_url: str = None):
        super().__init__(name)
        self.name = name
        self.model_dir = model_dir
        self.db_url = db_url or os.getenv(
            "DATABASE_URL",
            "postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion",
        )

        self.bundle: ModelBundle = None
        self.predictor: ForecastPredictor = None
        self.ready = False

    def load(self) -> bool:
        """Load the trained model using the inference module."""
        model_path = os.path.join(self.model_dir, "forecast_transformer_latest.pt")

        if not os.path.exists(model_path):
            # Try alternative path
            model_path = os.path.join(self.model_dir, "model.pt")

        if not os.path.exists(model_path):
            raise ModelMissingError(model_path)

        logger.info(f"Loading model from {model_path}")

        # Use new inference module
        self.bundle = load_model(model_path=model_path)
        self.predictor = ForecastPredictor(self.bundle)

        self.ready = True
        logger.info(f"Model loaded successfully!")
        logger.info(f"Architecture: {self.bundle.model_arch}")
        logger.info(f"Version: {self.bundle.model_version}")
        logger.info(f"Categories: {len(self.bundle.category_mapping)}")

        return self.ready

    def _fetch_history_from_db(
        self, categories: List[str], history_months: int
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch historical data from database.

        Returns dict with 'values' array and 'last_date' for each category.
        """
        engine = create_engine(self.db_url)

        query = """
        SELECT 
            categoria_nome as categoria, 
            ano_mes, 
            total_gasto as valor_total
        FROM gold.gld_gastos_categoria
        WHERE categoria_nome = ANY(%s)
        ORDER BY categoria_nome, ano_mes DESC
        """

        df = pd.read_sql(query, engine, params=(categories,))

        history = {}
        for cat in categories:
            cat_data = df[df["categoria"] == cat].head(history_months)
            if len(cat_data) >= history_months:
                # Reverse to get chronological order
                cat_data = cat_data.sort_values("ano_mes")
                history[cat] = {
                    "values": cat_data["valor_total"].values,
                    "last_date": str(cat_data["ano_mes"].max()),
                }

        return history

    def predict(
        self, payload: Dict[str, Any], headers: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """
        Make predictions on input data.

        Supports two input formats:
        1. Direct history values per category
        2. Category names (fetches history from database)
        """
        predictions = []

        # Format 1: Direct instances with history
        if "instances" in payload:
            for instance in payload["instances"]:
                categoria = instance.get("categoria", "Unknown")
                history = np.array(instance.get("history", []))

                if len(history) < self.predictor.seq_len:
                    logger.warning(f"Not enough history for {categoria}")
                    continue

                try:
                    result = self.predictor.predict_single(
                        categoria=categoria, history=history, return_uncertainty=True
                    )
                    predictions.append(result.to_dict())
                except Exception as e:
                    logger.error(f"Prediction failed for {categoria}: {e}")
                    continue

        # Format 2: Fetch from database
        elif "categories" in payload:
            categories = payload["categories"]
            history_months = payload.get("history_months", 6)

            history_data = self._fetch_history_from_db(categories, history_months)

            for categoria, data in history_data.items():
                try:
                    result = self.predictor.predict_single(
                        categoria=categoria,
                        history=data["values"],
                        return_uncertainty=True,
                    )
                    predictions.append(result.to_dict())
                except Exception as e:
                    logger.error(f"Prediction failed for {categoria}: {e}")
                    continue

        return {
            "predictions": predictions,
            "model_version": self.bundle.model_version,
            "model_arch": self.bundle.model_arch,
        }


if __name__ == "__main__":
    # For local testing / development
    model = SpendingForecastModel("spending-forecast", model_dir="../models")
    ModelServer().start([model])
