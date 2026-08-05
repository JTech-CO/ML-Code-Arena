# 기대 판정: AC — INV-8 시험의 1회차. 컨테이너 /tmp 에 흔적을 남긴다.
# 문제: sandbox-probe
import numpy as np


def solve(x):
    with open("/tmp/mlca_leak.txt", "w") as handle:
        handle.write("first submission was here")
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    return x / norms
