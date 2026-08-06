"""상관계수 케이스.

열마다 스케일을 크게 다르게 준다. 상관계수는 스케일에 불변이어야 하므로, 표준편차로
나누는 단계를 빠뜨린 풀이(= 공분산을 그대로 낸 풀이)가 여기서 드러난다.

완전 상관(`1.0`)과 완전 역상관(`-1.0`) 도 넣는다. 부호를 잃는 풀이가 있다.
"""

import numpy as np

SEED = 20260805


def generate():
    yield (np.array([[1.0, 2.0], [2.0, 1.0], [3.0, 4.0], [4.0, 3.0]]),)
    yield (np.array([[1.0, -1.0], [2.0, -2.0], [3.0, -3.0]]),)
    yield (np.array([[0.0], [5.0], [2.0]]),)

    rng = np.random.default_rng(SEED)
    for n, p in [(5, 3), (3, 5), (30, 8), (200, 15)]:
        base = rng.normal(size=(n, 2))
        mixing = rng.normal(size=(2, p))
        data = base @ mixing + 0.4 * rng.normal(size=(n, p))
        # 열마다 10^0 ~ 10^3 배로 벌린다.
        scales = 10.0 ** rng.integers(0, 4, size=p)
        yield (data * scales,)
