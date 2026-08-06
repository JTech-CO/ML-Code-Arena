"""정밀도·재현율 케이스.

**정밀도와 재현율이 다른 값**이 되는 케이스가 핵심이다. 둘이 같으면 서로 바꿔 쓴 풀이가
그대로 통과한다. 예측 양성 수와 실제 양성 수를 일부러 다르게 만든다.

분모가 0 인 세 갈래를 모두 넣는다 — 예측이 전부 음성, 실제가 전부 음성, 둘 다.

불균형 데이터도 넣는다. 이 지표들이 존재하는 이유가 정확도로는 안 보이는 것을 보기
위해서다.
"""

import numpy as np

SEED = 20260820


def generate():
    yield (np.array([1, 1, 0, 0]), np.array([1, 0, 1, 0]))

    # 정밀도 1.0, 재현율 0.25 — 둘을 바꿔 쓴 풀이가 여기서 갈린다.
    yield (np.array([1, 1, 1, 1, 0, 0]), np.array([1, 0, 0, 0, 0, 0]))

    # 정밀도 0.25, 재현율 1.0
    yield (np.array([1, 0, 0, 0]), np.array([1, 1, 1, 1]))

    # 예측이 전부 음성 — 정밀도의 분모가 0
    yield (np.array([1, 1, 0]), np.array([0, 0, 0]))

    # 실제가 전부 음성 — 재현율의 분모가 0
    yield (np.array([0, 0, 0]), np.array([1, 0, 1]))

    # 둘 다 0
    yield (np.array([0, 0]), np.array([0, 0]))

    # 완벽
    yield (np.array([1, 0, 1]), np.array([1, 0, 1]))

    rng = np.random.default_rng(SEED)
    for n, positive_rate in [(20, 0.5), (200, 0.1), (1000, 0.02), (5000, 0.3)]:
        truth = (rng.random(n) < positive_rate).astype(np.int64)
        # 재현율과 정밀도가 서로 다른 값이 되도록 예측을 비대칭으로 흔든다.
        prediction = truth.copy()
        flip_to_positive = rng.random(n) < 0.15
        flip_to_negative = rng.random(n) < 0.35
        prediction[flip_to_positive] = 1
        prediction[flip_to_negative & (truth == 1)] = 0
        yield (truth, prediction)
