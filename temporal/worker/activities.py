"""
Temporal Activities for ML Pipeline

Activities are the building blocks executed by workflows.
Each activity performs a specific task with retry and timeout capabilities.
"""

import os
import json
import tempfile
import subprocess
from datetime import datetime
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from pathlib import Path

import httpx
import joblib
import numpy as np
import pandas as pd
import torch
from sqlalchemy import create_engine, text
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from temporalio import activity

# Add ML models to path
import sys

ML_DIR = Path(__file__).parent.parent.parent / "ml"
sys.path.insert(0, str(ML_DIR))

# Database connection
DB_URL = os.getenv(
    "DATABASE_URL", "postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion"
)

# KServe endpoint
KSERVE_HOST = os.getenv("KSERVE_HOST", "localhost")
KSERVE_PORT = os.getenv("KSERVE_PORT", "8080")

# Model storage
MODEL_DIR = os.getenv("MODEL_DIR", "/tmp/models")


# ============================================================
# Training Activities - Data Classes
# ============================================================


@dataclass
class ExtractFeaturesInput:
    min_quality_score: int = 50


@dataclass
class ExtractFeaturesOutput:
    features_path: str
    row_count: int


@dataclass
class TrainModelInput:
    features_path: str
    contamination: float = 0.1
    n_estimators: int = 100


@dataclass
class TrainModelOutput:
    model_path: str
    model_version: str
    metrics: Dict[str, Any]


@dataclass
class SaveModelInput:
    model_path: str
    model_version: str


@dataclass
class SaveModelOutput:
    storage_uri: str


@dataclass
class DeployModelInput:
    model_name: str
    model_version: str
    storage_uri: str


@dataclass
class DeployModelOutput:
    endpoint: str
    status: str


# ============================================================
# Inference Activities - Data Classes
# ============================================================


@dataclass
class FetchTransactionsInput:
    batch_size: int = 100
    offset: int = 0
    lookback_hours: int = 24


@dataclass
class FetchTransactionsOutput:
    transaction_ids: List[int]
    features: List[List[float]]
    has_more: bool


@dataclass
class CallKServeInput:
    model_name: str
    features: List[List[float]]
    transaction_ids: List[int]


@dataclass
class CallKServeOutput:
    predictions: List[Dict[str, Any]]
    model_version: str


@dataclass
class WritePredictionsInput:
    transaction_ids: List[int]
    predictions: List[Dict[str, Any]]
    model_version: str


@dataclass
class WritePredictionsOutput:
    rows_written: int
    anomalies_count: int


@dataclass
class TriggerDbtInput:
    select: str = "gold"


@dataclass
class TriggerDbtOutput:
    success: bool
    output: str


# ============================================================
# Training Activities
# ============================================================


@activity.defn
async def extract_features(input: ExtractFeaturesInput) -> ExtractFeaturesOutput:
    """Extract features from Silver layer for training."""
    activity.logger.info("Extracting features from database...")

    engine = create_engine(DB_URL)

    query = f"""
    SELECT
        transaction_id,
        absolute_amount,
        day_of_week::integer as day_of_week,
        transaction_month::integer as transaction_month,
        CASE WHEN is_weekend THEN 1 ELSE 0 END as is_weekend_int,
        is_amount_anomaly as label
    FROM silver.fct_transactions
    WHERE data_quality_score >= {input.min_quality_score}
    ORDER BY transaction_date DESC
    """

    df = pd.read_sql(query, engine)
    activity.logger.info(f"Fetched {len(df)} records")

    # Save to temp file
    os.makedirs(MODEL_DIR, exist_ok=True)
    features_path = os.path.join(MODEL_DIR, "features.parquet")
    df.to_parquet(features_path)

    return ExtractFeaturesOutput(features_path=features_path, row_count=len(df))


@activity.defn
async def train_model(input: TrainModelInput) -> TrainModelOutput:
    """Train Isolation Forest model."""
    activity.logger.info("Training model...")

    # Load features
    df = pd.read_parquet(input.features_path)

    feature_columns = [
        "absolute_amount",
        "day_of_week",
        "transaction_month",
        "is_weekend_int",
    ]

    X = df[feature_columns].values

    # Create and train pipeline
    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "isolation_forest",
                IsolationForest(
                    n_estimators=input.n_estimators,
                    contamination=input.contamination,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )

    pipeline.fit(X)

    # Get predictions for metrics
    predictions = pipeline.predict(X)
    anomaly_count = int(np.sum(predictions == -1))

    # Save model
    model_version = datetime.now().strftime("v%Y%m%d_%H%M%S")
    model_path = os.path.join(MODEL_DIR, f"model_{model_version}.joblib")
    joblib.dump(pipeline, model_path)

    # Also save as latest
    latest_path = os.path.join(MODEL_DIR, "model.joblib")
    joblib.dump(pipeline, latest_path)

    metrics = {
        "total_samples": len(X),
        "anomalies_detected": anomaly_count,
        "anomaly_rate": anomaly_count / len(X) if len(X) > 0 else 0,
    }

    activity.logger.info(f"Model trained: {model_version}, anomalies: {anomaly_count}")

    return TrainModelOutput(
        model_path=model_path, model_version=model_version, metrics=metrics
    )


