"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import torch


def solve(params, grads, m, v, t, lr, beta1, beta2, eps):
    theta = torch.tensor(params, dtype=torch.float64, requires_grad=True)
    theta.grad = torch.tensor(grads, dtype=torch.float64)

    optimizer = torch.optim.Adam([theta], lr=lr, betas=(beta1, beta2), eps=eps)
    optimizer.state[theta] = {
        "step": torch.tensor(float(t - 1)),
        "exp_avg": torch.tensor(m, dtype=torch.float64),
        "exp_avg_sq": torch.tensor(v, dtype=torch.float64),
    }
    optimizer.step()

    state = optimizer.state[theta]
    return (
        theta.detach().numpy(),
        state["exp_avg"].numpy(),
        state["exp_avg_sq"].numpy(),
    )
