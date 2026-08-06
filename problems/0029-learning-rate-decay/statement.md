세 가지 학습률 감쇠 스케줄을 구현하라. 스텝 `t` 는 **`0` 부터 `total_steps - 1`** 까지다.

    "step"         lr₀ · γ^(t // step_size)
    "exponential"  lr₀ · exp(-γ t)
    "cosine"       lr_min + (lr₀ - lr_min) · (1 + cos(π t / total_steps)) / 2

`t = 0` 에서는 세 스케줄 모두 `lr₀` 를 준다.

## 입력

    solve(kind: str, lr0: float, total_steps: int,
          gamma: float, step_size: int, lr_min: float) -> np.ndarray

`kind` 는 `"step"` · `"exponential"` · `"cosine"` 중 하나다. 결과는 shape
`(total_steps,)` 의 float 배열이며 `t = 0, 1, ..., total_steps - 1` 순이다.

쓰이지 않는 인자도 항상 주어진다 — `"cosine"` 에서 `gamma` 와 `step_size` 는 무시한다.

## 예제

    solve("step", 1.0, 7, 0.5, 3, 0.0)

    ->  [1.0, 1.0, 1.0, 0.5, 0.5, 0.5, 0.25]

`t = 0, 1, 2` 는 `t // 3 = 0` 이라 `γ⁰ = 1`, `t = 3, 4, 5` 는 `γ¹ = 0.5` 다.

    solve("cosine", 1.0, 3, 0.0, 1, 0.0)

    ->  [1.0, 0.75, 0.25]

## 주의

`torch.optim.lr_scheduler` 는 허용 목록 밖이다.

계단형에서 **정수 나눗셈(`//`)** 을 쓴다. 실수 나눗셈을 쓰면 매 스텝 조금씩 줄어드는
지수형이 되어 버린다.

코사인의 분모는 `total_steps` 이지 `total_steps - 1` 이 아니다. 마지막 스텝에서 정확히
`lr_min` 에 도달하지 않는다.