@activity.defn
async def save_model_to_storage(input: SaveModelInput) -> SaveModelOutput:
    """Save model to MinIO/S3 storage."""
    import boto3
    from botocore.client import Config

    activity.logger.info(f"Saving model to storage: {input.model_version}")

    # MinIO configuration
    endpoint = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    bucket = os.getenv("MINIO_BUCKET", "ml-models")
    model_name = "anomaly-detector"

    # S3 client for MinIO
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )

    # Create bucket if not exists
    try:
        s3.head_bucket(Bucket=bucket)
    except:
        activity.logger.info(f"Creating bucket {bucket}")
        s3.create_bucket(Bucket=bucket)

    # Upload model - KServe expects: s3://bucket/model-name/model.joblib
    s3_key = f"{model_name}/model.joblib"
    activity.logger.info(f"Uploading to s3://{bucket}/{s3_key}")
    s3.upload_file(input.model_path, bucket, s3_key)

    # Also upload with version for tracking
    versioned_key = f"{model_name}/{input.model_version}/model.joblib"
    s3.upload_file(input.model_path, bucket, versioned_key)

    storage_uri = f"s3://{bucket}/{model_name}"
    activity.logger.info(f"Model uploaded to {storage_uri}")

    return SaveModelOutput(storage_uri=storage_uri)


@activity.defn
async def deploy_to_kserve(input: DeployModelInput) -> DeployModelOutput:
    """Deploy model to KServe InferenceService."""
    activity.logger.info(f"Deploying {input.model_name} to KServe...")

    # For local development, just return mock endpoint
    # In production, this would apply Kubernetes manifests

    endpoint = f"http://{input.model_name}.ml-serving.svc.cluster.local/v1/models/{input.model_name}:predict"

    # TODO: Implement actual KServe deployment
    # subprocess.run(['kubectl', 'apply', '-f', 'kserve/inference-service.yaml'])

    return DeployModelOutput(endpoint=endpoint, status="deployed")


# ============================================================
# Inference Activities
# ============================================================


@activity.defn
async def fetch_new_transactions(
    input: FetchTransactionsInput,
) -> FetchTransactionsOutput:
    """Fetch transactions that don't have predictions yet."""
    activity.logger.info(
        f"Fetching transactions (batch_size={input.batch_size}, offset={input.offset})..."
    )

    engine = create_engine(DB_URL)

    # Se lookback_hours = 0, busca TODAS as transações sem prediction
    date_filter = ""
    if input.lookback_hours > 0:
        date_filter = (
            f"AND t.transaction_date >= NOW() - INTERVAL '{input.lookback_hours} hours'"
        )

    query = f"""
    SELECT 
        t.transaction_id,
        t.absolute_amount,
        t.day_of_week::integer as day_of_week,
        t.transaction_month::integer as transaction_month,
        CASE WHEN t.is_weekend THEN 1 ELSE 0 END as is_weekend_int
    FROM silver.fct_transactions t
    LEFT JOIN ml_output.anomaly_predictions p ON t.transaction_id = p.transaction_id
    WHERE p.transaction_id IS NULL
      {date_filter}
    ORDER BY t.transaction_date DESC
    LIMIT {input.batch_size + 1}
    OFFSET {input.offset}
    """

    df = pd.read_sql(query, engine)

    has_more = len(df) > input.batch_size
    if has_more:
        df = df.head(input.batch_size)

    transaction_ids = df["transaction_id"].tolist()
    features = df[
        ["absolute_amount", "day_of_week", "transaction_month", "is_weekend_int"]
    ].values.tolist()

    activity.logger.info(f"Fetched {len(transaction_ids)} transactions")

    return FetchTransactionsOutput(
        transaction_ids=transaction_ids, features=features, has_more=has_more
    )


