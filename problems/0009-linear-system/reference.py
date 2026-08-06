import numpy as np


def solve(a, b):
    matrix = a.astype(float).copy()
    rhs = b.astype(float).copy()
    n = matrix.shape[0]

    for column in range(n):
        pivot = column + int(np.argmax(np.abs(matrix[column:, column])))
        if pivot != column:
            matrix[[column, pivot]] = matrix[[pivot, column]]
            rhs[[column, pivot]] = rhs[[pivot, column]]

        factors = matrix[column + 1 :, column] / matrix[column, column]
        matrix[column + 1 :, column:] -= factors[:, None] * matrix[column, column:]
        rhs[column + 1 :] -= factors * rhs[column]

    x = np.zeros(n)
    for row in range(n - 1, -1, -1):
        x[row] = (rhs[row] - (matrix[row, row + 1 :] * x[row + 1 :]).sum()) / matrix[row, row]

    return x
