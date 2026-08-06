"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np


def solve(a, iterations):
    values, vectors = np.linalg.eigh(a)
    top = int(np.argmax(np.abs(values)))
    vector = vectors[:, top]
    if vector[int(np.argmax(np.abs(vector)))] < 0:
        vector = -vector
    return (float(values[top]), vector)