@activity.defn
async def call_kserve_inference(input: CallKServeInput) -> CallKServeOutput:
    """Call KServe for batch predictions."""
    activity.logger.info(f"Calling KServe for {len(input.features)} predictions...")

    # For local development, use the trained model directly
    # In production, this would call the KServe endpoint

    model_path = os.path.join(MODEL_DIR, "model.joblib")

    if os.path.exists(model_path):
        # Use local model
        model = joblib.load(model_path)
        X = np.array(input.features)

        raw_predictions = model.predict(X)
        scores = model.decision_function(X)

        # Normalize scores
        min_score = scores.min()
        max_score = scores.max()
        if max_score - min_score > 0:
            normalized_scores = 1 - (scores - min_score) / (max_score - min_score)
        else:
            normalized_scores = np.zeros_like(scores)

        predictions = []
        for i in range(len(X)):
            predictions.append(
                {
                    "is_anomaly": bool(raw_predictions[i] == -1),
                    "anomaly_score": float(normalized_scores[i]),
                }
            )

        model_version = "local"
    else:
        # Call KServe endpoint
        url = f"http://{KSERVE_HOST}:{KSERVE_PORT}/v1/models/{input.model_name}:predict"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json={"instances": input.features}, timeout=30.0
            )
            response.raise_for_status()
            result = response.json()
            predictions = result.get("predictions", [])
            model_version = result.get("model_version", "unknown")

    activity.logger.info(f"Got {len(predictions)} predictions")

    return CallKServeOutput(predictions=predictions, model_version=model_version)


@activity.defn
async def write_predictions(input: WritePredictionsInput) -> WritePredictionsOutput:
    """Write predictions to PostgreSQL."""
    activity.logger.info(f"Writing {len(input.predictions)} predictions to database...")

    engine = create_engine(DB_URL)

    # Prepare data for insert
    records = []
    anomalies_count = 0

    for tid, pred in zip(input.transaction_ids, input.predictions):
        is_anomaly = pred.get("is_anomaly", False)
        if is_anomaly:
            anomalies_count += 1

        records.append(
            {
                "transaction_id": tid,
                "anomaly_score": pred.get("anomaly_score", 0.0),
                "is_anomaly": is_anomaly,
                "model_version": input.model_version,
            }
        )

    # Insert predictions
    df = pd.DataFrame(records)
    df.to_sql(
        "anomaly_predictions",
        engine,
        schema="ml_output",
        if_exists="append",
        index=False,
        method="multi",
    )

    activity.logger.info(
        f"Wrote {len(records)} predictions, {anomalies_count} anomalies"
    )

    return WritePredictionsOutput(
        rows_written=len(records), anomalies_count=anomalies_count
    )


@activity.defn
async def trigger_dbt_run(input: TriggerDbtInput) -> TriggerDbtOutput:
    """Trigger dbt run for Gold layer refresh."""
    activity.logger.info(f"Triggering dbt run --select {input.select}...")

    dbt_dir = os.getenv("DBT_DIR", "/app/dbt")

    try:
        result = subprocess.run(
            ["dbt", "run", "--select", input.select],
            cwd=dbt_dir,
            capture_output=True,
            text=True,
            timeout=600,
        )

        success = result.returncode == 0
        output = result.stdout if success else result.stderr

        activity.logger.info(f"dbt run completed: success={success}")

        return TriggerDbtOutput(success=success, output=output)

    except subprocess.TimeoutExpired:
        return TriggerDbtOutput(success=False, output="dbt run timed out")
    except Exception as e:
        return TriggerDbtOutput(success=False, output=str(e))


# ============================================================
# Forecast Activities - Data Classes
# ============================================================


@dataclass
class ExtractMonthlySpendingInput:
    """Input for extracting monthly spending data."""

    min_months: int = 9  # Minimum months of data needed (seq_len + pred_len)


@dataclass
class ExtractMonthlySpendingOutput:
    """Output from monthly spending extraction."""

    data_path: str
    n_categories: int
    n_months: int
    category_mapping: Dict[str, int]


@dataclass
class PrepareSequencesInput:
    """Input for preparing training sequences."""

    data_path: str
    seq_len: int = 6
    pred_len: int = 3


@dataclass
class PrepareSequencesOutput:
    """Output from sequence preparation."""

    sequences_path: str
    n_sequences: int
    scaler_params: Dict[str, float]


@dataclass
class TrainTransformerInput:
    """Input for transformer training."""

    sequences_path: str
    category_mapping: Dict[str, int]
    scaler_params: Dict[str, float]
    d_model: int = 64
    num_layers: int = 2
    epochs: int = 100
    batch_size: int = 32
    learning_rate: float = 0.001


@dataclass
class TrainTransformerOutput:
    """Output from transformer training."""

    model_path: str
    model_version: str
    metrics: Dict[str, Any]


