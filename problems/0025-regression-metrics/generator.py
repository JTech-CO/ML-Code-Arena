"""회귀 지표 케이스.

**R² 가 음수인 케이스**를 반드시 넣는다. 예측을 정답의 반대 방향으로 두면 된다.
R² 를 상관계수의 제곱으로 구현한 풀이는 항상 0 이상이라 여기서 갈린다.

MAE 와 RMSE 가 크게 벌어지는 케이스도 넣는다 — 대부분 오차가 작고 하나만 큰 데이터다.
제곱이 큰 오차에 큰 벌점을 준다는 성질이 수치로 드러난다.

완벽 예측(MAE = MSE = 0, R² = 1)은 0 으로 나누는 경계를 만들지 않는다. `SS_tot` 은
정답의 분산이라 예측과 무관하다.
"""

import numpy as np

SEED = 20260825


def generate():
    yield (np.array([3.0, -0.5, 2.0, 7.0]), np.array([2.5, 0.0, 2.0, 8.0]))

    # 완벽 예측
    yield (np.array([1.0, 2.0, 3.0]), np.array([1.0, 2.0, 3.0]))

    # R² 가 음수 — 정답을 뒤집은 예측
    yield (np.array([1.0, 2.0, 3.0, 4.0]), np.array([4.0, 3.0, 2.0, 1.0]))

    # 이상치 하나 — MAE 는 작고 RMSE 는 크다.
    truth = np.zeros(100)
    prediction = np.zeros(100)
    prediction[0] = 50.0
    truth[1:] = np.linspace(-1.0, 1.0, 99)
    yield (truth, prediction)

    rng = np.random.default_rng(SEED)
    for n, noise in [(2, 0.1), (10, 0.5), (100, 1.0), (5000, 2.0)]:
        target = rng.normal(size=n) * 10.0
        yield (target, target + rng.normal(size=n) * noise)

    # 스케일이 큰 값 — 제곱에서 자릿수가 커진다.
    target = rng.normal(size=200) * 1e4
    yield (target, target + rng.normal(size=200) * 1e3)
