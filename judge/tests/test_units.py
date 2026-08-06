"""러너 순수 로직 단위 테스트 — 컨테이너 없이 돈다.

격리(INV-4·INV-8)는 컨테이너가 있어야 검증되지만, **판정을 가르는 로직**은
여기서 결정론적으로 확인할 수 있다. 정적 검사 규칙 하나가 조용히 무너지면
`FBD` 가 `AC` 로 바뀌고, 그건 컨테이너를 아무리 잘 잠가도 막지 못한다.

    python -m unittest discover -s judge/tests -v
"""

from __future__ import annotations

import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "runner"))

import numpy as np  # noqa: E402

import ast_check  # noqa: E402
import codec  # noqa: E402
import compare as compare_mod  # noqa: E402
import spec as spec_mod  # noqa: E402

STRICT = {
    "allowed_imports": ["numpy", "math"],
    "forbidden_attributes": ["numpy.linalg.norm"],
    "forbidden_builtins": ["eval", "exec", "compile", "__import__", "open", "input"],
    "required_entrypoint": "solve",
}


def rules(source: str, restrictions=None) -> set[str]:
    return {v.rule for v in ast_check.check(source, restrictions or STRICT)}


class AstCheckTest(unittest.TestCase):
    def test_정상_코드는_위반이_없다(self):
        self.assertEqual(rules("import numpy as np\ndef solve(x):\n    return x\n"), set())

    def test_화이트리스트에_없는_import_는_거부된다(self):
        self.assertIn("import_not_allowed", rules("import sklearn\ndef solve(x): return x\n"))

    def test_화이트리스트가_블랙리스트보다_우선한다(self):
        # numpy 는 허용 목록에 있으므로, 블랙리스트에 같이 있어도 허용 쪽이 이긴다 (ADR-0002).
        restrictions = {**STRICT, "forbidden_imports": ["numpy"]}
        self.assertEqual(rules("import numpy\ndef solve(x): return x\n", restrictions), set())

    def test_별칭을_거쳐도_금지_속성을_잡는다(self):
        source = "import numpy as np\ndef solve(x):\n    return np.linalg.norm(x)\n"
        self.assertIn("forbidden_attribute", rules(source))

    def test_from_import_로_들여온_금지_속성을_잡는다(self):
        source = "from numpy.linalg import norm\ndef solve(x):\n    return norm(x)\n"
        self.assertIn("forbidden_attribute", rules(source))

    def test_금지_빌트인_호출을_잡는다(self):
        self.assertIn("forbidden_builtin", rules("def solve(x):\n    return eval('1')\n"))
        self.assertIn("forbidden_builtin", rules("def solve(x):\n    return open('/tmp/x')\n"))

    def test_빈_화이트리스트는_모든_import_를_막는다(self):
        # 없음(키 부재)과 빈 목록은 다르다. 빈 목록은 "아무 것도 허용 안 함"이다.
        self.assertIn(
            "import_not_allowed",
            rules("import numpy\ndef solve(x): return x\n", {"allowed_imports": []}),
        )
        self.assertEqual(rules("import numpy\ndef solve(x): return x\n", {}), set())

    def test_항상_막는_모듈은_화이트리스트로도_열리지_않는다(self):
        # 하드 차단 > 화이트리스트 > 문제별 블랙리스트 순으로 우선한다.
        self.assertIn(
            "forbidden_import",
            rules("import os\ndef solve(x): return x\n", {"allowed_imports": ["os", "numpy"]}),
        )

    def test_설정과_무관하게_항상_막는_경로(self):
        loose = {"forbidden_builtins": []}
        for source in (
            "def solve(x):\n    return __import__('os')\n",
            "def solve(x):\n    return exec('1')\n",
            "def solve(x):\n    return globals()\n",
            "import importlib\ndef solve(x): return x\n",
            "import os\ndef solve(x): return x\n",
            "import subprocess\ndef solve(x): return x\n",
        ):
            with self.subTest(source=source.splitlines()[0]):
                self.assertNotEqual(rules(source, loose), set())

    def test_금지_연산자를_잡는다(self):
        # `numpy.matmul` 을 막아도 `a @ b` 가 남으면 행렬곱 문제가 성립하지 않는다.
        restrictions = {**STRICT, "forbidden_operators": ["@"]}
        self.assertIn(
            "forbidden_operator",
            rules("def solve(a, b):\n    return a @ b\n", restrictions),
        )
        self.assertIn(
            "forbidden_operator",
            rules("def solve(a, b):\n    a @= b\n    return a\n", restrictions),
        )
        # 제한하지 않은 연산자는 그대로 둔다.
        self.assertNotIn(
            "forbidden_operator",
            rules("def solve(a, b):\n    return a * b\n", restrictions),
        )

    def test_알_수_없는_연산자_제한은_거부된다(self):
        # 조용히 무시하면 오타난 제한이 아무 것도 막지 못한 채 통과한다.
        with self.assertRaises(ValueError):
            ast_check.check("def solve(x): return x\n", {"forbidden_operators": ["<<"]})

    def test_메서드_형태의_금지_속성을_잡는다(self):
        # `.dot` 는 이름만 보고 막는다. `a` 는 사용자가 정한 이름이라 경로로는 안 잡힌다.
        restrictions = {**STRICT, "forbidden_attributes": ["numpy.dot", ".dot"]}
        self.assertIn(
            "forbidden_attribute",
            rules("def solve(a, b):\n    return a.dot(b)\n", restrictions),
        )
        self.assertIn(
            "forbidden_attribute",
            rules("import numpy as np\ndef solve(a, b):\n    return np.dot(a, b)\n", restrictions),
        )
        # 점이 붙지 않은 항목은 전체 경로로만 맞춘다.
        self.assertNotIn(
            "forbidden_attribute",
            rules(
                "def solve(a, b):\n    return a.dot(b)\n",
                {**STRICT, "forbidden_attributes": ["numpy.dot"]},
            ),
        )

    def test_경로와_이름_규칙이_같은_줄을_두_번_보고하지_않는다(self):
        # `numpy.dot` 과 `.dot` 을 함께 거는 것은 정상이다 — 막는 경로가 다르다.
        # 그렇다고 `np.dot(a, b)` 한 줄에 거의 같은 문장이 두 번 뜨면 안 된다.
        restrictions = {**STRICT, "forbidden_attributes": ["numpy.dot", ".dot"]}
        violations = ast_check.check(
            "import numpy as np\ndef solve(a, b):\n    return np.dot(a, b)\n", restrictions
        )
        self.assertEqual(len(violations), 1, [v.message for v in violations])
        self.assertIn("numpy.dot", violations[0].message)

    def test_동적_속성_접근을_잡는다(self):
        source = "def solve(x):\n    return getattr(x, 'a' + 'b')\n"
        self.assertIn("dynamic_attribute", rules(source))

    def test_문자열_리터럴_getattr_은_허용한다(self):
        source = "def solve(x):\n    return getattr(x, 'shape')\n"
        self.assertNotIn("dynamic_attribute", rules(source))

    def test_인트로스펙션_탈출_경로를_잡는다(self):
        source = "def solve(x):\n    return solve.__globals__\n"
        self.assertIn("forbidden_attribute", rules(source))

    def test_star_import_와_상대_import_를_잡는다(self):
        self.assertIn("star_import", rules("from numpy import *\ndef solve(x): return x\n"))
        self.assertIn("relative_import", rules("from . import x\ndef solve(x): return x\n"))

    def test_같은_위반이_여러_번이어도_한_번만_보고한다(self):
        source = "import sklearn\nimport sklearn\ndef solve(x): return x\n"
        self.assertEqual(len(ast_check.check(source, STRICT)), 1)


