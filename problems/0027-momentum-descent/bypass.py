"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np
import torch


def solve(a, x0, lr, beta, steps):
    x = torch.tensor(x0, dtype=torch.float64, requires_grad=True)
    matrix = torch.tensor(a, dtype=torch.float64)
    optimizer = torch.optim.SGD([x], lr=lr, momentum=beta)

    for _ in range(steps):
        optimizer.zero_grad()
        (0.5 * x @ matrix @ x).backward()
        optimizer.step()

    buffer = optimizer.state[x]["momentum_buffer"]
    return (x.detach().numpy(), np.asarray(buffer.numpy()))
