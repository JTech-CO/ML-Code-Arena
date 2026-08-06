"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다."""

import numpy as np


def solve(a, b, c, x0, lr, steps):
    derivative = np.polyder([a, b, c])
    trajectory = [float(x0)]
    for _ in range(steps):
        trajectory.append(trajectory[-1] - lr * float(np.polyval(derivative, trajectory[-1])))
    return np.array(trajectory)
