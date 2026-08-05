# 기대 판정: WA — L2 노름 대신 절댓값 합(L1)으로 나눈다.
# shape 은 맞고 값만 틀리므로 value_mismatch 경로를 시험한다.
import numpy as np


def solve(x):
    return x / np.abs(x).sum(axis=1, keepdims=True)
