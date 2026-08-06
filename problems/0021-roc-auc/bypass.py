"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

from sklearn.metrics import roc_auc_score


def solve(y_true, scores):
    return float(roc_auc_score(y_true, scores))
