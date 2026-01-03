"""
Spending Forecast Model Package

Structure:
- config/    : Default parameters and constants
- data/      : Data fetching, preparation, and datasets
- models/    : V1 (pooling) and V2 (forecast tokens) architectures
- eval/      : Metrics and evaluation (transformer + baselines)
- training/  : Training loops, losses, checkpointing
- inference/ : Model loading and batch inference (NEW)
- scripts/   : CLI entry points
- utils/     : Helpers (seeding, device, logging)
"""

__version__ = "0.3.0"

# Main exports for easy access
from spending_forecast.inference import (
    load_model,
    ModelBundle,
    ForecastPredictor,
    BatchInference,
)

__all__ = [
    "load_model",
    "ModelBundle",
    "ForecastPredictor",
    "BatchInference",
]

