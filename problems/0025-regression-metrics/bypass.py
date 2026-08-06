"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def solve(y_true, y_pred):
    mse = float(mean_squared_error(y_true, y_pred))
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "mse": mse,
        "rmse": float(np.sqrt(mse)),
        "r2": float(r2_score(y_true, y_pred)),
    }
