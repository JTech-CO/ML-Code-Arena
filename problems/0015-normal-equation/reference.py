import numpy as np


def _gauss(a, b):
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

    solution = np.zeros(n)
    for row in range(n - 1, -1, -1):
        solution[row] = (
            rhs[row] - (matrix[row, row + 1 :] * solution[row + 1 :]).sum()
        ) / matrix[row, row]

    return solution


def solve(x, y):
    design = np.hstack([np.ones((x.shape[0], 1)), x])
    return _gauss(design.T @ design, design.T @ y)
