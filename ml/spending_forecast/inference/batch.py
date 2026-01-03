# spending_forecast/inference/batch.py
"""
Batch inference module for Temporal integration.

Provides high-level API for running batch inference from database
and writing results back.
"""

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from .loader import load_model, ModelBundle
from .predictor import ForecastPredictor, MonthlyForecast

logger = logging.getLogger(__name__)

# Default database URL
DEFAULT_DB_URL = os.getenv(
    "DATABASE_URL", "postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion"
)


@dataclass
class BatchInferenceConfig:
    """Configuration for batch inference."""

    db_url: str = DEFAULT_DB_URL
    model_path: Optional[str] = None
    model_dir: str = "/tmp/models"
    history_months: int = 6
    categories: Optional[List[str]] = None
    write_to_db: bool = True
    table_name: str = "spending_forecasts"
    schema_name: str = "ml_output"


@dataclass
class BatchInferenceResult:
    """Result of batch inference."""

    predictions: List[Dict[str, Any]]
    model_version: str
    model_arch: str
    rows_written: int
    categories_processed: int
    execution_time_seconds: float
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "predictions": self.predictions,
            "model_version": self.model_version,
            "model_arch": self.model_arch,
            "rows_written": self.rows_written,
            "categories_processed": self.categories_processed,
            "execution_time_seconds": self.execution_time_seconds,
            "errors": self.errors,
        }


