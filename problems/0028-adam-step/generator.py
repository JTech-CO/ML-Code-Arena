"""Adam 케이스.

**`t = 1`** 을 반드시 넣는다. 편향 보정이 가장 크게 작용하는 지점이며(`1 - β₁ = 0.1`
로 나눈다), 보정을 빠뜨린 풀이는 `t` 가 클 때는 통과하고 여기서 10배 어긋난다.

**`t` 가 큰 케이스**도 넣는다. `β₂ᵗ` 이 언더플로에 가까워지는 구간에서 보정이 1 로
수렴하는지 본다.

**기울기가 0 인 케이스**는 `v̂ = 0` 이 되어 `ε` 의 위치가 드러난다. `sqrt(v̂ + ε)` 는
`1e-4` 를, `sqrt(v̂) + ε` 는 `1e-8` 을 분모로 준다 — 네 자리 차이다.
"""

import numpy as np

SEED = 20260828

LR = 0.001
BETA1 = 0.9
BETA2 = 0.999
EPS = 1e-8


def generate():
    yield (
        np.array([1.0]),
        np.array([0.1]),
        np.array([0.0]),
        np.array([0.0]),
        1,
        LR,
        BETA1,
        BETA2,
        EPS,
    )

    # 기울기 0 — eps 의 위치가 드러난다.
    yield (
        np.array([1.0, -1.0]),
        np.zeros(2),
        np.zeros(2),
        np.zeros(2),
        1,
        LR,
        BETA1,
        BETA2,
        EPS,
    )

    rng = np.random.default_rng(SEED)

    for n, t in [(1, 2), (4, 10), (10, 100), (50, 10000), (200, 1)]:
        grads = rng.normal(size=n)
        # 상태는 이전 스텝들이 쌓아 온 값처럼 보이게 둔다.
        yield (
            rng.normal(size=n),
            grads,
            rng.normal(size=n) * 0.1,
            np.abs(rng.normal(size=n)) * 0.01,
            t,
            LR,
            BETA1,
            BETA2,
            EPS,
        )

    # 기본값이 아닌 하이퍼파라미터
    yield (
        rng.normal(size=8),
        rng.normal(size=8),
        np.zeros(8),
        np.zeros(8),
        3,
        0.01,
        0.5,
        0.9,
        1e-6,
    )

    # 기울기가 아주 크다 — v 가 커져 갱신량이 억제되는지 본다.
    yield (
        np.zeros(5),
        np.full(5, 1e6),
        np.zeros(5),
        np.zeros(5),
        1,
        LR,
        BETA1,
        BETA2,
        EPS,
    )