@dataclass
class SaveForecastModelInput:
    """Input for saving forecast model to storage."""

    model_path: str
    model_version: str


@dataclass
class SaveForecastModelOutput:
    """Output from model save."""

    storage_uri: str


@dataclass
class DeployForecastKServeInput:
    """Input for deploying forecast model to KServe."""

    model_name: str
    model_version: str
    storage_uri: str


@dataclass
class DeployForecastKServeOutput:
    """Output from KServe deployment."""

    endpoint: str
    status: str


@dataclass
class CallForecastInferenceInput:
    """Input for calling forecast inference."""

    model_name: str
    categories: List[str]
    history_months: int = 6


@dataclass
class CallForecastInferenceOutput:
    """Output from forecast inference."""

    predictions: List[Dict[str, Any]]
    model_version: str


@dataclass
class WriteForecastResultsInput:
    """Input for writing forecast results."""

    predictions: List[Dict[str, Any]]
    model_version: str


@dataclass
class WriteForecastResultsOutput:
    """Output from writing results."""

    rows_written: int


# ============================================================
# Forecast Activities
# ============================================================


@activity.defn
async def extract_monthly_spending(
    input: ExtractMonthlySpendingInput,
) -> ExtractMonthlySpendingOutput:
    """Extract monthly spending data from Gold layer."""
    activity.logger.info("Extracting monthly spending data...")

    engine = create_engine(DB_URL)

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
    activity.logger.info(f"Fetched {len(df)} records")

    # Create category mapping
    categories = df["categoria"].unique()
    category_mapping = {cat: idx for idx, cat in enumerate(categories)}
    df["categoria_id"] = df["categoria"].map(category_mapping)

    # Check if we have enough data
    months_per_cat = df.groupby("categoria")["ano_mes"].nunique()
    valid_categories = months_per_cat[months_per_cat >= input.min_months].index.tolist()

    if len(valid_categories) == 0:
        raise ValueError(f"No categories with {input.min_months}+ months of data")

    df = df[df["categoria"].isin(valid_categories)]

    # Save to temp file
    os.makedirs(MODEL_DIR, exist_ok=True)
    data_path = os.path.join(MODEL_DIR, "monthly_spending.parquet")
    df.to_parquet(data_path)

    activity.logger.info(
        f"Saved {len(df)} records for {len(valid_categories)} categories"
    )

    return ExtractMonthlySpendingOutput(
        data_path=data_path,
        n_categories=len(valid_categories),
        n_months=int(df["ano_mes"].nunique()),
        category_mapping=category_mapping,
    )


@activity.defn
async def prepare_sequences(input: PrepareSequencesInput) -> PrepareSequencesOutput:
    """Prepare training sequences from monthly data."""
    activity.logger.info("Preparing sequences...")

    df = pd.read_parquet(input.data_path)

    # Calculate trend
    df = df.sort_values(["categoria", "ano_mes"])
    df["tendencia"] = df.groupby("categoria")["valor_total"].diff().fillna(0)

    # Calculate scaler params
    scaler_params = {
        "mean": float(df["valor_total"].mean()),
        "std": float(df["valor_total"].std()) or 1.0,
        "trend_mean": float(df["tendencia"].mean()),
        "trend_std": float(df["tendencia"].std()) or 1.0,
    }

    # Normalize
    df["valor_normalizado"] = (
        df["valor_total"] - scaler_params["mean"]
    ) / scaler_params["std"]
    df["tendencia_normalizada"] = (
        df["tendencia"] - scaler_params["trend_mean"]
    ) / scaler_params["trend_std"]

    # Create sequences
    sequences = []
    for cat_id, group in df.groupby("categoria_id"):
        group = group.sort_values("ano_mes")

        if len(group) < input.seq_len + input.pred_len:
            continue

        values = group["valor_normalizado"].values
        trends = group["tendencia_normalizada"].values
        months = group["mes"].values.astype(int)

        for i in range(len(values) - input.seq_len - input.pred_len + 1):
            sequences.append(
                {
                    "x_numeric": np.stack(
                        [values[i : i + input.seq_len], trends[i : i + input.seq_len]],
                        axis=-1,
                    ).astype(np.float32),
                    "categories": np.full(input.seq_len, cat_id, dtype=np.int64),
                    "months": months[i : i + input.seq_len].astype(np.int64),
                    "y": values[
                        i + input.seq_len : i + input.seq_len + input.pred_len
                    ].astype(np.float32),
                }
            )

    # Save sequences
    sequences_path = os.path.join(MODEL_DIR, "forecast_sequences.pkl")
    import pickle

    with open(sequences_path, "wb") as f:
        pickle.dump(sequences, f)

    activity.logger.info(f"Created {len(sequences)} sequences")

    return PrepareSequencesOutput(
        sequences_path=sequences_path,
        n_sequences=len(sequences),
        scaler_params=scaler_params,
    )


