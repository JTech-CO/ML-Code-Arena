"""라이브러리 한 줄 풀이 — `FBD` 를 받아야 한다.

`numpy` 가 허용 목록에 없으므로 import 단계에서 걸린다.
"""

import numpy as np


def solve(shape_a, shape_b):
    try:
        return np.broadcast_shapes(shape_a, shape_b)
    except ValueError:
        return None
