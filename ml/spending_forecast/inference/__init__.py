# spending_forecast/inference/__init__.py
"""
Inference module for Spending Forecast models.

Provides:
- Model loading (V1/V2)
- Single and batch prediction
- Temporal integration
"""

from .loader import load_model, ModelBundle
from .predictor import ForecastPredictor
from .batch import BatchInference, BatchInferenceConfig, BatchInferenceResult

__all__ = [
    "load_model",
    "ModelBundle",
    "ForecastPredictor",
    "BatchInference",
    "BatchInferenceConfig",
    "BatchInferenceResult",
]
