혼동행렬을 계산하라.

**행이 실제 클래스, 열이 예측 클래스**다.

    C[i][j] = 실제가 i 이고 예측이 j 인 표본의 수

## 입력

    solve(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> np.ndarray

두 배열 모두 `0` 이상 `n_classes` 미만의 정수로 이루어진 shape `(n,)` 배열이며 길이가
같다. 결과는 shape `(n_classes, n_classes)` 의 정수 배열이다.

## 예제

    solve(np.array([0, 0, 1, 1, 1]),
          np.array([0, 1, 1, 1, 0]), 2)

    ->  [[1, 1],
         [1, 2]]

실제 `0` 이 둘인데 하나는 `0` 으로, 하나는 `1` 로 예측했다. 실제 `1` 은 셋인데 둘은
맞고 하나는 `0` 으로 예측했다.

## 주의

`numpy.bincount` · `numpy.histogram2d` · `numpy.add.at` · `numpy.unique` 는 사용할 수
없다. `sklearn` 은 허용 목록 밖이다.

**축을 뒤집지 않는다.** `sklearn` 도 행이 실제이지만 문서마다 다르므로, 다른 자료를 보고
구현하면 전치된 결과가 나오기 쉽다. 대각 성분은 같으므로 대칭적인 데이터에서는
드러나지 않는다.

등장하지 않는 클래스의 행과 열도 `0` 으로 채워 크기를 맞춘다.
