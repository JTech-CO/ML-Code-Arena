"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np
from scipy.cluster.vq import vq


def solve(x, centroids):
    labels, _ = vq(x, centroids)
    updated = centroids.copy()
    for index in range(centroids.shape[0]):
        members = x[labels == index]
        if members.shape[0] > 0:
            updated[index] = members.mean(axis=0)
    return (labels, updated)
