"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

from sklearn.metrics import average_precision_score


def solve(y_true, scores):
    return float(average_precision_score(y_true, scores))
