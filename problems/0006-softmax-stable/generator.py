"""softmax 케이스.

이 문제의 존재 이유는 오버플로다. 그래서 큰 양수·큰 음수를 반드시 포함한다.
식을 그대로 쓴 풀이는 앞쪽 작은 값 케이스를 통과하고 여기서 `nan` 을 낸다.

큰 음수만 있는 행도 넣는다. 최댓값을 빼는 대신 절댓값이 큰 값을 빼는 풀이는
`exp` 가 전부 언더플로해 0/0 이 된다.
"""

import numpy as np

SEED = 20260806


def generate():
    yield (np.array([[0.0, 0.0], [1000.0, 1000.0]]),)
    yield (np.array([[1.0, 2.0, 3.0]]),)
    yield (np.array([[-1000.0, -1000.0, -1000.0]]),)
    yield (np.array([[0.0, 1000.0], [1000.0, 0.0], [-1000.0, 1000.0]]),)
    yield (np.array([[1e4, 9999.0], [-1e4, -9999.0]]),)

    rng = np.random.default_rng(SEED)
    for rows, cols in [(1, 1), (5, 10), (10, 5), (200, 32)]:
        yield (rng.normal(size=(rows, cols)) * 3.0,)

    # 정상 범위와 극단값이 한 배열 안에 섞인 경우.
    mixed = rng.normal(size=(8, 6))
    mixed[3] += 800.0
    mixed[5] -= 800.0
    yield (mixed,)
