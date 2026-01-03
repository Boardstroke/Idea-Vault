import numpy as np


def inverse_zscore(values_norm: np.ndarray, mean: float, std: float) -> np.ndarray:
    return values_norm * std + mean


def inverse_transform_batch(
    y_norm: np.ndarray,  # (N, pred_len)
    cat_ids: np.ndarray,  # (N,)
    reverse_category_mapping: dict,  # id -> categoria_nome
    scaler_params: dict,  # scaler_params[categoria] = {mean,std,...}
) -> np.ndarray:
    """
    Desnormaliza y_norm para BRL usando mean/std por categoria.
    """
    y_brl = np.empty_like(y_norm, dtype=np.float32)

    for i, cat_id in enumerate(cat_ids):
        cat_name = reverse_category_mapping[int(cat_id)]
        mean = scaler_params[cat_name]["mean"]
        std = scaler_params[cat_name]["std"]
        y_brl[i] = inverse_zscore(y_norm[i], mean, std)

    return y_brl
