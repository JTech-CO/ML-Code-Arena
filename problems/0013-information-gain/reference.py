import numpy as np


def _entropy(labels, n_classes):
    n = labels.shape[0]
    if n == 0:
        return 0.0

    total = 0.0
    for label in range(n_classes):
        count = (labels == label).sum()
        if count == 0:
            continue
        proportion = count / n
        total -= proportion * np.log2(proportion)

    return float(total)


def solve(labels, mask, n_classes):
    n = labels.shape[0]
    left = labels[mask]
    right = labels[~mask]

    parent = _entropy(labels, n_classes)
    children = (
        left.shape[0] / n * _entropy(left, n_classes)
        + right.shape[0] / n * _entropy(right, n_classes)
    )

    return (parent, float(children), float(parent - children))
