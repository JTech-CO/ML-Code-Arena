import numpy as np


def solve(labels, n_classes):
    n = labels.shape[0]

    total = 0.0
    for label in range(n_classes):
        proportion = (labels == label).sum() / n
        total += proportion * proportion

    return float(1.0 - total)
