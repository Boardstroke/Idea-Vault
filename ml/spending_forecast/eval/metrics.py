import numpy as np


def mae(y_true, y_pred):
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true, y_pred):
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def wape(y_true, y_pred, eps=1e-6):
    denom = np.sum(np.abs(y_true)) + eps
    return float(np.sum(np.abs(y_true - y_pred)) / denom)


def smape(y_true, y_pred, eps=1e-6):
    denom = (np.abs(y_true) + np.abs(y_pred)) / 2.0
    denom = np.maximum(denom, eps)
    return float(np.mean(np.abs(y_true - y_pred) / denom))


def horizon_metrics(y_true, y_pred):
    """
    Retorna métricas por horizonte: h1, h2, h3...
    y_true/y_pred: (N, pred_len)
    """
    pred_len = y_true.shape[1]
    out = {}
    for h in range(pred_len):
        out[f"mae_h{h + 1}"] = mae(y_true[:, h], y_pred[:, h])
        out[f"rmse_h{h + 1}"] = rmse(y_true[:, h], y_pred[:, h])
        out[f"wape_h{h + 1}"] = wape(y_true[:, h], y_pred[:, h])
        out[f"smape_h{h + 1}"] = smape(y_true[:, h], y_pred[:, h])
    return out


def coverage(y_true, mu, sigma, z=1.64):
    """
    Coverage aproximado de um intervalo ~90% se z=1.64.
    """
    lo = mu - z * sigma
    hi = mu + z * sigma
    inside = (y_true >= lo) & (y_true <= hi)
    return float(np.mean(inside))
