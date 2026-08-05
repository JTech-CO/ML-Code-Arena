# 기대 판정: RE — 컨테이너에 네트워크가 없어 접속이 실패한다 (INV-4).
# 문제: sandbox-probe (socket 을 화이트리스트에 넣어 AST 단계를 통과시킨다)
#
# 접속에 성공하면 그대로 정답을 돌려주도록 짰다. 따라서
#   RE = 네트워크가 막혀 있다 (기대)
#   AC = 네트워크가 뚫려 있다 (INV-4 위반)
# 로 판정이 갈린다. 실패해도 AC 가 나오는 구조였다면 이 시험은 무의미하다.
import socket

import numpy as np


def solve(x):
    socket.create_connection(("1.1.1.1", 53), timeout=3).close()
    norms = np.sqrt((x**2).sum(axis=1, keepdims=True))
    return x / norms
