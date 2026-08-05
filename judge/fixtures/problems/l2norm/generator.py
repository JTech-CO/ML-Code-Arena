"""테스트케이스 생성. 시드를 고정해 재생성 결과가 항상 같게 한다 (INV-10).

시드가 흔들리면 `problem-sync --verify` 의 해시 대조가 매번 실패하고,
그 게이트는 곧 무시된다.
"""

import numpy as np

SEED = 20260806


def generate():
    rng = np.random.default_rng(SEED)
    cases = []

    for shape in [(3, 3), (1, 4), (5, 2), (8, 8), (2, 6)]:
        x = rng.normal(size=shape)
        # 0 벡터 행이 있으면 정규화가 0 나눗셈이 된다. 기준 구현과 제출이
        # 서로 다른 NaN 을 내면 판정이 흔들리므로 애초에 만들지 않는다.
        zero_rows = np.sqrt((x**2).sum(axis=1)) < 1e-6
        x[zero_rows] += 1.0
        cases.append([x])

    return cases
