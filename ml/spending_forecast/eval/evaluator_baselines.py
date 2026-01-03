"""
Baseline evaluation for spending forecast.

Uses the same metrics and denormalization as the Transformer evaluator
to ensure fair comparison in MLflow.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

import numpy as np

from spending_forecast.eval.metrics import mae, rmse, wape, smape, horizon_metrics
from spending_forecast.data.scaling import inverse_zscore

logger = logging.getLogger(__name__)


# ============================================================
# Baseline Functions
# ============================================================


def baseline_last_value(history: np.ndarray, pred_len: int) -> np.ndarray:
    """Repete o último valor observado."""
    return np.full(pred_len, float(history[-1]), dtype=np.float32)


def baseline_moving_average(
    history: np.ndarray, pred_len: int, window: int = 3
) -> np.ndarray:
    """Média móvel dos últimos N valores."""
    window = int(min(window, len(history)))
    avg = float(np.mean(history[-window:]))
    return np.full(pred_len, avg, dtype=np.float32)


def baseline_linear_trend(history: np.ndarray, pred_len: int) -> np.ndarray:
    """Extrapolação linear simples."""
    x = np.arange(len(history), dtype=np.float32)
    slope, intercept = np.polyfit(x, history.astype(np.float32), 1)
    future_x = np.arange(len(history), len(history) + pred_len, dtype=np.float32)
    return (slope * future_x + intercept).astype(np.float32)


def baseline_seasonal_12(
    history: np.ndarray, pred_len: int, season: int = 12
) -> np.ndarray:
    """Baseline sazonal: usa valores de 12 meses atrás se existir."""
    if len(history) <= season:
        return baseline_last_value(history, pred_len)
    start = len(history) - season
    base = history[start : start + pred_len]
    if len(base) < pred_len:
        tail = baseline_last_value(history, pred_len - len(base))
        base = np.concatenate([base, tail], axis=0)
    return base.astype(np.float32)


# ============================================================
# Baseline Registry
# ============================================================


@dataclass(frozen=True)
class BaselineSpec:
    name: str
    fn: Callable[[np.ndarray, int], np.ndarray]


def get_default_baselines() -> List[BaselineSpec]:
    """Returns list of baseline specifications."""
    return [
        BaselineSpec("baseline_last_value", baseline_last_value),
        BaselineSpec(
            "baseline_moving_avg_3",
            lambda h, p: baseline_moving_average(h, p, window=3),
        ),
        BaselineSpec("baseline_linear_trend", baseline_linear_trend),
        BaselineSpec(
            "baseline_seasonal_12",
            lambda h, p: baseline_seasonal_12(h, p, season=12),
        ),
    ]


# ============================================================
# Evaluation
# ============================================================


def _get_cat_stats_by_id(
    scaler_params: Dict[str, Dict[str, float]],
    reverse_category_mapping: Dict[int, str],
) -> Dict[int, Dict[str, float]]:
    """Convert scaler_params from {cat_name: stats} to {cat_id: stats}."""
    return {
        cat_id: scaler_params[cat_name]
        for cat_id, cat_name in reverse_category_mapping.items()
        if cat_name in scaler_params
    }


def evaluate_baseline_on_sequences(
    baseline: BaselineSpec,
    sequences: List[Dict],
    pred_len: int,
    scaler_params: Dict[str, Dict[str, float]],
    reverse_category_mapping: Dict[int, str],
) -> Dict[str, float]:
    """
    Evaluate a single baseline on sequences.

    Calculates metrics in BOTH normalized and BRL (denormalized) scale.
    Uses the same denormalization as the Transformer evaluator.

    Returns dict with:
    - mae, rmse, wape, smape (normalized scale)
    - mae_brl, rmse_brl, wape_brl, smape_brl (BRL scale)
    - horizon metrics (mae_h1_brl, etc.)
    """
    if len(sequences) == 0:
        raise ValueError("sequences is empty")

    cat_stats = _get_cat_stats_by_id(scaler_params, reverse_category_mapping)

    y_true_norm_list = []
    y_pred_norm_list = []
    y_true_brl_list = []
    y_pred_brl_list = []

    for seq in sequences:
        x_num = np.asarray(seq["x_numeric"], dtype=np.float32)
        y_true_norm = np.asarray(seq["y"], dtype=np.float32)

        # Get history (normalized values)
        history = x_num[:, 0]

        # Predict (in normalized space)
        y_pred_norm = baseline.fn(history, pred_len).astype(np.float32)

        y_true_norm_list.append(y_true_norm)
        y_pred_norm_list.append(y_pred_norm)

        # Denormalize to BRL
        cat_id = int(seq["categories"][0])
        if cat_id in cat_stats:
            stats = cat_stats[cat_id]
            mean_val = float(stats["mean"])
            std_val = float(stats["std"])

            y_true_brl = inverse_zscore(y_true_norm, mean_val, std_val)
            y_pred_brl = inverse_zscore(y_pred_norm, mean_val, std_val)

            y_true_brl_list.append(y_true_brl)
            y_pred_brl_list.append(y_pred_brl)

    # Stack arrays
    y_true_norm_all = np.stack(y_true_norm_list, axis=0)  # (N, pred_len)
    y_pred_norm_all = np.stack(y_pred_norm_list, axis=0)

    # Metrics in normalized scale
    out = {
        "mae": mae(y_true_norm_all, y_pred_norm_all),
        "rmse": rmse(y_true_norm_all, y_pred_norm_all),
        "wape": wape(y_true_norm_all, y_pred_norm_all),
        "smape": smape(y_true_norm_all, y_pred_norm_all),
        "n_sequences": len(sequences),
    }

    # Metrics in BRL scale (main comparison metric!)
    if len(y_true_brl_list) > 0:
        y_true_brl_all = np.stack(y_true_brl_list, axis=0)
        y_pred_brl_all = np.stack(y_pred_brl_list, axis=0)

        out["mae_brl"] = mae(y_true_brl_all, y_pred_brl_all)
        out["rmse_brl"] = rmse(y_true_brl_all, y_pred_brl_all)
        out["wape_brl"] = wape(y_true_brl_all, y_pred_brl_all)
        out["smape_brl"] = smape(y_true_brl_all, y_pred_brl_all)

        # Horizon metrics in BRL
        h_metrics = horizon_metrics(y_true_brl_all, y_pred_brl_all)
        out.update({f"{k}_brl": v for k, v in h_metrics.items()})

    return out


def evaluate_all_baselines(
    sequences: List[Dict],
    pred_len: int,
    scaler_params: Dict[str, Dict[str, float]],
    reverse_category_mapping: Dict[int, str],
    baselines: Optional[List[BaselineSpec]] = None,
) -> Dict[str, Dict[str, float]]:
    """Evaluate all baselines and return results dict."""
    baselines = baselines or get_default_baselines()
    results: Dict[str, Dict[str, float]] = {}

    for b in baselines:
        try:
            results[b.name] = evaluate_baseline_on_sequences(
                baseline=b,
                sequences=sequences,
                pred_len=pred_len,
                scaler_params=scaler_params,
                reverse_category_mapping=reverse_category_mapping,
            )
            logger.info(
                f"  {b.name}: MAE_BRL={results[b.name].get('mae_brl', 'N/A'):.2f}"
            )
        except Exception as e:
            logger.warning(f"Could not evaluate baseline {b.name}: {e}")

    return results


# ============================================================
# MLflow Logging
# ============================================================


def log_baselines_to_mlflow(
    sequences: List[Dict],
    seq_len: int,
    pred_len: int,
    scaler_params: Dict[str, Dict[str, float]],
    reverse_category_mapping: Dict[int, str],
    experiment_name: str,
    primary_metric: str = "mae_brl",
):
    """
    Log baselines as separate runs in MLflow.

    Each baseline gets its own run with:
    - Parameters: baseline_name, seq_len, pred_len
    - Metrics: mae_brl, rmse_brl, wape_brl (same as Transformer!)
    - Primary metric for comparison

    This allows direct comparison with Transformer models in MLflow UI.
    """
    import mlflow

    mlflow.set_experiment(experiment_name)

    logger.info("Logging baselines to MLflow...")

    results = evaluate_all_baselines(
        sequences=sequences,
        pred_len=pred_len,
        scaler_params=scaler_params,
        reverse_category_mapping=reverse_category_mapping,
    )

    for baseline_name, metrics in results.items():
        try:
            with mlflow.start_run(run_name=baseline_name, nested=False):
                # Parameters
                mlflow.log_params(
                    {
                        "model_type": "baseline",
                        "baseline_name": baseline_name,
                        "seq_len": int(seq_len),
                        "pred_len": int(pred_len),
                        "n_sequences": int(len(sequences)),
                    }
                )

                # Log all metrics
                mlflow.log_metrics(
                    {
                        k: float(v)
                        for k, v in metrics.items()
                        if isinstance(v, (int, float))
                    }
                )

                # Log primary metric for comparison (same name as Transformer uses)
                if primary_metric in metrics:
                    mlflow.log_metric("primary_metric", float(metrics[primary_metric]))

                logger.info(f"  Logged {baseline_name} to MLflow")

        except Exception as e:
            logger.warning(f"Could not log baseline {baseline_name}: {e}")

    logger.info("Baselines logged to MLflow")
