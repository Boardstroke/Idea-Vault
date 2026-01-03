# spending_forecast/inference/loader.py
"""
Model loader for Spending Forecast models.

Supports loading V1 and V2 models from:
- Local filesystem
- MLflow Model Registry
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

import torch

from spending_forecast.models.factory import create_model

logger = logging.getLogger(__name__)


@dataclass
class ModelBundle:
    """Container for loaded model and its metadata."""

    model: torch.nn.Module
    model_arch: str
    model_version: str
    category_mapping: Dict[str, int]
    reverse_category_mapping: Dict[int, str]
    scaler_params: Dict[str, Dict[str, float]]
    config: Dict[str, Any]
    device: torch.device

    def to(self, device: torch.device) -> "ModelBundle":
        """Move model to device."""
        self.model = self.model.to(device)
        self.device = device
        return self


def load_model(
    model_path: Optional[str] = None,
    model_dir: Optional[str] = None,
    device: Optional[torch.device] = None,
    use_mlflow: bool = False,
    mlflow_model_name: str = "spending-forecast-transformer",
    mlflow_stage: str = "Production",
) -> ModelBundle:
    """
    Load a trained Spending Forecast model.

    Args:
        model_path: Direct path to model checkpoint (.pt file)
        model_dir: Directory containing model files (uses latest)
        device: Device to load model on (default: auto-detect)
        use_mlflow: If True, load from MLflow Model Registry
        mlflow_model_name: Name in MLflow registry
        mlflow_stage: Stage to load (Production, Staging, etc.)

    Returns:
        ModelBundle with model and metadata
    """
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    logger.info(f"Loading model on device: {device}")

    # Determine checkpoint path
    if use_mlflow:
        checkpoint_path = _load_from_mlflow(mlflow_model_name, mlflow_stage)
    elif model_path:
        checkpoint_path = Path(model_path)
    elif model_dir:
        checkpoint_path = Path(model_dir) / "forecast_transformer_latest.pt"
    else:
        raise ValueError("Must provide model_path, model_dir, or use_mlflow=True")

    if not checkpoint_path.exists():
        raise FileNotFoundError(f"Model not found: {checkpoint_path}")

    logger.info(f"Loading checkpoint: {checkpoint_path}")

    # Load checkpoint
    checkpoint = torch.load(checkpoint_path, map_location=device)

    # Extract metadata
    config = checkpoint.get("model_config", {})
    category_mapping = checkpoint.get("category_mapping", {})
    scaler_params = checkpoint.get("scaler_params", {})
    model_arch = config.get("model_arch", "v1")

    # Create reverse mapping
    reverse_category_mapping = {v: k for k, v in category_mapping.items()}

    # Determine model version
    model_version = checkpoint.get("model_version", checkpoint_path.stem)

    logger.info(f"Model architecture: {model_arch}")
    logger.info(f"Model version: {model_version}")
    logger.info(f"Categories: {len(category_mapping)}")

    # Create model
    model = create_model(
        model_arch=model_arch,
        n_categories=config.get("n_categories", len(category_mapping)),
        seq_len=config.get("seq_len", 6),
        pred_len=config.get("pred_len", 3),
        d_model=config.get("d_model", 64),
        nhead=config.get("nhead", 4),
        num_layers=config.get("num_layers", 2),
        dim_feedforward=config.get("dim_feedforward", 128),
        dropout=config.get("dropout", 0.1),
        pooling_type=config.get("pooling_type", "attention"),
    )

    # Load weights
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()

    logger.info("Model loaded successfully!")

    return ModelBundle(
        model=model,
        model_arch=model_arch,
        model_version=model_version,
        category_mapping=category_mapping,
        reverse_category_mapping=reverse_category_mapping,
        scaler_params=scaler_params,
        config=config,
        device=device,
    )


def _load_from_mlflow(model_name: str, stage: str) -> Path:
    """Load model path from MLflow registry."""
    try:
        import mlflow

        logger.info(f"Loading from MLflow: {model_name}@{stage}")

        # Get model URI
        model_uri = f"models:/{model_name}/{stage}"

        # Download artifacts
        local_path = mlflow.artifacts.download_artifacts(model_uri)

        # Find .pt file
        local_path = Path(local_path)
        pt_files = list(local_path.glob("*.pt"))

        if pt_files:
            return pt_files[0]

        # Check for nested structure
        pt_files = list(local_path.glob("**/*.pt"))
        if pt_files:
            return pt_files[0]

        raise FileNotFoundError(f"No .pt file found in MLflow artifacts: {local_path}")

    except ImportError:
        raise ImportError("mlflow is required for loading from registry")
    except Exception as e:
        raise RuntimeError(f"Failed to load from MLflow: {e}")


def load_model_metadata(model_path: str) -> Dict[str, Any]:
    """Load only metadata from a model checkpoint (without loading weights)."""
    checkpoint = torch.load(model_path, map_location="cpu")

    return {
        "model_config": checkpoint.get("model_config", {}),
        "category_mapping": checkpoint.get("category_mapping", {}),
        "scaler_params": checkpoint.get("scaler_params", {}),
        "model_arch": checkpoint.get("model_config", {}).get("model_arch", "v1"),
    }

