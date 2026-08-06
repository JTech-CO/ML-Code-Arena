import numpy as np


def solve(y_true, y_pred):
    residual = y_true - y_pred
    n = y_true.shape[0]

    mae = np.abs(residual).sum() / n
    mse = (residual * residual).sum() / n

    centered = y_true - y_true.sum() / n
    ss_total = (centered * centered).sum()
    ss_residual = (residual * residual).sum()

    return {
        "mae": float(mae),
        "mse": float(mse),
        "rmse": float(np.sqrt(mse)),
        "r2": float(1.0 - ss_residual / ss_total),
    }
