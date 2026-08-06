import numpy as np


def solve(params, grads, m, v, t, lr, beta1, beta2, eps):
    new_m = beta1 * m + (1.0 - beta1) * grads
    new_v = beta2 * v + (1.0 - beta2) * grads * grads

    corrected_m = new_m / (1.0 - beta1**t)
    corrected_v = new_v / (1.0 - beta2**t)

    new_params = params - lr * corrected_m / (np.sqrt(corrected_v) + eps)

    return (new_params, new_m, new_v)
