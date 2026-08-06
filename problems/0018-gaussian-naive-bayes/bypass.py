"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

from sklearn.naive_bayes import GaussianNB


def solve(train_x, train_y, queries, n_classes):
    return GaussianNB().fit(train_x, train_y).predict(queries)
