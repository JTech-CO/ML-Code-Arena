import numpy as np


def solve(y_true, y_pred, n_classes):
    matrix = np.zeros((n_classes, n_classes), dtype=np.int64)

    for actual in range(n_classes):
        actual_mask = y_true == actual
        for predicted in range(n_classes):
            matrix[actual, predicted] = (actual_mask & (y_pred == predicted)).sum()

    return matrix
