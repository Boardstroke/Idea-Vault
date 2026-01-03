# spending_forecast/inference/predictor.py
"""
Predictor class for Spending Forecast models.

Provides high-level API for making predictions with proper
normalization/denormalization and uncertainty estimation.
"""

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import torch

from spending_forecast.data.scaling import inverse_zscore
from .loader import ModelBundle

logger = logging.getLogger(__name__)


@dataclass
class ForecastResult:
    """Single forecast result for a category."""

    categoria: str
    forecast: List[float]  # pred_len values
    lower_bound: List[float]  # pred_len values
    upper_bound: List[float]  # pred_len values
    confidence_level: float = 0.90  # Default 90% CI

    def to_dict(self) -> Dict:
        return {
            "categoria": self.categoria,
            "forecast": self.forecast,
            "lower_bound": self.lower_bound,
            "upper_bound": self.upper_bound,
            "confidence_level": self.confidence_level,
        }


@dataclass
class MonthlyForecast:
    """Forecast for a specific month."""

    categoria: str
    mes_referencia: str  # YYYY-MM-DD
    valor_previsto: float
    intervalo_inferior: float
    intervalo_superior: float
    horizonte: int  # 1, 2, 3...

    def to_dict(self) -> Dict:
        return {
            "categoria": self.categoria,
            "mes_referencia": self.mes_referencia,
            "valor_previsto": self.valor_previsto,
            "intervalo_inferior": self.intervalo_inferior,
            "intervalo_superior": self.intervalo_superior,
            "horizonte": self.horizonte,
        }


