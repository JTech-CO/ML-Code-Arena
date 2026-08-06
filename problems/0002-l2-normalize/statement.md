2차원 배열의 각 **행**을 L2 노름으로 나누어 정규화한 배열을 반환하라.

행 `v` 에 대한 결과는 `v / ||v||₂` 이며, 결과 shape 은 입력과 같다.

    ||v||₂ = sqrt(v₁² + v₂² + ... + vₙ²)

## 입력

    solve(x: np.ndarray) -> np.ndarray

`x` 는 shape `(n, m)` 의 float 배열이다. 모든 행의 노름은 `0` 보다 크다.

## 예제

    solve(np.array([[3.0, 4.0],
                    [1.0, 0.0]]))

    ->  [[0.6, 0.8],
         [1.0, 0.0]]

## 주의

`numpy.linalg` 은 사용할 수 없다. 노름을 직접 계산해야 한다.

열 단위가 아니라 **행 단위**다. `axis` 를 잘못 주면 결과 shape 은 맞는데 값이 틀린다 —
이 경우 `shape_mismatch` 가 아니라 `value_mismatch` 로 나온다.
