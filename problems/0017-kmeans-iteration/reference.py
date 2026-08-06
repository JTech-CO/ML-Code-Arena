import numpy as np


def solve(x, centroids):
    difference = x[:, None, :] - centroids[None, :, :]
    squared = (difference * difference).sum(axis=2)

    # argmin 은 최솟값이 여럿이면 첫 번째를 돌려준다 — 인덱스가 작은 중심이다.
    labels = np.argmin(squared, axis=1)

    updated = centroids.astype(float).copy()
    for index in range(centroids.shape[0]):
        members = x[labels == index]
        if members.shape[0] > 0:
            updated[index] = members.sum(axis=0) / members.shape[0]

    return (labels, updated)
