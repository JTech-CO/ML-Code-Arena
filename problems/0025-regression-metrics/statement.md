회귀 예측의 네 지표를 계산해 `dict` 로 반환하라.

    MAE  = mean(|y - ŷ|)
    MSE  = mean((y - ŷ)²)
    RMSE = sqrt(MSE)
    R²   = 1 - SS_res / SS_tot

`SS_res = sum((y - ŷ)²)`, `SS_tot = sum((y - ȳ)²)` 이며 `ȳ` 는 정답의 평균이다.

## 입력

    solve(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]

두 배열 모두 shape `(n,)` 의 float 배열이며 `n ≥ 2` 다. `SS_tot` 은 `0` 이 아니다.

반환하는 `dict` 의 키는 정확히 다음 넷이다.

    {"mae": ..., "mse": ..., "rmse": ..., "r2": ...}

## 예제

    solve(np.array([3.0, -0.5, 2.0, 7.0]),
          np.array([2.5,  0.0, 2.0, 8.0]))

    ->  {"mae": 0.5, "mse": 0.375, "rmse": 0.6123724356957945,
         "r2": 0.9486081370449679}

## 주의

`sklearn.metrics` 는 허용 목록 밖이다.

**RMSE 는 MSE 의 제곱근**이다. 각 오차의 절댓값을 제곱근 낸 뒤 평균 내는 것이 아니다.

R² 는 음수가 될 수 있다. 예측이 정답의 평균보다 못하면 `SS_res > SS_tot` 이다.
