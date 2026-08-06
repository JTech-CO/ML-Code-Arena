"""AST 정적 검사 — `structural` 모드 (docs/TECHNICAL.md §4.1.2, ADR-0002).

**이 모듈은 사용자 코드를 실행하지 않는다.** 텍스트를 파싱해 트리만 본다.
러너는 이 검사를 통과한 뒤에야 `import` 한다 (INV-6). 순서가 역전되면 모듈 최상위
코드가 먼저 실행되므로 검사 자체가 무의미해진다.

**우선순위**: 하드 차단 > `allowed_imports` 화이트리스트 > 문제별 블랙리스트 (ADR-0002).

화이트리스트에 있으면 문제별 블랙리스트를 보지 않는다. 두 목록이 충돌할 때 어느 쪽이
이기는지 정해져 있지 않으면 출제자가 결과를 예측할 수 없다. 다만 `os`·`subprocess` 처럼
여기서 하드 차단하는 모듈은 화이트리스트로도 열리지 않는다 — 문제 정의의 실수 하나가
격리 전제를 무너뜨리게 두지 않는다.

블랙리스트가 보조인 이유는 유지비다. 블랙리스트 단독은 새 라이브러리가 나올 때마다
갱신해야 하고, 갱신을 한 번 놓치면 그 문제는 라이브러리 한 줄로 풀린다.

**한계**: 정교한 우회를 완전히 막지는 못한다. Phase 1 의 목표는 "무심코 라이브러리를
쓰는 경우"를 잡는 것이며, 실행 시점 import hook 은 Phase 2 보완 수단이다.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass

#: 설정과 무관하게 항상 막는 호출. 문자열을 코드로 바꾸거나 네임스페이스를 통째로 여는 경로다.
_ALWAYS_FORBIDDEN_CALLS = frozenset(
    {"__import__", "eval", "exec", "compile", "globals", "locals", "vars"}
)

#: 설정과 무관하게 항상 막는 모듈.
_ALWAYS_FORBIDDEN_MODULES = frozenset({"importlib", "imp", "ctypes", "subprocess", "os", "sys"})

#: 인트로스펙션으로 샌드박스를 빠져나가는 고전 경로. ML 연습 코드에 쓸 일이 없다.
#: `__name__`·`__class__`·`__dict__` 는 정상 사용이 있어 넣지 않는다.
_FORBIDDEN_DUNDER_ATTRS = frozenset(
    {
        "__globals__",
        "__builtins__",
        "__subclasses__",
        "__bases__",
        "__mro__",
        "__code__",
        "__closure__",
        "__reduce__",
        "__reduce_ex__",
        "__getattribute__",
    }
)

#: 두 번째 인자가 문자열 리터럴이 아니면 막는 호출. 동적 속성 접근은 검사를 우회한다.
_DYNAMIC_ATTR_CALLS = frozenset({"getattr", "setattr", "delattr", "hasattr"})

#: `forbidden_operators` 가 받는 토큰 -> AST 노드.
#:
#: 연산자를 막을 수 있어야 하는 이유는 행렬곱이다. `numpy.matmul`·`numpy.dot` 을 전부
#: 막아도 `a @ b` 한 줄이 남으면 "행렬곱을 직접 구현하라"는 문제가 성립하지 않는다.
#: 모듈·속성 이름만 막는 검사에는 이 경로가 보이지 않는다.
_OPERATOR_NODES = {
    "@": ast.MatMult,
    "**": ast.Pow,
    "//": ast.FloorDiv,
    "%": ast.Mod,
}


@dataclass(frozen=True)
class Violation:
    """위반 1건. `message` 는 그대로 사용자에게 보인다 — 무엇을 고쳐야 하는지 적는다."""

    rule: str
    message: str
    line: int

    def to_dict(self) -> dict:
        return {"rule": self.rule, "message": self.message, "line": self.line}


class _Checker(ast.NodeVisitor):
    def __init__(self, restrictions: dict) -> None:
        self.violations: list[Violation] = []

        # 없음(None)과 빈 목록([])을 구분한다. 없으면 화이트리스트를 쓰지 않는 것이고,
        # 비어 있으면 "아무 것도 허용하지 않는다"는 뜻이다. 둘을 같게 다루면
        # 실수로 비운 화이트리스트가 조용히 무제한이 된다.
        allowed = restrictions.get("allowed_imports")
        self.allowed_imports = None if allowed is None else frozenset(allowed)
        self.forbidden_imports = frozenset(restrictions.get("forbidden_imports") or ())
        self.forbidden_attributes = frozenset(restrictions.get("forbidden_attributes") or ())
        self.forbidden_builtins = frozenset(restrictions.get("forbidden_builtins") or ())

        #: AST 노드 타입 -> 표기. 알 수 없는 토큰은 조용히 버리지 않고 그대로 둔다 —
        #: 오타난 제한이 통과하면 그 문제는 막을 생각이던 것을 막지 못한다.
        self.forbidden_operators: dict[type, str] = {}
        for token in restrictions.get("forbidden_operators") or ():
            node_type = _OPERATOR_NODES.get(token)
            if node_type is None:
                raise ValueError(f"알 수 없는 연산자 제한: {token!r}")
            self.forbidden_operators[node_type] = token

        #: 지역 이름 -> 정규화된 모듈/속성 경로. `import numpy as np` 면 np -> numpy.
        self.aliases: dict[str, str] = {}

    # ------------------------------------------------------------------ 도우미

    def _add(self, rule: str, message: str, node: ast.AST) -> None:
        self.violations.append(Violation(rule, message, getattr(node, "lineno", 0)))

    def _check_module(self, module: str, node: ast.AST) -> None:
        root = module.split(".", 1)[0]

        if root in _ALWAYS_FORBIDDEN_MODULES:
            self._add(
                "forbidden_import",
                f"`{root}` 모듈은 사용할 수 없습니다.",
                node,
            )
            return

        # 화이트리스트가 블랙리스트보다 우선한다 (ADR-0002).
        # 화이트리스트에 있으면 블랙리스트를 보지 않고 그대로 통과시킨다 — 두 목록이
        # 충돌할 때 어느 쪽이 이기는지가 정해져 있지 않으면 출제자가 결과를 예측할 수 없다.
        if self.allowed_imports is not None:
            if root not in self.allowed_imports:
                allowed = ", ".join(sorted(self.allowed_imports)) or "없음"
                self._add(
                    "import_not_allowed",
                    f"`{root}` 은(는) 이 문제에서 허용되지 않습니다. 허용: {allowed}",
                    node,
                )
            return

        if root in self.forbidden_imports:
            self._add(
                "forbidden_import",
                f"이 문제는 `{root}` 사용이 금지되어 있습니다.",
                node,
            )

    def _resolve(self, node: ast.AST) -> str | None:
        """속성 체인을 정규화된 경로로 편다. `np.linalg.svd` -> `numpy.linalg.svd`."""
        parts: list[str] = []
        current = node

        while isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value

        if not isinstance(current, ast.Name):
            return None

        base = self.aliases.get(current.id, current.id)
        parts.reverse()
        return ".".join([base, *parts]) if parts else base

    def _check_path(self, path: str | None, node: ast.AST) -> bool:
        if path and path in self.forbidden_attributes:
            self._add(
                "forbidden_attribute",
                f"이 문제는 `{path}` 사용이 금지되어 있습니다. 직접 구현해야 합니다.",
                node,
            )
            return True
        return False

    def _check_bare_attr(self, attr: str, node: ast.AST) -> None:
        """`.dot` 처럼 점으로 시작하는 항목은 **이름만** 보고 막는다.

        `numpy.dot(a, b)` 를 막아도 `a.dot(b)` 가 남으면 "직접 구현하라"는 문제가
        성립하지 않는다. 그런데 `a` 는 사용자가 정한 변수 이름이라 경로로는 잡히지
        않는다. numpy 배열은 거의 모든 함수를 메서드로도 제공하므로, 경로 형태만
        막는 제한은 절반만 막는 제한이다.
        """
        if f".{attr}" in self.forbidden_attributes:
            self._add(
                "forbidden_attribute",
                f"이 문제는 `.{attr}` 사용이 금지되어 있습니다. 직접 구현해야 합니다.",
                node,
            )

    # ------------------------------------------------------------------ import

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self._check_module(alias.name, node)
            local = alias.asname or alias.name.split(".", 1)[0]
            self.aliases[local] = alias.name if alias.asname else alias.name.split(".", 1)[0]
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.level:
            self._add(
                "relative_import",
                "상대 import 는 사용할 수 없습니다. 제출은 단일 파일입니다.",
                node,
            )
            return

        module = node.module or ""
        self._check_module(module, node)

        for alias in node.names:
            if alias.name == "*":
                self._add(
                    "star_import",
                    "`from ... import *` 는 사용할 수 없습니다. 이름을 명시하세요.",
                    node,
                )
                continue
            full = f"{module}.{alias.name}"
            self._check_path(full, node)
            self.aliases[alias.asname or alias.name] = full

        self.generic_visit(node)

    # ------------------------------------------------------------------ 호출·속성

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func

        if isinstance(func, ast.Name):
            name = func.id

            if name in _ALWAYS_FORBIDDEN_CALLS:
                self._add(
                    "forbidden_builtin",
                    f"`{name}()` 은(는) 사용할 수 없습니다.",
                    node,
                )
            elif name in self.forbidden_builtins:
                self._add(
                    "forbidden_builtin",
                    f"이 문제는 `{name}()` 사용이 금지되어 있습니다.",
                    node,
                )

            if name in _DYNAMIC_ATTR_CALLS and len(node.args) >= 2:
                target = node.args[1]
                if not (isinstance(target, ast.Constant) and isinstance(target.value, str)):
                    self._add(
                        "dynamic_attribute",
                        f"`{name}()` 의 속성 이름은 문자열 리터럴이어야 합니다.",
                        node,
                    )

        # import 로 들여온 이름을 그대로 호출하는 경로: `from numpy.linalg import svd; svd(a)`
        self._check_path(self._resolve(func), node)

        self.generic_visit(node)

    # ------------------------------------------------------------------ 연산자

    def visit_BinOp(self, node: ast.BinOp) -> None:
        token = self.forbidden_operators.get(type(node.op))
        if token is not None:
            self._add(
                "forbidden_operator",
                f"이 문제는 `{token}` 연산자 사용이 금지되어 있습니다. 직접 구현해야 합니다.",
                node,
            )
        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign) -> None:
        token = self.forbidden_operators.get(type(node.op))
        if token is not None:
            self._add(
                "forbidden_operator",
                f"이 문제는 `{token}=` 연산자 사용이 금지되어 있습니다. 직접 구현해야 합니다.",
                node,
            )
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr in _FORBIDDEN_DUNDER_ATTRS:
            self._add(
                "forbidden_attribute",
                f"`{node.attr}` 속성 접근은 사용할 수 없습니다.",
                node,
            )

        # 경로가 이미 걸렸으면 이름 규칙은 보지 않는다. 문제 정의가 `numpy.dot` 과
        # `.dot` 을 함께 걸어 두는 것은 정상인데(전자는 `from numpy import dot` 을,
        # 후자는 `a.dot(b)` 를 막는다), 둘 다 보고하면 같은 줄에 거의 같은 문장이
        # 두 번 뜬다.
        if not self._check_path(self._resolve(node), node):
            self._check_bare_attr(node.attr, node)
        self.generic_visit(node)


def check(source: str, restrictions: dict) -> list[Violation]:
    """소스 텍스트를 검사한다. 빈 리스트면 통과.

    `ast.parse` 실패는 여기서 다루지 않는다 — 러너가 `CE` 로 판정한다.
    """
    return check_tree(ast.parse(source), restrictions)


def check_tree(tree: ast.AST, restrictions: dict) -> list[Violation]:
    """이미 파싱된 트리를 검사한다. 러너는 파싱을 한 번만 하려고 이쪽을 쓴다."""
    checker = _Checker(restrictions)
    checker.visit(tree)

    # 같은 위반이 여러 줄에서 반복될 때 사용자에게 같은 문장을 도배하지 않는다.
    seen: set[tuple[str, str]] = set()
    unique: list[Violation] = []
    for violation in checker.violations:
        key = (violation.rule, violation.message)
        if key not in seen:
            seen.add(key)
            unique.append(violation)
    return unique
