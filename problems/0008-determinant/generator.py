"""행렬식 케이스.

세 갈래를 모두 덮는다.

- **정칙**: 대각 우세 행렬. 조건수가 좋아 알고리즘이 달라도 같은 값이 나온다
- **특이**: 행을 복제하거나 0 행을 넣는다. 행렬식이 정확히 0 이어야 한다
- **부호**: 치환 행렬. 행 교환 횟수를 세지 않는 풀이가 여기서 부호를 틀린다

조건수가 나쁜 행렬 — 행렬식이 0 에 가깝지만 0 은 아닌 — 은 넣지 않는다. 그런 행렬은
정답 알고리즘끼리도 자릿수가 갈려 허용 오차 문제가 되며, 이 문제가 묻는 것이 아니다.
"""

import numpy as np

SEED = 20260808


def _dominant(rng, n):
    """대각 우세 행렬 — 조건수가 좋아 소거 순서가 달라도 값이 안정적이다."""
    matrix = rng.integers(-4, 5, size=(n, n)).astype(float)
    matrix[np.arange(n), np.arange(n)] = np.abs(matrix).sum(axis=1) + 1.0
    return matrix


def generate():
    yield (np.array([[4.0, 3.0], [6.0, 3.0]]),)
    yield (np.array([[7.0]]),)
    yield (np.eye(5),)

    # 부호 — 두 행을 바꾼 단위행렬의 행렬식은 -1 이다.
    swapped = np.eye(4)
    swapped[[0, 1]] = swapped[[1, 0]]
    yield (swapped,)

    # 세 행을 순환시키면 교환 두 번이므로 +1 이다.
    rotated = np.eye(3)[[1, 2, 0]]
    yield (rotated,)

    rng = np.random.default_rng(SEED)

    for n in [2, 3, 4, 6, 9]:
        yield (_dominant(rng, n),)

    # 특이 — 행 복제
    duplicated = _dominant(rng, 5)
    duplicated[3] = duplicated[1]
    yield (duplicated,)

    # 특이 — 0 행
    zero_row = _dominant(rng, 4)
    zero_row[2] = 0.0
    yield (zero_row,)

    # 특이 — 한 행이 다른 두 행의 합
    dependent = _dominant(rng, 4)
    dependent[3] = dependent[0] + dependent[1]
    yield (dependent,)
