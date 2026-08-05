# 기대 판정: MLE — 약 768MB 를 실제로 채운다(512MB 상한 초과).
# zeros 가 아니라 ones 인 이유: zeros 는 지연 할당이라 커널이 실제 페이지를
# 잡지 않아 상한에 걸리지 않을 수 있다.
import numpy as np


def solve(x):
    big = np.ones((1024, 1024, 96), dtype=np.float64)
    return big[: x.shape[0], : x.shape[1], 0]