@activity.defn
async def train_transformer(input: TrainTransformerInput) -> TrainTransformerOutput:
    """Train the Transformer model."""
    activity.logger.info("Training Transformer model...")

    from models.forecast_transformer import create_model
    import pickle

    # Load sequences
    with open(input.sequences_path, "rb") as f:
        sequences = pickle.load(f)

    if len(sequences) < 10:
        raise ValueError(f"Not enough sequences: {len(sequences)}")

    # Create dataset
    class SequenceDataset(torch.utils.data.Dataset):
        def __init__(self, seqs):
            self.sequences = seqs

        def __len__(self):
            return len(self.sequences)

        def __getitem__(self, idx):
            seq = self.sequences[idx]
            return {
                "x_numeric": torch.tensor(seq["x_numeric"]),
                "categories": torch.tensor(seq["categories"]),
                "months": torch.tensor(seq["months"]),
                "y": torch.tensor(seq["y"]),
            }

    from torch.utils.data import DataLoader, random_split

    dataset = SequenceDataset(sequences)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_dataset, batch_size=input.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=input.batch_size)

    # Create model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    n_categories = len(input.category_mapping)

    model = create_model(
        n_categories=n_categories,
        seq_len=6,
        pred_len=3,
        d_model=input.d_model,
        num_layers=input.num_layers,
    ).to(device)

    # Training
    criterion = torch.nn.MSELoss()
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=input.learning_rate, weight_decay=0.01
    )

    best_val_loss = float("inf")
    patience = 10
    patience_counter = 0

    for epoch in range(input.epochs):
        # Train
        model.train()
        train_losses = []
        for batch in train_loader:
            x = batch["x_numeric"].to(device)
            cats = batch["categories"].to(device)
            months = batch["months"].to(device)
            y = batch["y"].to(device)

            optimizer.zero_grad()
            preds, _ = model(x, cats, months)
            loss = criterion(preds, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_losses.append(loss.item())

        # Validate
        model.eval()
        val_losses = []
        with torch.no_grad():
            for batch in val_loader:
                x = batch["x_numeric"].to(device)
                cats = batch["categories"].to(device)
                months = batch["months"].to(device)
                y = batch["y"].to(device)
                preds, _ = model(x, cats, months)
                loss = criterion(preds, y)
                val_losses.append(loss.item())

        val_loss = np.mean(val_losses)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best
            best_state = model.state_dict().copy()
        else:
            patience_counter += 1
            if patience_counter >= patience:
                activity.logger.info(f"Early stopping at epoch {epoch + 1}")
                break

        if (epoch + 1) % 10 == 0:
            activity.logger.info(
                f"Epoch {epoch + 1}: train_loss={np.mean(train_losses):.4f}, val_loss={val_loss:.4f}"
            )

    # Load best model
    model.load_state_dict(best_state)

    # Save model
    model_version = datetime.now().strftime("v%Y%m%d_%H%M%S")
    model_path = os.path.join(MODEL_DIR, f"forecast_transformer_{model_version}.pt")

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "model_config": {
                "n_categories": n_categories,
                "seq_len": 6,
                "pred_len": 3,
                "d_model": input.d_model,
                "num_layers": input.num_layers,
            },
            "category_mapping": input.category_mapping,
            "scaler_params": input.scaler_params,
        },
        model_path,
    )

    # Also save as latest
    latest_path = os.path.join(MODEL_DIR, "forecast_transformer_latest.pt")
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "model_config": {
                "n_categories": n_categories,
                "seq_len": 6,
                "pred_len": 3,
                "d_model": input.d_model,
                "num_layers": input.num_layers,
            },
            "category_mapping": input.category_mapping,
            "scaler_params": input.scaler_params,
        },
        latest_path,
    )

    activity.logger.info(f"Model saved: {model_version}")

    return TrainTransformerOutput(
        model_path=model_path,
        model_version=model_version,
        metrics={
            "val_loss": float(best_val_loss),
            "n_sequences": len(sequences),
            "n_categories": n_categories,
        },
    )