class CodecTest(unittest.TestCase):
    def roundtrip(self, value):
        with tempfile.TemporaryDirectory() as tmp:
            json_path = Path(tmp) / "v.json"
            npz_path = Path(tmp) / "v.npz"
            codec.dump(value, json_path, npz_path)
            return codec.load(json_path, npz_path)

    def test_스칼라_왕복(self):
        for value in (None, True, False, 0, -7, 3.5, "문자열"):
            with self.subTest(value=value):
                self.assertEqual(self.roundtrip(value), value)

    def test_bool_은_int_로_퇴화하지_않는다(self):
        self.assertIsInstance(self.roundtrip(True), bool)
        self.assertIsInstance(self.roundtrip(1), int)

    def test_비유한_실수_왕복(self):
        self.assertTrue(math.isnan(self.roundtrip(math.nan)))
        self.assertEqual(self.roundtrip(math.inf), math.inf)
        self.assertEqual(self.roundtrip(-math.inf), -math.inf)

    def test_실수_정밀도가_보존된다(self):
        value = 0.1 + 0.2
        self.assertEqual(repr(self.roundtrip(value)), repr(value))

    def test_배열_왕복(self):
        array = np.arange(12, dtype=np.float64).reshape(3, 4) / 7.0
        restored = self.roundtrip(array)
        self.assertEqual(restored.shape, array.shape)
        self.assertTrue(np.array_equal(restored, array))

    def test_중첩_구조_왕복(self):
        value = {"a": [1, (2.5, np.ones((2, 2)))], "b": {"c": None}}
        restored = self.roundtrip(value)
        self.assertIsInstance(restored["a"][1], tuple)
        self.assertTrue(np.array_equal(restored["a"][1][1], np.ones((2, 2))))
        self.assertIsNone(restored["b"]["c"])

    def test_object_배열은_저장을_거부한다(self):
        with self.assertRaises(codec.CodecError):
            self.roundtrip(np.array([{"a": 1}, {"b": 2}], dtype=object))

    def test_담을_수_없는_타입은_거부한다(self):
        with self.assertRaises(codec.CodecError):
            self.roundtrip({1, 2, 3})

    def test_모르는_태그는_거부한다(self):
        with tempfile.TemporaryDirectory() as tmp:
            json_path = Path(tmp) / "v.json"
            npz_path = Path(tmp) / "v.npz"
            codec.dump(0, json_path, npz_path)
            json_path.write_text('{"t": "eval", "v": "1"}', encoding="utf-8")
            with self.assertRaises(codec.CodecError):
                codec.load(json_path, npz_path)

    def test_적대적_객체배열_파일을_거부한다(self):
        """INV-7 — 로더가 실제로 막는지 본다.

        grep 으로 "그 포맷을 안 쓴다"를 확인하는 것과, 오염된 파일을 실제로 던져 보고
        거부되는지 확인하는 것은 다른 명제다. 여기서는 dtype 이 객체인 `.npy` 를
        손으로 만들어 npz 에 넣는다. 로더가 이걸 받아들이면 역직렬화 시점에
        임의 코드가 돈다 (ADR-0003).
        """
        import struct
        import zipfile

        header = "{'descr': '|O', 'fortran_order': False, 'shape': (1,), }"
        prefix = b"\x93NUMPY\x01\x00"
        unpadded = len(prefix) + 2 + len(header) + 1
        padding = (64 - unpadded % 64) % 64
        header_bytes = (header + " " * padding + "\n").encode("latin1")
        npy = prefix + struct.pack("<H", len(header_bytes)) + header_bytes + b"payload"

        with tempfile.TemporaryDirectory() as tmp:
            json_path = Path(tmp) / "v.json"
            npz_path = Path(tmp) / "v.npz"
            codec.dump(np.zeros(1), json_path, npz_path)
            with zipfile.ZipFile(npz_path, "w") as archive:
                archive.writestr("a0.npy", npy)

            with self.assertRaises(codec.CodecError):
                codec.load(json_path, npz_path)

    def test_깨진_json_은_거부한다(self):
        with tempfile.TemporaryDirectory() as tmp:
            json_path = Path(tmp) / "v.json"
            npz_path = Path(tmp) / "v.npz"
            codec.dump(0, json_path, npz_path)
            json_path.write_text("{not json", encoding="utf-8")
            with self.assertRaises(codec.CodecError):
                codec.load(json_path, npz_path)


