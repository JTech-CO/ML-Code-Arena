두 행렬의 곱을 계산하라.

`(n, k)` 와 `(k, m)` 을 곱하면 `(n, m)` 이 나온다. 결과의 `(i, j)` 성분은 왼쪽 행렬의
`i` 행과 오른쪽 행렬의 `j` 열을 성분끼리 곱해 더한 값이다.

    C[i][j] = sum over t of  A[i][t] * B[t][j]

## 입력

    solve(a: np.ndarray, b: np.ndarray) -> np.ndarray

`a` 는 shape `(n, k)`, `b` 는 shape `(k, m)` 의 float 배열이다. 곱할 수 없는 shape 은
주어지지 않는다.

## 예제

    solve(np.array([[1.0, 2.0],
                    [3.0, 4.0]]),
          np.array([[5.0, 6.0],
                    [7.0, 8.0]]))

    ->  [[19.0, 22.0],
         [43.0, 50.0]]

## 주의

`@` 연산자와 `numpy.matmul` · `numpy.dot` · `numpy.einsum` 계열은 사용할 수 없다.
배열의 `.dot` 메서드도 마찬가지다.

원소별 곱 `*` 와 브로드캐스팅, `sum` 은 사용할 수 있다. 반복문으로 풀어도 되지만,
가운데 차원을 축으로 더하는 방식이 훨씬 빠르다.
