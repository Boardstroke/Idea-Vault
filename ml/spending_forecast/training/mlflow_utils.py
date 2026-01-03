"""MLflow integration utilities."""

import logging
from pathlib import Path
from typing import Dict, Any, Optional

import torch.nn as nn

logger = logging.getLogger(__name__)


def setup_mlflow(
    tracking_uri: str,
    experiment_name: str,
) -> bool:
    """
    Setup MLflow tracking.

    Returns:
        True if MLflow is available and configured
    """
    try:
        import mlflow

        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment(experiment_name)
        logger.info(f"MLflow configured: {tracking_uri} / {experiment_name}")
        return True
    except Exception as e:
        logger.warning(f"Could not configure MLflow: {e}")
        return False


def log_training_metrics(
    train_loss: float,
    val_loss: float,
    val_mae_norm: float,
    learning_rate: float,
    epoch: int,
):
    """Log training metrics to MLflow."""
    try:
        import mlflow

        mlflow.log_metrics(
            {
                "train_loss": train_loss,
                "val_loss": val_loss,
                "val_mae_norm": val_mae_norm,
                "learning_rate": learning_rate,
            },
            step=epoch,
        )
    except Exception:
        pass


def log_model_to_mlflow(
    model: nn.Module,
    model_path: Path,
    metadata_path: Optional[Path] = None,
    registered_model_name: str = "spending-forecast-transformer",
):
    """
    Log trained model to MLflow.

    Args:
        model: Trained PyTorch model
        model_path: Path to saved checkpoint
        metadata_path: Optional path to metadata JSON
        registered_model_name: Name for MLflow model registry
    """
    try:
        import mlflow
        import mlflow.pytorch

        # Log PyTorch model
        mlflow.pytorch.log_model(
            model,
            "model",
            registered_model_name=registered_model_name,
        )

        # Log checkpoint artifact
        if model_path.exists():
            mlflow.log_artifact(str(model_path))

        # Log metadata
        if metadata_path and metadata_path.exists():
            mlflow.log_artifact(str(metadata_path))

        logger.info(f"Model logged to MLflow: {registered_model_name}")

    except Exception as e:
        logger.warning(f"Could not log model to MLflow: {e}")


def log_evaluation_metrics(
    metrics: Dict[str, float],
    prefix: str = "",
):
    """
    Log evaluation metrics to MLflow.

    These are the final metrics for model comparison:
    - mae_brl, rmse_brl, wape_brl (in BRL scale)
    - horizon metrics
    """
    try:
        import mlflow

        to_log = {}
        for k, v in metrics.items():
            if isinstance(v, (int, float)):
                key = f"{prefix}{k}" if prefix else k
                to_log[key] = float(v)

        mlflow.log_metrics(to_log)

    except Exception as e:
        logger.warning(f"Could not log evaluation metrics: {e}")
