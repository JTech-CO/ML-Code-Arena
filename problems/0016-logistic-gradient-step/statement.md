로지스틱 회귀의 경사하강 **1스텝**을 계산하라.

예측은 시그모이드를 통과한 값이고, 교차 엔트로피 손실의 기울기는 `(예측 − 정답)` 형태다.

    p    = σ(Xw + b)
    dw   = Xᵀ(p - y) / n
    db   = mean(p - y)
    w'   = w - lr · dw
    b'   = b - lr · db

## 입력

    solve(x: np.ndarray, y: np.ndarray, w: np.ndarray, b: float, lr: float)
        -> tuple[np.ndarray, float]

`x` 는 shape `(n, p)`, `y` 는 `0` 또는 `1` 로 이루어진 shape `(n,)` float 배열이다.
`w` 는 shape `(p,)` 다. `(w', b')` 를 반환하며 `w'` 의 shape 은 `(p,)` 다.

## 예제

    solve(np.array([[1.0], [2.0]]),
          np.array([1.0, 0.0]),
          np.array([0.0]), 0.0, 1.0)

    ->  ([-0.25], 0.0)

`w = 0`, `b = 0` 이면 두 표본의 예측이 모두 `0.5` 다. 따라서

    p - y = [-0.5, 0.5]
    dw    = (1 × (-0.5) + 2 × 0.5) / 2 = 0.25
    db    = (-0.5 + 0.5) / 2 = 0.0
    w'    = 0 - 1.0 × 0.25 = -0.25

## 주의

`numpy.tanh` 는 사용할 수 없다. `sklearn` 은 허용 목록 밖이다.

시그모이드는 큰 음수에서 오버플로한다. 부호로 갈라 계산한다 —
[수치 안정 시그모이드](/problems/sigmoid-stable) 참고.

기울기는 **평균**이다. 합으로 두면 표본 수에 따라 스텝 크기가 달라진다.
