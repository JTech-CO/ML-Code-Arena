"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

from sklearn.metrics import confusion_matrix


def solve(y_true, y_pred, n_classes):
    return confusion_matrix(y_true, y_pred, labels=list(range(n_classes)))