class ForecastPredictor:
    """
    High-level predictor for Spending Forecast models.

    Handles:
    - Input normalization (per-category z-score)
    - Batch inference
    - Output denormalization
    - Uncertainty intervals
    """

    def __init__(
        self,
        bundle: ModelBundle,
        z_score: float = 1.64,  # 90% CI
    ):
        """
        Initialize predictor.

        Args:
            bundle: Loaded ModelBundle from loader
            z_score: Z-score for confidence interval (1.64 = 90%, 1.96 = 95%)
        """
        self.bundle = bundle
        self.model = bundle.model
        self.device = bundle.device
        self.z_score = z_score

        self.seq_len = bundle.config.get("seq_len", 6)
        self.pred_len = bundle.config.get("pred_len", 3)

        logger.info(
            f"ForecastPredictor initialized: seq_len={self.seq_len}, pred_len={self.pred_len}"
        )

    def _normalize_values(
        self, values: np.ndarray, categoria: str
    ) -> Tuple[np.ndarray, float, float]:
        """
        Normalize values using per-category z-score.

        Returns: (normalized_values, mean, std)
        """
        params = self.bundle.scaler_params.get(categoria, {})

        if params:
            mean = params.get("mean", 0.0)
            std = params.get("std", 1.0)
        else:
            # Fallback: use global stats or calculate from values
            mean = float(np.mean(values))
            std = float(np.std(values)) if np.std(values) > 0 else 1.0
            logger.warning(
                f"No scaler params for '{categoria}', using calculated: mean={mean:.2f}, std={std:.2f}"
            )

        normalized = (values - mean) / std
        return normalized.astype(np.float32), mean, std

    def _denormalize_values(
        self, values: np.ndarray, mean: float, std: float
    ) -> np.ndarray:
        """Denormalize values back to original scale."""
        return inverse_zscore(values, mean, std)

    def _prepare_input(
        self,
        history: np.ndarray,
        categoria: str,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, float, float]:
        """
        Prepare model input from raw history values.

        Args:
            history: Array of shape (seq_len,) with historical values
            categoria: Category name

        Returns:
            (x_numeric, categories, months, mean, std)
        """
        if len(history) < self.seq_len:
            raise ValueError(
                f"History too short: {len(history)} < {self.seq_len} required"
            )

        # Take last seq_len values
        history = history[-self.seq_len :]

        # Normalize
        values_norm, mean, std = self._normalize_values(history, categoria)

        # Calculate trends (normalized)
        trends = np.diff(values_norm, prepend=values_norm[0])

        # Get category ID
        cat_id = self.bundle.category_mapping.get(categoria, 0)
        if categoria not in self.bundle.category_mapping:
            logger.warning(
                f"Unknown category '{categoria}', using ID 0. "
                f"Known categories: {list(self.bundle.category_mapping.keys())}"
            )

        # Create tensors
        x_numeric = torch.tensor(
            np.stack([values_norm, trends], axis=-1)[np.newaxis],
            dtype=torch.float32,
            device=self.device,
        )

        categories = torch.tensor(
            np.full((1, self.seq_len), cat_id),
            dtype=torch.int64,
            device=self.device,
        )

        # Use sequential months 1-6 (simplified)
        months = torch.tensor(
            np.arange(1, self.seq_len + 1)[np.newaxis],
            dtype=torch.int64,
            device=self.device,
        )

        return x_numeric, categories, months, mean, std

    @torch.no_grad()
    def predict_single(
        self,
        categoria: str,
        history: np.ndarray,
        return_uncertainty: bool = True,
    ) -> ForecastResult:
        """
        Make forecast for a single category.

        Args:
            categoria: Category name
            history: Array of historical values (at least seq_len)
            return_uncertainty: Whether to compute uncertainty bounds

        Returns:
            ForecastResult with predictions and bounds
        """
        self.model.eval()

        # Prepare input
        x, cats, months, mean, std = self._prepare_input(history, categoria)

        # Forward pass
        mu, var = self.model(x, cats, months, return_uncertainty=return_uncertainty)

        # Denormalize predictions
        mu_np = mu.cpu().numpy()[0]  # (pred_len,)
        forecast = self._denormalize_values(mu_np, mean, std)

        # Compute bounds
        if return_uncertainty and var is not None:
            var = torch.clamp(var, min=1e-6)
            sigma_np = torch.sqrt(var).cpu().numpy()[0]
            sigma_denorm = sigma_np * std  # Scale uncertainty

            lower = np.maximum(0, forecast - self.z_score * sigma_denorm)
            upper = forecast + self.z_score * sigma_denorm
        else:
            # Default: ±10% bounds
            lower = np.maximum(0, forecast * 0.9)
            upper = forecast * 1.1

        return ForecastResult(
            categoria=categoria,
            forecast=np.maximum(0, forecast).tolist(),
            lower_bound=lower.tolist(),
            upper_bound=upper.tolist(),
            confidence_level=0.90 if self.z_score == 1.64 else 0.95,
        )

    @torch.no_grad()
    def predict_batch(
        self,
        data: List[Dict],
        return_uncertainty: bool = True,
    ) -> List[ForecastResult]:
        """
        Make forecasts for multiple categories.

        Args:
            data: List of dicts with 'categoria' and 'history' keys
            return_uncertainty: Whether to compute uncertainty bounds

        Returns:
            List of ForecastResult
        """
        results = []

        for item in data:
            categoria = item.get("categoria", "Unknown")
            history = np.array(item.get("history", []))

            try:
                result = self.predict_single(
                    categoria=categoria,
                    history=history,
                    return_uncertainty=return_uncertainty,
                )
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to predict for {categoria}: {e}")
                continue

        return results

    def predict_with_dates(
        self,
        categoria: str,
        history: np.ndarray,
        last_date: str,  # YYYY-MM-DD
        return_uncertainty: bool = True,
    ) -> List[MonthlyForecast]:
        """
        Make forecast with future month dates.

        Args:
            categoria: Category name
            history: Historical values
            last_date: Last date in history (YYYY-MM-DD)
            return_uncertainty: Whether to compute bounds

        Returns:
            List of MonthlyForecast with dates
        """
        result = self.predict_single(categoria, history, return_uncertainty)

        # Generate future dates
        last_date_pd = pd.to_datetime(last_date)
        future_dates = pd.date_range(last_date_pd, periods=self.pred_len + 1, freq="MS")[
            1:
        ]

        monthly_forecasts = []
        for i, (pred, lower, upper, date) in enumerate(
            zip(
                result.forecast,
                result.lower_bound,
                result.upper_bound,
                future_dates,
            )
        ):
            monthly_forecasts.append(
                MonthlyForecast(
                    categoria=categoria,
                    mes_referencia=date.strftime("%Y-%m-%d"),
                    valor_previsto=pred,
                    intervalo_inferior=lower,
                    intervalo_superior=upper,
                    horizonte=i + 1,
                )
            )

        return monthly_forecasts

    @torch.no_grad()
    def predict_dataframe(
        self,
        df: pd.DataFrame,
        categoria_col: str = "categoria",
        valor_col: str = "valor_total",
        date_col: str = "ano_mes",
    ) -> pd.DataFrame:
        """
        Make forecasts from a DataFrame with historical data.

        Args:
            df: DataFrame with historical spending
            categoria_col: Column name for category
            valor_col: Column name for values
            date_col: Column name for date

        Returns:
            DataFrame with forecasts
        """
        results = []

        for categoria, group in df.groupby(categoria_col):
            group = group.sort_values(date_col)

            if len(group) < self.seq_len:
                logger.warning(
                    f"Skipping {categoria}: insufficient history ({len(group)} < {self.seq_len})"
                )
                continue

            history = group[valor_col].values
            last_date = str(group[date_col].max())

            try:
                forecasts = self.predict_with_dates(
                    categoria=categoria,
                    history=history,
                    last_date=last_date,
                    return_uncertainty=True,
                )

                for f in forecasts:
                    results.append(f.to_dict())

            except Exception as e:
                logger.error(f"Failed for {categoria}: {e}")
                continue

        return pd.DataFrame(results)

