# 기대 판정: FBD
#
# 이 파일의 핵심은 판정 자체보다 **무엇이 실행되지 않았는가**다 (INV-6).
#
# 모듈 최상위에 부작용(파일 쓰기)과 예외를 함께 둔다.
#   - AST 검사가 import 보다 **먼저** 돌면: 이 줄들은 한 번도 실행되지 않고 FBD 가 나온다.
#   - 순서가 뒤집히면: exec_module 시점에 아래 raise 가 먼저 터져 RE 가 나온다.
#
# 즉 판정이 FBD 인지 RE 인지가 그대로 INV-6 의 관측 가능한 증거다.
# 컨테이너의 /tmp 는 tmpfs 라 밖에서 확인할 수 없으므로, 부작용을 판정으로
# 드러나게 만드는 이 구조가 필요하다.

open("/tmp/mlca_side_effect", "w").write("module top-level executed")
raise RuntimeError("모듈 최상위가 실행되었다 — INV-6 위반")

import sklearn.linear_model  # noqa: E402


def solve(x):
    model = sklearn.linear_model.LinearRegression()
    return model.fit(x, x).predict(x)
