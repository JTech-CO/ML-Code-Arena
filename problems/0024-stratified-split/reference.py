import numpy as np


def solve(y, k):
    folds = [[] for _ in range(k)]

    n_classes = int(y.max()) + 1
    for label in range(n_classes):
        indices = np.nonzero(y == label)[0]
        for position, index in enumerate(indices):
            folds[position % k].append(int(index))

    return [np.sort(np.array(fold, dtype=np.int64)) for fold in folds]
