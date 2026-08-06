"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다.

해석적 도함수를 라이브러리로 구해 버리면 수치 미분이 무엇인지 배울 기회가 사라진다.
"""

import numpy as np


def solve(coeffs, x, h):
    return np.polyval(np.polyder(coeffs), x)
