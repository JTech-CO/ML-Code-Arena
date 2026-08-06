"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np
import torch


def solve(kind, lr0, total_steps, gamma, step_size, lr_min):
    parameter = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.SGD([parameter], lr=lr0)

    if kind == "step":
        scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size, gamma)
    elif kind == "exponential":
        scheduler = torch.optim.lr_scheduler.ExponentialLR(optimizer, float(np.exp(-gamma)))
    else:
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, total_steps, lr_min)

    rates = []
    for _ in range(total_steps):
        rates.append(optimizer.param_groups[0]["lr"])
        scheduler.step()
    return np.array(rates)