class BatchInference:
    """
    Batch inference for Spending Forecast models.

    Designed for integration with Temporal workflows.
    Handles:
    - Loading model from local path or MLflow
    - Fetching historical data from database
    - Running inference for all/specified categories
    - Writing results back to database
    """

    def __init__(self, config: Optional[BatchInferenceConfig] = None):
        """
        Initialize batch inference.

        Args:
            config: BatchInferenceConfig with settings
        """
        self.config = config or BatchInferenceConfig()
        self.bundle: Optional[ModelBundle] = None
        self.predictor: Optional[ForecastPredictor] = None
        self._loaded = False

    def load_model(self) -> None:
        """Load the forecast model."""
        logger.info("Loading forecast model...")

        model_path = self.config.model_path
        if model_path is None:
            model_path = os.path.join(
                self.config.model_dir, "forecast_transformer_latest.pt"
            )

        self.bundle = load_model(model_path=model_path)
        self.predictor = ForecastPredictor(self.bundle)
        self._loaded = True

        logger.info(
            f"Model loaded: {self.bundle.model_arch} v{self.bundle.model_version}"
        )

    def fetch_history(
        self,
        categories: Optional[List[str]] = None,
    ) -> pd.DataFrame:
        """
        Fetch historical spending data from database.

        Args:
            categories: List of categories to fetch (None = all)

        Returns:
            DataFrame with historical data
        """
        logger.info("Fetching historical data from database...")

        engine = create_engine(self.config.db_url)

        # Base query
        query = """
        SELECT 
            ano_mes,
            categoria_nome as categoria,
            total_gasto as valor_total,
            mes
        FROM gold.gld_gastos_categoria
        WHERE total_gasto > 0
        """

        # Filter by categories if specified
        if categories:
            placeholders = ", ".join([f"'{c}'" for c in categories])
            query += f" AND categoria_nome IN ({placeholders})"

        query += " ORDER BY categoria_nome, ano_mes"

        df = pd.read_sql(query, engine)
        logger.info(
            f"Fetched {len(df)} records for {df['categoria'].nunique()} categories"
        )

        return df

    def run(
        self,
        categories: Optional[List[str]] = None,
        write_to_db: Optional[bool] = None,
    ) -> BatchInferenceResult:
        """
        Run batch inference.

        Args:
            categories: Categories to process (None = all from config or DB)
            write_to_db: Override config setting for writing to DB

        Returns:
            BatchInferenceResult with predictions and stats
        """
        start_time = datetime.now()
        errors = []

        # Load model if not loaded
        if not self._loaded:
            self.load_model()

        # Determine categories
        cats_to_process = categories or self.config.categories

        # Fetch data
        df = self.fetch_history(categories=cats_to_process)

        if df.empty:
            return BatchInferenceResult(
                predictions=[],
                model_version=self.bundle.model_version,
                model_arch=self.bundle.model_arch,
                rows_written=0,
                categories_processed=0,
                execution_time_seconds=0,
                errors=["No data found in database"],
            )

        # Run inference
        predictions = []
        categories_processed = 0

        for categoria, group in df.groupby("categoria"):
            group = group.sort_values("ano_mes")

            # Need at least seq_len months
            if len(group) < self.predictor.seq_len:
                logger.warning(
                    f"Skipping {categoria}: insufficient history "
                    f"({len(group)} < {self.predictor.seq_len})"
                )
                continue

            try:
                history = group["valor_total"].values
                last_date = str(group["ano_mes"].max())

                forecasts = self.predictor.predict_with_dates(
                    categoria=categoria,
                    history=history,
                    last_date=last_date,
                    return_uncertainty=True,
                )

                for f in forecasts:
                    predictions.append(f.to_dict())

                categories_processed += 1

            except Exception as e:
                error_msg = f"Error processing {categoria}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)

        logger.info(
            f"Generated {len(predictions)} predictions for {categories_processed} categories"
        )

        # Write to database
        should_write = (
            write_to_db if write_to_db is not None else self.config.write_to_db
        )
        rows_written = 0

        if should_write and predictions:
            rows_written = self._write_to_database(predictions)

        # Calculate execution time
        execution_time = (datetime.now() - start_time).total_seconds()

        return BatchInferenceResult(
            predictions=predictions,
            model_version=self.bundle.model_version,
            model_arch=self.bundle.model_arch,
            rows_written=rows_written,
            categories_processed=categories_processed,
            execution_time_seconds=execution_time,
            errors=errors,
        )

    def _write_to_database(self, predictions: List[Dict]) -> int:
        """
        Write predictions to database.

        Args:
            predictions: List of prediction dicts

        Returns:
            Number of rows written
        """
        logger.info(f"Writing {len(predictions)} predictions to database...")

        engine = create_engine(self.config.db_url)

        # Create schema and table if not exists
        with engine.connect() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {self.config.schema_name}"))
            conn.execute(
                text(f"""
                CREATE TABLE IF NOT EXISTS {self.config.schema_name}.{self.config.table_name} (
                    id SERIAL PRIMARY KEY,
                    categoria VARCHAR(100),
                    mes_referencia DATE,
                    valor_previsto DECIMAL(15,2),
                    intervalo_inferior DECIMAL(15,2),
                    intervalo_superior DECIMAL(15,2),
                    modelo_versao VARCHAR(50),
                    criado_em TIMESTAMP DEFAULT NOW()
                )
            """)
            )
            conn.commit()

        # Prepare records (compatible with existing table schema)
        records = []
        for pred in predictions:
            records.append(
                {
                    "categoria": pred["categoria"],
                    "mes_referencia": pred["mes_referencia"],
                    "valor_previsto": pred["valor_previsto"],
                    "intervalo_inferior": pred["intervalo_inferior"],
                    "intervalo_superior": pred["intervalo_superior"],
                    "modelo_versao": f"{self.bundle.model_arch}_{self.bundle.model_version}",
                }
            )

        # Insert
        df = pd.DataFrame(records)
        df.to_sql(
            self.config.table_name,
            engine,
            schema=self.config.schema_name,
            if_exists="append",
            index=False,
            method="multi",
        )

        logger.info(f"Wrote {len(records)} predictions to database")

        return len(records)


# Convenience function for Temporal activities
def run_batch_inference(
    model_path: str,
    db_url: str = DEFAULT_DB_URL,
    categories: Optional[List[str]] = None,
    history_months: int = 6,
    write_to_db: bool = True,
) -> Dict[str, Any]:
    """
    Run batch inference (convenience function for Temporal).

    Args:
        model_path: Path to model checkpoint
        db_url: Database connection URL
        categories: Categories to process
        history_months: Months of history to use
        write_to_db: Whether to write results to DB

    Returns:
        Dict with results
    """
    config = BatchInferenceConfig(
        db_url=db_url,
        model_path=model_path,
        history_months=history_months,
        categories=categories,
        write_to_db=write_to_db,
    )

    batch = BatchInference(config)
    result = batch.run()

    return result.to_dict()
