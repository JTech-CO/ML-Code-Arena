import numpy as np


def solve(y_true, scores):
    order = np.argsort(-np.asarray(scores, dtype=float), kind="stable")
    labels = np.asarray(y_true)[order]

    total_positive = labels.sum()

    hits = 0
    previous_recall = 0.0
    total = 0.0

    for index, label in enumerate(labels):
        hits += int(label)
        recall = hits / total_positive
        if recall > previous_recall:
            precision = hits / (index + 1)
            total += (recall - previous_recall) * precision
            previous_recall = recall

    return float(total)
