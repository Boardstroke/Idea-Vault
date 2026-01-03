from typing import Dict, Any
import numpy as np
import torch

from spending_forecast.data.scaling import inverse_transform_batch
from spending_forecast.eval.metrics import (
    mae,
    rmse,
    wape,
    smape,
    horizon_metrics,
    coverage,
)


@torch.no_grad()
def eval_transformer(
    model,
    dataloader,
    device,
    reverse_category_mapping,
    scaler_params,
    return_uncertainty: bool,
) -> Dict[str, Any]:
    model.eval()

    y_true_norm_list = []
    y_pred_norm_list = []
    sigma_norm_list = []
    cat_id_list = []

    for batch in dataloader:
        x_numeric = batch["x_numeric"].to(device)
        categories = batch["categories"].to(device)
        months = batch["months"].to(device)
        y = batch["y"].to(device)

        if return_uncertainty:
            mu, var = model(x_numeric, categories, months, return_uncertainty=True)
            var = torch.clamp(var, min=1e-6)
            sigma = torch.sqrt(var)
            sigma_norm_list.append(sigma.cpu().numpy())
        else:
            mu, _ = model(x_numeric, categories, months, return_uncertainty=False)

        y_true_norm_list.append(y.cpu().numpy())
        y_pred_norm_list.append(mu.cpu().numpy())
        cat_id_list.append(categories[:, 0].cpu().numpy())  # 1 id por sequência

    y_true_norm = np.concatenate(y_true_norm_list, axis=0)
    y_pred_norm = np.concatenate(y_pred_norm_list, axis=0)
    cat_ids = np.concatenate(cat_id_list, axis=0)

    # Desnormalizar
    y_true_brl = inverse_transform_batch(
        y_true_norm, cat_ids, reverse_category_mapping, scaler_params
    )
    y_pred_brl = inverse_transform_batch(
        y_pred_norm, cat_ids, reverse_category_mapping, scaler_params
    )

    out = {
        "mae_brl": mae(y_true_brl, y_pred_brl),
        "rmse_brl": rmse(y_true_brl, y_pred_brl),
        "wape": wape(y_true_brl, y_pred_brl),
        "smape": smape(y_true_brl, y_pred_brl),
    }
    out.update(
        {f"{k}_brl": v for k, v in horizon_metrics(y_true_brl, y_pred_brl).items()}
    )

    if return_uncertainty and sigma_norm_list:
        sigma_norm = np.concatenate(sigma_norm_list, axis=0)
        sigma_brl = inverse_transform_batch(
            sigma_norm, cat_ids, reverse_category_mapping, scaler_params
        )

        out["p90_coverage"] = coverage(y_true_brl, y_pred_brl, sigma_brl, z=1.64)
        out["avg_sigma_brl"] = float(np.mean(sigma_brl))

    return out
