"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

from sklearn.neighbors import KNeighborsClassifier


def solve(train_x, train_y, queries, k, n_classes):
    model = KNeighborsClassifier(n_neighbors=k)
    model.fit(train_x, train_y)
    return model.predict(queries)
