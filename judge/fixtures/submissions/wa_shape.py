# 기대 판정: WA — 값은 맞지만 축을 평탄화했다.
# ML 입문자의 최다 오류가 축 실수이므로 shape_mismatch 경로를 따로 시험한다.
import numpy as np


def solve(x):
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    return (x / norms).ravel()
