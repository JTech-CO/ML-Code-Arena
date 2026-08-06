"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

from sklearn.metrics import f1_score, precision_score, recall_score


def solve(y_true, y_pred):
    return (
        float(precision_score(y_true, y_pred, zero_division=0)),
        float(recall_score(y_true, y_pred, zero_division=0)),
        float(f1_score(y_true, y_pred, zero_division=0)),
    )
