"""정규방정식 케이스.

잔차가 정확히 0 인 케이스를 앞에 둔다. 계수를 손으로 확인할 수 있어 부호나 절편 위치를
틀린 풀이가 곧바로 드러난다.

특성이 서로 상관된 데이터는 조건수를 나쁘게 만든다. `XᵀX` 의 조건수는 `X` 의 제곱이므로
정규방정식은 원래 이 점에 약하다. 케이스는 상관을 적당히만 준다 — 이 문제가 묻는 것은
소거법 구현이지 수치해석이 아니다.

절편이 0 이 아닌 데이터를 반드시 넣는다. 절편 열을 빠뜨린 풀이는 길이가 달라
`length_mismatch` 로 잡히지만, 절편을 뒤에 붙인 풀이는 길이가 맞아 값으로만 갈린다.
"""

import numpy as np

SEED = 20260815


def generate():
    yield (np.array([[1.0], [2.0], [3.0]]), np.array([3.0, 5.0, 7.0]))

    # 절편이 크고 기울기가 음수 — 부호와 절편 위치를 함께 시험한다.
    x = np.array([[0.0], [1.0], [2.0], [3.0]])
    yield (x, (100.0 - 7.0 * x[:, 0]))

    # 다변량, 잔차 0
    multi = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0], [2.0, 1.0]])
    yield (multi, 5.0 + 2.0 * multi[:, 0] - 3.0 * multi[:, 1])

    rng = np.random.default_rng(SEED)
    for n, p in [(10, 1), (20, 3), (60, 5), (400, 10), (2000, 20)]:
        base = rng.normal(size=(n, p))
        # 특성끼리 약간 섞어 상관을 준다. 완전 직교 데이터만 주면 XᵀX 가 대각이 되어
        # 소거를 제대로 구현하지 않아도 답이 나온다.
        features = base + 0.3 * np.roll(base, 1, axis=1)
        weights = rng.normal(size=p) * 2.0
        target = 1.5 + features @ weights + rng.normal(size=n) * 0.5
        yield (features, target)
