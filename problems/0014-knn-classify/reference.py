import numpy as np


def solve(train_x, train_y, queries, k, n_classes):
    difference = queries[:, None, :] - train_x[None, :, :]
    squared = (difference * difference).sum(axis=2)

    # 안정 정렬이어야 거리 동점에서 인덱스가 작은 쪽이 먼저 온다.
    order = np.argsort(squared, axis=1, kind="stable")
    neighbors = train_y[order[:, :k]]

    counts = np.zeros((queries.shape[0], n_classes), dtype=np.int64)
    for label in range(n_classes):
        counts[:, label] = (neighbors == label).sum(axis=1)

    # argmax 는 최댓값이 여럿이면 첫 번째를 돌려준다 — 레이블이 작은 쪽이다.
    return np.argmax(counts, axis=1)
