from typing import Any

from .forecast_v1 import SpendingTransformerV1
from .forecast_v2 import ForecastTransformerV2


def create_model(
    model_arch: str = "v1",  # v1 | v2
    **kwargs: Any,
):
    """
    Factory único.

    kwargs esperados (comuns):
      - n_categories
      - seq_len
      - pred_len
      - d_model
      - num_layers
      - ...

    V1 extras:
      - pooling_type

    V2 extras:
      - use_learnable_pe
      - use_causal_history
    """
    model_arch = (model_arch or "v1").lower()

    if model_arch == "v1":
        # aceita pooling_type
        return SpendingTransformerV1(
            d_model=kwargs.get("d_model", 64),
            nhead=kwargs.get("nhead", 4),
            num_layers=kwargs.get("num_layers", 2),
            dim_feedforward=kwargs.get("dim_feedforward", 128),
            dropout=kwargs.get("dropout", 0.1),
            seq_len=kwargs.get("seq_len", 6),
            pred_len=kwargs.get("pred_len", 3),
            n_categories=kwargs["n_categories"],
            pooling_type=kwargs.get("pooling_type", "attention"),
        )

    if model_arch == "v2":
        # ignora pooling_type
        return ForecastTransformerV2(
            d_model=kwargs.get("d_model", 64),
            nhead=kwargs.get("nhead", 4),
            num_layers=kwargs.get("num_layers", 2),
            dim_feedforward=kwargs.get("dim_feedforward", 128),
            dropout=kwargs.get("dropout", 0.1),
            seq_len=kwargs.get("seq_len", 6),
            pred_len=kwargs.get("pred_len", 3),
            n_categories=kwargs["n_categories"],
            use_learnable_pe=kwargs.get("use_learnable_pe", True),
            use_causal_history=kwargs.get("use_causal_history", False),
        )

    raise ValueError(f"Unknown model_arch: {model_arch}. Use 'v1' or 'v2'.")