VALID_SPEC = {
    "entrypoint": "solve",
    "time_limit_ms": 10000,
    "cpu_time_limit_ms": 8000,
    "memory_limit_mb": 512,
    "output_limit_bytes": 1048576,
    "case_count": 3,
    "compare_options": {"rtol": 1e-5},
    "restrictions": {"allowed_imports": ["numpy"]},
}


class SpecTest(unittest.TestCase):
    """spec 은 플랫폼이 만든 파일이다. 여기서 나는 오류는 전부 IE 로 이어진다."""

    def load(self, payload):
        import json

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "spec.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            return spec_mod.load(path)

    def test_정상_명세를_읽는다(self):
        spec = self.load(VALID_SPEC)
        self.assertEqual(spec.entrypoint, "solve")
        self.assertEqual(spec.case_count, 3)

    def test_케이스_0건은_거부한다(self):
        """0 을 허용하면 케이스 루프가 안 돌고 모든 제출이 AC 가 된다."""
        with self.assertRaises(spec_mod.SpecError):
            self.load({**VALID_SPEC, "case_count": 0})

    def test_엔트리포인트가_식별자가_아니면_거부한다(self):
        for bad in ("", "not an identifier", "1solve", None, 42):
            with self.subTest(entrypoint=bad):
                with self.assertRaises(spec_mod.SpecError):
                    self.load({**VALID_SPEC, "entrypoint": bad})

    def test_bool_을_정수로_받지_않는다(self):
        # 파이썬에서 True 는 int 의 하위 타입이다. 그냥 isinstance 로 보면 통과한다.
        with self.assertRaises(spec_mod.SpecError):
            self.load({**VALID_SPEC, "case_count": True})

    def test_제한과_비교옵션이_객체가_아니면_거부한다(self):
        with self.assertRaises(spec_mod.SpecError):
            self.load({**VALID_SPEC, "restrictions": ["numpy"]})

    def test_상한이_0_이하면_거부한다(self):
        for key in ("time_limit_ms", "cpu_time_limit_ms", "memory_limit_mb", "output_limit_bytes"):
            with self.subTest(key=key):
                with self.assertRaises(spec_mod.SpecError):
                    self.load({**VALID_SPEC, key: 0})

    def test_없는_파일과_깨진_json_을_거부한다(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(spec_mod.SpecError):
                spec_mod.load(Path(tmp) / "없음.json")

            broken = Path(tmp) / "spec.json"
            broken.write_text("{not json", encoding="utf-8")
            with self.assertRaises(spec_mod.SpecError):
                spec_mod.load(broken)


DEFAULTS = {"rtol": 1e-5, "atol": 1e-8, "equal_nan": False}


class CompareTest(unittest.TestCase):
    def test_허용_오차_안이면_통과(self):
        self.assertIsNone(compare_mod.compare(1.0 + 1e-9, 1.0, DEFAULTS))

    def test_허용_오차_밖이면_불일치(self):
        result = compare_mod.compare(1.1, 1.0, DEFAULTS)
        self.assertIsNotNone(result)
        self.assertEqual(result.reason, "value_mismatch")

    def test_shape_불일치를_구분해서_알린다(self):
        expected = np.ones((3, 3))
        result = compare_mod.compare(np.ones(9), expected, DEFAULTS)
        self.assertEqual(result.reason, "shape_mismatch")
        self.assertEqual(result.detail["expected_shape"], [3, 3])
        self.assertEqual(result.detail["actual_shape"], [9])

    def test_리스트를_배열로_승격해_비교한다(self):
        self.assertIsNone(compare_mod.compare([[1.0, 2.0]], np.array([[1.0, 2.0]]), DEFAULTS))

    def test_bool_은_int_와_구분한다(self):
        self.assertEqual(compare_mod.compare(1, True, DEFAULTS).reason, "type_mismatch")
        self.assertEqual(compare_mod.compare(True, 1, DEFAULTS).reason, "type_mismatch")

    def test_nan_은_기본적으로_불일치(self):
        self.assertIsNotNone(compare_mod.compare(math.nan, math.nan, DEFAULTS))
        self.assertIsNone(compare_mod.compare(math.nan, math.nan, {**DEFAULTS, "equal_nan": True}))

    def test_길이_불일치를_알린다(self):
        result = compare_mod.compare([1, 2], [1, 2, 3], DEFAULTS)
        self.assertEqual(result.reason, "length_mismatch")

    def test_dict_키_집합_불일치를_알린다(self):
        result = compare_mod.compare({"a": 1}, {"b": 1}, DEFAULTS)
        self.assertEqual(result.reason, "key_mismatch")

    def test_require_dtype_은_명시했을_때만_본다(self):
        actual = np.array([1, 2], dtype=np.int64)
        expected = np.array([1, 2], dtype=np.float64)
        self.assertIsNone(compare_mod.compare(actual, expected, DEFAULTS))
        result = compare_mod.compare(actual, expected, {**DEFAULTS, "require_dtype": "float64"})
        self.assertEqual(result.reason, "dtype_mismatch")

    def test_불일치_상세에_기대값이_들어가지_않는다(self):
        """INV-5 — 이 테스트가 무너지면 기대값이 사용자에게 흘러간다."""
        expected = np.array([[123.456789, 987.654321], [11.1111, 22.2222]])
        actual = np.zeros((2, 2))
        result = compare_mod.compare(actual, expected, DEFAULTS)
        rendered = repr(result.to_dict())

        for value in expected.ravel().tolist():
            for text in (repr(value), f"{value:.4f}", f"{value:.6f}"):
                self.assertNotIn(text, rendered, f"기대값 {text} 이 불일치 상세에 실렸다")

    def test_dict_불일치_상세에_키_이름이_들어가지_않는다(self):
        """키 이름이 정답의 일부인 문제가 있다 (INV-5)."""
        result = compare_mod.compare({"guess": 1}, {"secret_answer": 1}, DEFAULTS)
        self.assertNotIn("secret_answer", repr(result.to_dict()))


#: 호스트에서는 judge/tests -> judge/fixtures, 컨테이너에서는
#: /opt/mlca/tests -> /opt/mlca/fixtures. 같은 상대 경로가 성립하도록 마운트를 맞췄다.
FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
RUNNER_DIR = Path(__file__).resolve().parent.parent / "runner"
PROBLEMS_DIR = Path(__file__).resolve().parent.parent.parent / "problems"

#: 안전하지 않은 직렬화를 **활성화**하는 패턴 (INV-7, M1 DoD 6).
#:
#: 존재가 아니라 활성화를 본다. `allow_pickle=False` 는 그 포맷을 쓰는 코드가 아니라
#: 끄는 코드이며, 단순 문자열 검색은 그 집행 지점을 위반으로 오인한다.
#:
#: 탐지기는 자기 자신에 걸리지 않아야 한다. 그래야 게이트를 `judge/` 전체에
#: 예외 없이 걸 수 있다. 앞의 세 패턴은 리터럴 `\s*`·`\b` 덕에 자연히 자기 회피가
#: 되지만, 확장자 패턴만은 그대로 두면 자기 자신과 매치하므로 쪼개서 쓴다.
_ENABLING_PATTERNS = [
    r"allow_pickle\s*=\s*True",
    r"^\s*import\s+pickle\b",
    r"^\s*from\s+pickle\s+import\b",
    r"\." + r"pkl\b",
]


class SerializationPolicyTest(unittest.TestCase):
    """INV-7 — 역직렬화 시 임의 코드가 실행되는 포맷을 켜지 않는다 (ADR-0003)."""

    def test_러너에_위험한_직렬화를_켜는_코드가_없다(self):
        import re

        offenders = []
        for path in sorted(RUNNER_DIR.glob("*.py")):
            for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                for pattern in _ENABLING_PATTERNS:
                    if re.search(pattern, line, re.IGNORECASE):
                        offenders.append(f"{path.name}:{lineno}: {line.strip()}")

        self.assertEqual(offenders, [], "안전하지 않은 직렬화를 켜는 코드가 있다")

    def test_로더가_허용_포맷만_읽는다(self):
        # 케이스 로더는 JSON + npz 쌍만 받는다. 다른 확장자를 읽는 경로가 없어야 한다.
        source = (RUNNER_DIR / "codec.py").read_text(encoding="utf-8")
        self.assertIn("np.load", source)
        self.assertIn("allow_" + "pickle=False", source, "로더가 명시적으로 끄지 않는다")


class ProblemDefinitionTest(unittest.TestCase):
    """문제 정의 자체의 건전성.

    출제자가 제한을 잘못 걸면 **정답 코드가 `FBD` 로 떨어진다**(RUNBOOK 23번).
    그 오류는 사용자가 신고하기 전까지 발견되지 않는다. 기준 구현을 자기 문제의
    제한으로 검사해 두면 출제 시점에 걸린다.

    M1 픽스처와 M6 의 실제 문제집을 **같은 검사**로 본다. 케이스 생성(`make_cases.py`)도
    같은 검사를 하지만 그쪽은 Docker 가 필요하다. 여기 있으면 `pnpm test` 만으로 잡힌다.
    """

    def problem_dirs(self):
        roots = [FIXTURES_DIR / "problems", PROBLEMS_DIR]
        found = []
        for root in roots:
            if not root.is_dir():
                continue
            found.extend(
                p
                for p in root.iterdir()
                if not p.name.startswith("_") and (p / "problem.json").is_file()
            )
        if not found:
            self.skipTest(f"문제 디렉터리가 없다: {roots}")
        return sorted(found)

    def test_기준_구현이_자기_문제의_제한을_통과한다(self):
        import json

        for problem_dir in self.problem_dirs():
            with self.subTest(problem=problem_dir.name):
                problem = json.loads((problem_dir / "problem.json").read_text(encoding="utf-8"))
                source = (problem_dir / "reference.py").read_text(encoding="utf-8")

                violations = ast_check.check(source, problem.get("restrictions", {}))
                self.assertEqual(
                    [v.rule for v in violations],
                    [],
                    f"{problem_dir.name}: 기준 구현이 제한에 걸린다 — 제한을 잘못 걸었다",
                )

    def test_문제가_엔트리포인트를_실제로_가지고_있다(self):
        import ast as ast_mod
        import json

        for problem_dir in self.problem_dirs():
            with self.subTest(problem=problem_dir.name):
                problem = json.loads((problem_dir / "problem.json").read_text(encoding="utf-8"))
                entrypoint = problem["entrypoint"]
                tree = ast_mod.parse((problem_dir / "reference.py").read_text(encoding="utf-8"))

                names = {
                    node.name
                    for node in ast_mod.walk(tree)
                    if isinstance(node, (ast_mod.FunctionDef, ast_mod.AsyncFunctionDef))
                }
                self.assertIn(entrypoint, names, f"{problem_dir.name}: reference.py 에 없다")

    def test_모든_문제가_제한을_필수로_갖는다(self):
        # ADR-0002 — 제한이 선택이면 출제자가 빠뜨리고, 빠뜨린 문제는 라이브러리 한 줄로 풀린다.
        import json

        for problem_dir in self.problem_dirs():
            with self.subTest(problem=problem_dir.name):
                problem = json.loads((problem_dir / "problem.json").read_text(encoding="utf-8"))
                restrictions = problem.get("restrictions")
                self.assertIsInstance(restrictions, dict, "restrictions 가 없다")
                self.assertIn("allowed_imports", restrictions, "화이트리스트가 없다")
                self.assertEqual(restrictions.get("required_entrypoint"), problem["entrypoint"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
