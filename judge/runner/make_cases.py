"""테스트케이스 생성 — `generator.py` + `reference.py` 로 기대값을 만든다 (INV-10).

**기대값을 손으로 쓰지 않는 이유**: 손으로 쓰면 부동소수점 자릿수·shape·dtype 이
미묘하게 어긋나고, 그 오류는 정답 제출을 `WA` 로 떨어뜨린다. 그리고 그 사실은
사용자가 신고하기 전까지 발견되지 않는다.

컨테이너 안에서 도는 이유는 하나다. 기대값은 **채점이 도는 것과 정확히 같은
numpy 버전**에서 나와야 한다. 호스트에서 만들면 버전 차이가 곧 `WA` 오탐이 된다.

문제 디렉터리 규약 (docs/TECHNICAL.md §9):
    problem.json   메타·제한·비교 옵션
    generator.py   `generate()` -> 케이스 입력 목록
    reference.py   정답 구현. 엔트리포인트 이름은 problem.json 을 따른다
    cases/         산출물. 커밋하지 않는다 (INV-2)
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path
from types import ModuleType

PROBLEM_DIR = Path(os.environ.get("MLCA_PROBLEM_DIR", "/problem"))

sys.path.insert(0, str(Path(__file__).resolve().parent))

import codec  # noqa: E402


def _load(path: Path, name: str) -> ModuleType:
    loader_spec = importlib.util.spec_from_file_location(name, path)
    if loader_spec is None or loader_spec.loader is None:
        raise RuntimeError(f"{path.name} 을(를) 적재할 수 없다")
    module = importlib.util.module_from_spec(loader_spec)
    loader_spec.loader.exec_module(module)
    return module


def main() -> int:
    problem = json.loads((PROBLEM_DIR / "problem.json").read_text(encoding="utf-8"))
    entrypoint = problem["entrypoint"]

    generator = _load(PROBLEM_DIR / "generator.py", "generator")
    reference = _load(PROBLEM_DIR / "reference.py", "reference")

    solve = getattr(reference, entrypoint, None)
    if not callable(solve):
        raise RuntimeError(f"reference.py 에 엔트리포인트 `{entrypoint}` 가 없다")

    payloads = list(generator.generate())
    if not payloads:
        raise RuntimeError("generator.generate() 가 케이스를 하나도 내놓지 않았다")

    cases_dir = PROBLEM_DIR / "cases"
    if cases_dir.exists():
        shutil.rmtree(cases_dir)
    cases_dir.mkdir(parents=True)

    digest = hashlib.sha256()

    for index, payload in enumerate(payloads):
        if isinstance(payload, dict) and ("args" in payload or "kwargs" in payload):
            expected = solve(*payload.get("args", []), **payload.get("kwargs", {}))
        elif isinstance(payload, (list, tuple)):
            expected = solve(*payload)
        else:
            expected = solve(payload)

        codec.dump(payload, cases_dir / f"case_{index:02d}.json", cases_dir / f"case_{index:02d}.npz")
        codec.dump(expected, cases_dir / f"expect_{index:02d}.json", cases_dir / f"expect_{index:02d}.npz")

        for name in (f"case_{index:02d}", f"expect_{index:02d}"):
            for suffix in (".json", ".npz"):
                digest.update((cases_dir / f"{name}{suffix}").read_bytes())

    manifest = {
        "case_count": len(payloads),
        "entrypoint": entrypoint,
        # 재생성 결과가 같은지 대조하는 데 쓴다 (INV-10, problem-sync --verify).
        "digest": digest.hexdigest(),
        "numpy": __import__("numpy").__version__,
    }
    (cases_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
