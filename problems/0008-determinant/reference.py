import numpy as np


def solve(a):
    matrix = a.astype(float).copy()
    n = matrix.shape[0]
    result = 1.0

    for column in range(n):
        pivot = column + int(np.argmax(np.abs(matrix[column:, column])))

        if abs(matrix[pivot, column]) < 1e-12:
            return 0.0

        if pivot != column:
            matrix[[column, pivot]] = matrix[[pivot, column]]
            result = -result

        result *= matrix[column, column]

        factors = matrix[column + 1 :, column] / matrix[column, column]
        matrix[column + 1 :, column:] -= factors[:, None] * matrix[column, column:]

    return float(result)
