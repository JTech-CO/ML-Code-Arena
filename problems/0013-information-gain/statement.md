이진 분할의 엔트로피와 정보 이득을 계산하라. 결정 트리가 분할 기준을 고를 때 쓰는 값이다.

    H(S) = -sum over i of pᵢ log₂ pᵢ

`pᵢ = 0` 인 항은 `0` 으로 본다 (`0 log 0 = 0`).

정보 이득은 부모의 엔트로피에서 자식들의 **가중 평균** 엔트로피를 뺀 값이다.

    IG = H(부모) - ( |왼쪽|/|부모| · H(왼쪽) + |오른쪽|/|부모| · H(오른쪽) )

## 입력

    solve(labels: np.ndarray, mask: np.ndarray, n_classes: int)
        -> tuple[float, float, float]

`labels` 는 `0` 이상 `n_classes` 미만의 정수 배열이고, `mask` 는 같은 길이의 부울
배열이다. `mask` 가 `True` 인 표본이 왼쪽 자식, `False` 가 오른쪽 자식이다.

`(부모 엔트로피, 가중 평균 자식 엔트로피, 정보 이득)` 을 이 순서로 반환한다.
한쪽 자식이 비어 있으면 그 자식의 엔트로피는 `0.0` 이고 가중치도 `0` 이다.

## 예제

    solve(np.array([0, 0, 1, 1]),
          np.array([True, True, False, False]), 2)

    ->  (1.0, 0.0, 1.0)

부모는 반씩 섞여 엔트로피가 `1.0` 이고, 두 자식은 각각 순수하므로 `0.0` 이다.
완벽한 분할이므로 이득이 부모 엔트로피와 같다.

## 주의

`numpy.bincount` · `numpy.unique` · `collections.Counter` 는 사용할 수 없다.
`scipy.stats.entropy` 도 허용 목록 밖이다.

밑은 **2** 다. 자연로그를 쓰면 모든 값이 `ln 2` 배로 어긋난다.

`log(0)` 을 계산하지 않도록 비율이 `0` 인 클래스는 건너뛴다.
