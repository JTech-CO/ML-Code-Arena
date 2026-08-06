2차원 배열의 각 **행**에 softmax 를 적용하라. 결과의 각 행은 합이 `1` 이 된다.

    softmax(x)ᵢ = exp(xᵢ) / sum(exp(xⱼ))

입력에는 `1000` 같은 큰 값이 들어온다. 식을 그대로 계산하면 `exp` 가 `inf` 가 되고
`inf / inf` 는 `nan` 이 된다. 분자와 분모에 같은 상수를 곱해도 값이 변하지 않는다는
성질을 이용하면 오버플로 없이 같은 값을 얻을 수 있다.

## 입력

    solve(x: np.ndarray) -> np.ndarray

`x` 는 shape `(n, m)` 의 float 배열이다. 성분의 절댓값은 최대 `1e4` 다.

## 예제

    solve(np.array([[0.0, 0.0],
                    [1000.0, 1000.0]]))

    ->  [[0.5, 0.5],
         [0.5, 0.5]]

두 번째 행을 식 그대로 계산하면 `nan` 이 된다.

## 주의

`numpy.logaddexp` 계열은 사용할 수 없다. `scipy` 는 허용 목록에 없다.

행 단위다. 축을 빠뜨리면 배열 전체의 합으로 나누게 되며, 그 결과는 shape 이 같아
`shape_mismatch` 없이 `value_mismatch` 로만 드러난다.
