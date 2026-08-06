2차 형식 `f(x) = ½ xᵀ A x` 에 모멘텀 경사하강법을 적용하라. 기울기는 `A x` 다.

    v ← β v + g
    x ← x - lr · v

`v` 는 `0` 벡터에서 시작한다. 첫 스텝의 `v` 는 `g` 와 같으므로 일반 경사하강과 같다.

## 입력

    solve(a: np.ndarray, x0: np.ndarray, lr: float, beta: float, steps: int)
        -> tuple[np.ndarray, np.ndarray]

`a` 는 shape `(n, n)` 의 대칭 float 배열, `x0` 는 shape `(n,)` 다.
`steps` 번 갱신한 뒤 `(x, v)` 를 반환한다. 둘 다 shape `(n,)` 다.

## 예제

    solve(np.array([[1.0]]), np.array([1.0]), 0.1, 0.9, 2)

    ->  ([0.729], [1.71])

`g₁ = 1.0` → `v₁ = 1.0` → `x₁ = 0.9`.
`g₂ = 0.9` → `v₂ = 0.9·1.0 + 0.9 = 1.71` → `x₂ = 0.9 - 0.171 = 0.729`.

## 주의

`numpy.polyder` · `numpy.polyval` · `numpy.gradient` 는 사용할 수 없다.
`scipy.optimize` 와 `torch` 는 허용 목록 밖이다.

**속도를 먼저 갱신하고 그 값으로 위치를 옮긴다.** 순서를 바꾸면 한 스텝씩 밀린다.

`v` 를 `(1 - β) g` 로 섞는 변형(지수이동평균 형태)도 있지만 이 문제는 위 식이다.
두 식은 `lr` 이 `(1 - β)` 배 다른 것과 같아 궤적이 완전히 달라진다.
