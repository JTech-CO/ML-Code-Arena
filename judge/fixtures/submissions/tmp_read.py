# 기대 판정: AC — INV-8 시험의 2회차.
# 문제: sandbox-probe. tmp_write.py 바로 다음에 돌린다.
#
# 1회차가 남긴 /tmp 파일이 보이면 일부러 틀린 값을 돌려준다. 따라서
#   AC = 컨테이너가 재사용되지 않았다 (기대)
#   WA = 이전 제출의 /tmp 가 남아 있다 (INV-8 위반)
# 로 판정이 갈린다. 네트워크만 막고 컨테이너를 돌려 쓰면 격리는 절반만 성립한다.
import numpy as np


def solve(x):
    try:
        with open("/tmp/mlca_leak.txt") as handle:
            handle.read()
        leaked = True
    except OSError:
        leaked = False

    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    result = x / norms
    return result * 0 if leaked else result
