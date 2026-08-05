# 기대 판정: RE — 엔트리포인트 `solve` 가 없다 (docs/TECHNICAL.md §4.3).
# 문법도 제한도 통과하지만 호출할 함수가 없는 경우다.
import numpy as np


def normalize(x):
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    return x / norms
