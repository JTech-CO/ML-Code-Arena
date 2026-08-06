레이블 배열의 지니 불순도를 계산하라.

    Gini = 1 - sum over i of pᵢ²

`pᵢ` 는 클래스 `i` 에 속하는 표본의 비율이다. 한 클래스만 있으면 `0`, 모든 클래스가
고르게 섞이면 `1 - 1/k` 로 최대가 된다.

## 입력

    solve(labels: np.ndarray, n_classes: int) -> float

`labels` 는 `0` 이상 `n_classes` 미만의 정수로 이루어진 shape `(n,)` 배열이며 `n ≥ 1` 다.
등장하지 않는 클래스가 있을 수 있으며 그 비율은 `0` 이다.

## 예제

    solve(np.array([0, 0, 1, 1]), 2)     ->  0.5
    solve(np.array([0, 0, 0, 0]), 2)     ->  0.0
    solve(np.array([0, 1, 2]), 3)        ->  0.6666666666666667

첫 번째는 `1 - (0.5² + 0.5²) = 0.5` 다.

## 주의

`numpy.bincount` · `numpy.unique` · `collections.Counter` 는 사용할 수 없다.
개수를 세는 것이 이 문제의 내용이다.

비교 연산과 `sum` 은 사용할 수 있다. `labels == i` 는 부울 배열이고 그 합이 개수다.
