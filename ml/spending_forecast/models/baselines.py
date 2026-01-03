from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List

import numpy as np


# --------- Baselines (operam em arrays 1D de history) ---------


def last_value(history: np.ndarray, pred_len: int) -> np.ndarray:
    """Repete o último valor observado."""
    return np.full(pred_len, float(history[-1]), dtype=np.float32)


def moving_average(history: np.ndarray, pred_len: int, window: int = 3) -> np.ndarray:
    """Média móvel dos últimos N pontos."""
    window = int(min(window, len(history)))
    avg = float(np.mean(history[-window:]))
    return np.full(pred_len, avg, dtype=np.float32)


def linear_trend(history: np.ndarray, pred_len: int) -> np.ndarray:
    """Extrapolação linear simples."""
    x = np.arange(len(history), dtype=np.float32)
    slope, intercept = np.polyfit(x, history.astype(np.float32), 1)
    future_x = np.arange(len(history), len(history) + pred_len, dtype=np.float32)
    return (slope * future_x + intercept).astype(np.float32)


def seasonal_last_year(
    history: np.ndarray, pred_len: int, season: int = 12
) -> np.ndarray:
    """
    Baseline sazonal simples:
    usa valor de 12 meses atrás se existir; caso não, cai pra last_value.
    Útil pra gastos com sazonalidade (IPTU, seguro, etc).
    """
    if len(history) <= season:
        return last_value(history, pred_len)
    # prevê usando os últimos valores de um ciclo anterior
    start = len(history) - season
    base = history[start : start + pred_len]
    if len(base) < pred_len:
        # completa com last_value
        tail = last_value(history, pred_len - len(base))
        base = np.concatenate([base, tail], axis=0)
    return base.astype(np.float32)


# --------- Registry ---------


@dataclass(frozen=True)
class BaselineSpec:
    name: str
    fn: Callable[[np.ndarray, int], np.ndarray]


def get_baselines() -> List[BaselineSpec]:
    return [
        BaselineSpec("baseline_last_value", last_value),
        BaselineSpec(
            "baseline_moving_avg_3", lambda h, p: moving_average(h, p, window=3)
        ),
        BaselineSpec("baseline_linear_trend", linear_trend),
        BaselineSpec(
            "baseline_seasonal_12", lambda h, p: seasonal_last_year(h, p, season=12)
        ),
    ]