@activity.defn
async def save_forecast_model_to_storage(
    input: SaveForecastModelInput,
) -> SaveForecastModelOutput:
    """Save forecast model to MinIO/S3 storage."""
    import boto3
    from botocore.client import Config

    activity.logger.info(f"Saving forecast model to storage: {input.model_version}")

    endpoint = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    bucket = os.getenv("MINIO_BUCKET", "ml-models")
    model_name = "spending-forecast"

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )

    try:
        s3.head_bucket(Bucket=bucket)
    except:
        activity.logger.info(f"Creating bucket {bucket}")
        s3.create_bucket(Bucket=bucket)

    # Upload model
    s3_key = f"{model_name}/model.pt"
    s3.upload_file(input.model_path, bucket, s3_key)

    # Version tracking
    versioned_key = f"{model_name}/{input.model_version}/model.pt"
    s3.upload_file(input.model_path, bucket, versioned_key)

    storage_uri = f"s3://{bucket}/{model_name}"
    activity.logger.info(f"Model uploaded to {storage_uri}")

    return SaveForecastModelOutput(storage_uri=storage_uri)


@activity.defn
async def deploy_forecast_kserve(
    input: DeployForecastKServeInput,
) -> DeployForecastKServeOutput:
    """Deploy forecast model to KServe."""
    activity.logger.info(f"Deploying {input.model_name} to KServe...")

    endpoint = f"http://{input.model_name}.ml-serving.svc.cluster.local/v1/models/{input.model_name}:predict"

    # Check if kubectl is available
    try:
        # Get project root
        project_root = Path(__file__).parent.parent.parent
        manifest_path = project_root / "kserve" / "forecast-inference-service.yaml"
        
        if manifest_path.exists():
            activity.logger.info(f"Applying KServe manifest: {manifest_path}")
            result = subprocess.run(
                ["kubectl", "apply", "-f", str(manifest_path)],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                activity.logger.info(f"KServe InferenceService applied successfully")
                return DeployForecastKServeOutput(endpoint=endpoint, status="deployed")
            else:
                activity.logger.warning(f"kubectl apply failed: {result.stderr}")
                return DeployForecastKServeOutput(endpoint=endpoint, status="failed")
        else:
            activity.logger.warning(f"Manifest not found: {manifest_path}")
            return DeployForecastKServeOutput(endpoint=endpoint, status="manifest_missing")
            
    except FileNotFoundError:
        activity.logger.warning("kubectl not found, skipping KServe deployment")
        return DeployForecastKServeOutput(endpoint=endpoint, status="kubectl_not_found")
    except subprocess.TimeoutExpired:
        activity.logger.warning("kubectl apply timed out")
        return DeployForecastKServeOutput(endpoint=endpoint, status="timeout")
    except Exception as e:
        activity.logger.warning(f"KServe deployment error: {e}")
        return DeployForecastKServeOutput(endpoint=endpoint, status="error")


@activity.defn
async def call_forecast_inference(
    input: CallForecastInferenceInput,
) -> CallForecastInferenceOutput:
    """
    Call forecast model for predictions using the new inference module.
    
    Supports both V1 and V2 model architectures with per-category normalization.
    """
    activity.logger.info(
        f"Generating forecasts for {len(input.categories)} categories..."
    )

    model_path = os.path.join(MODEL_DIR, "forecast_transformer_latest.pt")

    if os.path.exists(model_path):
        # Use new inference module
        from spending_forecast.inference import BatchInference, BatchInferenceConfig
        
        config = BatchInferenceConfig(
            db_url=DB_URL,
            model_path=model_path,
            history_months=input.history_months,
            categories=list(input.categories),
            write_to_db=False,  # Don't write here, workflow handles it
        )
        
        batch = BatchInference(config)
        result = batch.run(categories=list(input.categories), write_to_db=False)
        
        predictions = result.predictions
        model_version = f"{result.model_arch}_{result.model_version}"
        
        activity.logger.info(
            f"Model: {result.model_arch} | Categories: {result.categories_processed} | "
            f"Predictions: {len(predictions)} | Time: {result.execution_time_seconds:.2f}s"
        )
        
        if result.errors:
            for error in result.errors:
                activity.logger.warning(f"Inference error: {error}")
    else:
        # Call KServe endpoint
        url = f"http://{KSERVE_HOST}:{KSERVE_PORT}/v1/models/{input.model_name}:predict"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={
                    "categories": input.categories,
                    "history_months": input.history_months,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()
            predictions = result.get("predictions", [])
            model_version = result.get("model_version", "unknown")

    activity.logger.info(f"Generated {len(predictions)} predictions")

    return CallForecastInferenceOutput(
        predictions=predictions, model_version=model_version
    )


@activity.defn
async def write_forecast_results(
    input: WriteForecastResultsInput,
) -> WriteForecastResultsOutput:
    """Write forecast results to PostgreSQL."""
    activity.logger.info(f"Writing {len(input.predictions)} forecasts...")

    engine = create_engine(DB_URL)

    # Create schema if not exists
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS ml_output"))
        conn.execute(
            text("""
            CREATE TABLE IF NOT EXISTS ml_output.spending_forecasts (
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

    # Prepare records
    records = []
    for pred in input.predictions:
        records.append(
            {
                "categoria": pred["categoria"],
                "mes_referencia": pred["mes_referencia"],
                "valor_previsto": pred["valor_previsto"],
                "intervalo_inferior": pred["intervalo_inferior"],
                "intervalo_superior": pred["intervalo_superior"],
                "modelo_versao": input.model_version,
            }
        )

    # Insert
    df = pd.DataFrame(records)
    df.to_sql(
        "spending_forecasts",
        engine,
        schema="ml_output",
        if_exists="append",
        index=False,
        method="multi",
    )

    activity.logger.info(f"Wrote {len(records)} forecasts")

    return WriteForecastResultsOutput(rows_written=len(records))


# ============================================================
# Ingest Activities - Data Classes
# ============================================================


@dataclass
class ParseCSVInput:
    """Input for parsing CSV activity"""
    file_path: str
    datasource_id: str
    parser_id: str


@dataclass
class ParseCSVOutput:
    """Output from parsing CSV activity"""
    success: bool
    transactions: List[Dict[str, Any]]
    total_rows: int
    parsed_rows: int
    error_rows: int
    errors: List[str]
    periodo_inicio: Optional[str]
    periodo_fim: Optional[str]


@dataclass
class InsertTransactionsInput:
    """Input for inserting transactions activity"""
    transactions: List[Dict[str, Any]]
    upload_id: int


@dataclass
class InsertTransactionsOutput:
    """Output from inserting transactions activity"""
    inserted_count: int
    duplicated_count: int


@dataclass
class RunDbtInput:
    """Input for running dbt activity"""
    models: List[str]


@dataclass
class RunDbtOutput:
    """Output from running dbt activity"""
    success: bool
    output: str


@dataclass
class UpdateUploadStatusInput:
    """Input for updating upload status activity"""
    upload_id: int
    status: str
    error: Optional[str] = None
    total_rows: Optional[int] = None
    inserted_rows: Optional[int] = None
    duplicated_rows: Optional[int] = None
    error_rows: Optional[int] = None
    periodo_inicio: Optional[str] = None
    periodo_fim: Optional[str] = None


# ============================================================
# Ingest Activities - Implementations
# ============================================================


@activity.defn
async def parse_csv_activity(input: ParseCSVInput) -> ParseCSVOutput:
    """
    Parse a CSV file using the appropriate parser.
    
    This activity reads the CSV, validates it, and transforms
    the data into a unified format.
    """
    activity.logger.info(f"Parsing CSV: {input.file_path} with parser {input.parser_id}")
    
    # Add backend to path for parsers
    backend_path = Path(__file__).parent.parent.parent / "backend"
    sys.path.insert(0, str(backend_path))
    
    from app.parsers import get_parser
    
    # Get parser
    parser = get_parser(input.parser_id, input.datasource_id)
    if not parser:
        return ParseCSVOutput(
            success=False,
            transactions=[],
            total_rows=0,
            parsed_rows=0,
            error_rows=0,
            errors=[f"Parser não encontrado: {input.parser_id}"],
            periodo_inicio=None,
            periodo_fim=None,
        )
    
    try:
        # Read and parse CSV
        df = parser.read_csv(input.file_path)
        result = parser.parse(df)
        
        # Convert transactions to dicts
        transactions = [t.to_dict() for t in result.transactions]
        
        activity.logger.info(
            f"Parsed {result.parsed_rows}/{result.total_rows} rows, "
            f"{result.error_rows} errors"
        )
        
        return ParseCSVOutput(
            success=result.success,
            transactions=transactions,
            total_rows=result.total_rows,
            parsed_rows=result.parsed_rows,
            error_rows=result.error_rows,
            errors=result.errors,
            periodo_inicio=result.periodo_inicio.isoformat() if result.periodo_inicio else None,
            periodo_fim=result.periodo_fim.isoformat() if result.periodo_fim else None,
        )
        
    except Exception as e:
        activity.logger.error(f"Error parsing CSV: {e}")
        return ParseCSVOutput(
            success=False,
            transactions=[],
            total_rows=0,
            parsed_rows=0,
            error_rows=0,
            errors=[str(e)],
            periodo_inicio=None,
            periodo_fim=None,
        )


@activity.defn
async def insert_transactions_activity(input: InsertTransactionsInput) -> InsertTransactionsOutput:
    """
    Insert transactions with deduplication.
    
    Uses ON CONFLICT DO NOTHING to skip duplicates.
    """
    activity.logger.info(f"Inserting {len(input.transactions)} transactions...")
    
    engine = create_engine(DB_URL)
    
    inserted = 0
    duplicated = 0
    
    with engine.connect() as conn:
        for transaction in input.transactions:
            try:
                result = conn.execute(
                    text("""
                        INSERT INTO landing.raw_transactions 
                        (datasource_id, transaction_hash, data_transacao, valor, descricao, dados_raw, upload_id)
                        VALUES (:datasource_id, :transaction_hash, :data_transacao, :valor, :descricao, :dados_raw::jsonb, :upload_id)
                        ON CONFLICT (transaction_hash) DO NOTHING
                        RETURNING id
                    """),
                    {
                        "datasource_id": transaction["datasource_id"],
                        "transaction_hash": transaction["transaction_hash"],
                        "data_transacao": transaction["data_transacao"],
                        "valor": transaction["valor"],
                        "descricao": transaction["descricao"],
                        "dados_raw": json.dumps(transaction["dados_raw"]),
                        "upload_id": input.upload_id,
                    }
                )
                
                if result.fetchone():
                    inserted += 1
                else:
                    duplicated += 1
                    
            except Exception as e:
                activity.logger.warning(f"Error inserting transaction: {e}")
                duplicated += 1
        
        conn.commit()
    
    activity.logger.info(f"Inserted {inserted}, duplicated {duplicated}")
    
    return InsertTransactionsOutput(
        inserted_count=inserted,
        duplicated_count=duplicated,
    )


@activity.defn
async def run_dbt_activity(input: RunDbtInput) -> RunDbtOutput:
    """
    Run dbt to refresh data models.
    
    Executes dbt run for the specified models.
    """
    activity.logger.info(f"Running dbt for models: {input.models}")
    
    dbt_dir = Path(__file__).parent.parent.parent / "dbt"
    
    # Build dbt command
    models_arg = " ".join(f"+{m}" for m in input.models)
    cmd = f"cd {dbt_dir} && dbt run --select {models_arg}"
    
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
        )
        
        output = result.stdout + result.stderr
        success = result.returncode == 0
        
        if success:
            activity.logger.info("dbt run completed successfully")
        else:
            activity.logger.error(f"dbt run failed: {output}")
        
        return RunDbtOutput(
            success=success,
            output=output,
        )
        
    except subprocess.TimeoutExpired:
        activity.logger.error("dbt run timed out")
        return RunDbtOutput(
            success=False,
            output="dbt run timed out after 10 minutes",
        )
    except Exception as e:
        activity.logger.error(f"dbt run error: {e}")
        return RunDbtOutput(
            success=False,
            output=str(e),
        )


@activity.defn
async def update_upload_status_activity(input: UpdateUploadStatusInput) -> None:
    """
    Update the status of an upload record.
    
    Used by the workflow to track progress.
    """
    activity.logger.info(f"Updating upload {input.upload_id} status to {input.status}")
    
    engine = create_engine(DB_URL)
    
    # Build update query dynamically
    updates = ["status = :status"]
    params = {"upload_id": input.upload_id, "status": input.status}
    
    if input.status == "processing":
        updates.append("started_at = NOW()")
    elif input.status in ("completed", "failed"):
        updates.append("completed_at = NOW()")
    
    if input.error is not None:
        updates.append("erro = :error")
        params["error"] = input.error
    
    if input.total_rows is not None:
        updates.append("total_linhas = :total_rows")
        params["total_rows"] = input.total_rows
    
    if input.inserted_rows is not None:
        updates.append("linhas_inseridas = :inserted_rows")
        params["inserted_rows"] = input.inserted_rows
    
    if input.duplicated_rows is not None:
        updates.append("linhas_duplicadas = :duplicated_rows")
        params["duplicated_rows"] = input.duplicated_rows
    
    if input.error_rows is not None:
        updates.append("linhas_erro = :error_rows")
        params["error_rows"] = input.error_rows
    
    if input.periodo_inicio is not None:
        updates.append("periodo_inicio = :periodo_inicio")
        params["periodo_inicio"] = input.periodo_inicio
    
    if input.periodo_fim is not None:
        updates.append("periodo_fim = :periodo_fim")
        params["periodo_fim"] = input.periodo_fim
    
    query = f"UPDATE ingestion.uploads SET {', '.join(updates)} WHERE id = :upload_id"
    
    with engine.connect() as conn:
        conn.execute(text(query), params)
        conn.commit()
    
    activity.logger.info(f"Upload {input.upload_id} updated")
