"""시그모이드 케이스.

이 문제의 존재 이유는 큰 음수다. 식을 그대로 쓴 풀이는 정상 범위를 전부 통과하고
`z = -1000` 에서 `nan` 을 낸다.

0 을 반드시 포함한다. 부호로 갈라 쓰는 풀이에서 `z >= 0` 과 `z > 0` 중 무엇을 쓰든
값은 같아야 하지만, 경계를 빠뜨려 어느 쪽에도 안 들어가는 구현이 나온다.

shape 은 1차원·2차원·3차원을 섞는다. 부울 인덱싱으로 나눠 담는 풀이가 차원에
따라 깨지는 경우가 있다.
"""

import numpy as np

SEED = 20260811


def generate():
    yield (np.array([0.0, -1000.0, 1000.0]),)
    yield (np.array([-1e4, -700.0, -1.0, 0.0, 1.0, 700.0, 1e4]),)
    yield (np.array([[0.0]]),)

    rng = np.random.default_rng(SEED)
    yield (rng.normal(size=50) * 5.0,)
    yield (rng.normal(size=(20, 8)) * 20.0,)
    yield (rng.normal(size=(4, 5, 6)),)

    # 전부 음수 / 전부 양수 — 한쪽 가지가 빈 배열이 되는 경계.
    yield (-np.abs(rng.normal(size=30)) * 100.0 - 1.0,)
    yield (np.abs(rng.normal(size=30)) * 100.0 + 1.0,)

    yield (rng.normal(size=(200, 50)) * 300.0,)
