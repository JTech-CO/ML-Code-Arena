"""채점 러너 — 컨테이너 안에서 도는 유일한 진입점.

실행 순서는 바꾸지 않는다 (docs/TECHNICAL.md §4.2.2, INV-6):

    spec 로드 -> 소스 읽기 -> 파싱(CE) -> **AST 정적 검사(FBD)** -> import
             -> 엔트리포인트 확인(RE) -> 케이스 실행 -> 비교 -> JSON 1줄 출력

`import` 가 검사보다 앞서면 모듈 최상위 코드가 먼저 실행된다. 그 순간 검사는
"실행을 막는 장치"가 아니라 "이미 실행된 코드에 대한 사후 보고"가 된다.

**INV-5**: stdout·stderr 어디에도 기대값을 쓰지 않는다. 사용자 코드의 출력은
캡처해서 버리고, 트레이스백은 사용자 파일 프레임만 남긴다.

러너 자신은 이미지에 구워져 있고(`/opt/mlca/runner`), 마운트되는 `/judge` 에는
사용자 제출·명세·케이스만 있다. 러너 코드가 제출별 작업 디렉터리에 복사되지 않으므로
호스트 쪽 실수로 러너가 변조될 경로가 없다.
"""

from __future__ import annotations

import ast
import io
import json
import os
import resource
import signal
import sys
import time
import traceback
from pathlib import Path
from types import ModuleType

JUDGE_DIR = Path(os.environ.get("MLCA_JUDGE_DIR", "/judge"))
SOLUTION_PATH = JUDGE_DIR / "solution.py"
SPEC_PATH = JUDGE_DIR / "spec.json"
CASES_DIR = JUDGE_DIR / "cases"

_RUNNER_DIR = str(Path(__file__).resolve().parent)
sys.path.insert(0, _RUNNER_DIR)

import ast_check  # noqa: E402
import codec  # noqa: E402
import compare as compare_mod  # noqa: E402
import spec as spec_mod  # noqa: E402


class _WallClockExceeded(Exception):
    pass


class _CpuExceeded(Exception):
    pass


class _OutputTooLarge(Exception):
    pass


class _MissingEntrypoint(Exception):
    def __init__(self, name: str) -> None:
        super().__init__(f"엔트리포인트 `{name}` 함수를 찾을 수 없습니다.")


class _CappedStream(io.TextIOBase):
    """사용자 출력을 받아 상한까지만 세고 버린다.

    내용을 보관하지 않는 것은 의도다. 사용자 출력은 판정에 쓰이지 않고,
    보관하면 메모리 상한을 사용자가 좌우하게 된다.
    """

    def __init__(self, limit: int) -> None:
        self._limit = limit
        self.written = 0

    def write(self, text: str) -> int:  # type: ignore[override]
        self.written += len(text)
        if self.written > self._limit:
            raise _OutputTooLarge
        return len(text)

    def writable(self) -> bool:  # type: ignore[override]
        return True


def _restore() -> None:
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__


def _peak_memory_mb() -> int:
    # Linux 의 ru_maxrss 단위는 KB 다.
    return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)


def emit(verdict: str, cases: list, total_ms: int, error=None, detail=None) -> None:
    """결과 JSON 을 진짜 stdout 에 한 줄로 쓴다 (docs/TECHNICAL.md §4.2.3)."""
    payload = {
        "verdict": verdict,
        "cases": cases,
        "total_runtime_ms": total_ms,
        "peak_memory_mb": _peak_memory_mb(),
        "error": error,
    }
    if detail is not None:
        payload["detail"] = detail
    sys.__stdout__.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.__stdout__.flush()


def _user_traceback(exc: BaseException) -> str:
    """사용자 파일 프레임만 남긴 한 줄 요약.

    러너 프레임을 지우는 이유는 둘이다. 사용자에게 플랫폼 내부 경로를 보일 이유가 없고,
    러너 프레임이 드러나면 기대값 처리 경로가 노출된다 (INV-5).
    """
    frames = [
        frame
        for frame in traceback.extract_tb(exc.__traceback__)
        if Path(frame.filename).name == SOLUTION_PATH.name
    ]
    location = f" (solution.py {frames[-1].lineno}행)" if frames else ""
    return f"{type(exc).__name__}: {exc}{location}"


def _install_limits(spec: spec_mod.Spec) -> None:
    cpu_seconds = max(1, spec.cpu_time_limit_ms // 1000)
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
    except (ValueError, OSError):
        # 컨테이너가 이미 더 낮은 상한을 걸어둔 경우다. 그대로 둔다 — 완화하지 않는다.
        pass

    def on_cpu(_signum, _frame):
        raise _CpuExceeded

    def on_alarm(_signum, _frame):
        raise _WallClockExceeded

    signal.signal(signal.SIGXCPU, on_cpu)
    signal.signal(signal.SIGALRM, on_alarm)
    signal.setitimer(signal.ITIMER_REAL, spec.time_limit_ms / 1000.0)


def _load_pair(prefix: str, index: int):
    stem = f"{prefix}_{index:02d}"
    return codec.load(CASES_DIR / f"{stem}.json", CASES_DIR / f"{stem}.npz")


def _call(entry, payload):
    """케이스 입력을 엔트리포인트 호출로 편다.

    입력은 위치 인자 리스트이거나 `{"args": [...], "kwargs": {...}}` 형태다.
    """
    if isinstance(payload, dict) and ("args" in payload or "kwargs" in payload):
        return entry(*payload.get("args", []), **payload.get("kwargs", {}))
    if isinstance(payload, (list, tuple)):
        return entry(*payload)
    return entry(payload)


def _import_solution() -> ModuleType:
    import importlib.util

    loader_spec = importlib.util.spec_from_file_location("solution", SOLUTION_PATH)
    if loader_spec is None or loader_spec.loader is None:
        raise ImportError("solution 모듈을 적재할 수 없습니다.")
    module = importlib.util.module_from_spec(loader_spec)
    loader_spec.loader.exec_module(module)
    return module


def main() -> None:
    # --- 1. 명세 -----------------------------------------------------------
    try:
        judge_spec = spec_mod.load(SPEC_PATH)
    except spec_mod.SpecError as exc:
        emit("IE", [], 0, error=f"spec: {exc}")
        return

    # --- 2. 소스 텍스트 (아직 실행하지 않는다) -------------------------------
    try:
        source = SOLUTION_PATH.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        emit("CE", [], 0, detail={"message": "소스를 UTF-8 로 읽을 수 없습니다."})
        return
    except OSError as exc:
        emit("IE", [], 0, error=f"solution: {exc}")
        return

    # --- 3. 파싱 (CE) ------------------------------------------------------
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError) as exc:
        line = getattr(exc, "lineno", 0) or 0
        emit("CE", [], 0, detail={"message": str(getattr(exc, "msg", exc)), "line": line})
        return

    # --- 4. 정적 검사 (FBD) — 반드시 import 보다 먼저 (INV-6) ----------------
    try:
        violations = ast_check.check_tree(tree, judge_spec.restrictions)
    except ValueError as exc:
        # 제한 설정 자체가 잘못됐다. 사용자 책임이 아니므로 `FBD` 가 아니라 `IE` 다.
        emit("IE", [], 0, error=f"restrictions: {exc}")
        return
    if violations:
        emit("FBD", [], 0, detail={"violations": [v.to_dict() for v in violations]})
        return

    # 사용자 코드가 러너 모듈을 import 할 경로를 없앤다.
    if _RUNNER_DIR in sys.path:
        sys.path.remove(_RUNNER_DIR)

    # --- 5. 제한 설치 -------------------------------------------------------
    _install_limits(judge_spec)

    captured = _CappedStream(judge_spec.output_limit_bytes)
    sys.stdout = captured
    sys.stderr = captured

    cases: list = []
    total_ms = 0

    try:
        # --- 6. import (여기서 처음 사용자 코드가 실행된다) ------------------
        module = _import_solution()

        entry = getattr(module, judge_spec.entrypoint, None)
        if entry is None or not callable(entry):
            raise _MissingEntrypoint(judge_spec.entrypoint)

        # --- 7. 케이스 실행 → 비교 -----------------------------------------
        for index in range(judge_spec.case_count):
            payload = _load_pair("case", index)
            expected = _load_pair("expect", index)

            started = time.perf_counter()
            actual = _call(entry, payload)
            # 버림이 아니라 반올림이다. 버리면 1.9ms 가 1ms 로 보고되고,
            # 사용자가 비교하는 실행 시간이 계통적으로 짧게 나온다.
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            total_ms += elapsed_ms

            mismatch = compare_mod.compare(actual, expected, judge_spec.compare_options)
            if mismatch is not None:
                cases.append(
                    {
                        "index": index,
                        "verdict": "WA",
                        "runtime_ms": elapsed_ms,
                        "detail": mismatch.to_dict(),
                    }
                )
                _finish("WA", cases, total_ms)
                return

            cases.append({"index": index, "verdict": "AC", "runtime_ms": elapsed_ms})

    except _WallClockExceeded:
        _finish("TLE", cases, total_ms, detail={"limit_ms": judge_spec.time_limit_ms})
        return
    except _CpuExceeded:
        _finish("TLE", cases, total_ms, detail={"limit_ms": judge_spec.cpu_time_limit_ms, "kind": "cpu"})
        return
    except _OutputTooLarge:
        _finish(
            "RE",
            cases,
            total_ms,
            detail={"message": f"출력이 상한({judge_spec.output_limit_bytes} 바이트)을 넘었습니다."},
        )
        return
    except MemoryError:
        _finish("MLE", cases, total_ms, detail={"limit_mb": judge_spec.memory_limit_mb})
        return
    except _MissingEntrypoint as exc:
        _finish("RE", cases, total_ms, detail={"message": str(exc)})
        return
    except codec.CodecError as exc:
        # 케이스 파일이 깨졌다. 플랫폼 책임이므로 사용자 통계에서 제외된다.
        _finish("IE", cases, total_ms, error=f"case: {exc}")
        return
    except BaseException as exc:  # noqa: BLE001 - SystemExit·사용자 예외를 모두 잡는다
        _finish("RE", cases, total_ms, detail={"message": _user_traceback(exc)})
        return

    _finish("AC", cases, total_ms)


def _finish(verdict: str, cases: list, total_ms: int, error=None, detail=None) -> None:
    signal.setitimer(signal.ITIMER_REAL, 0)
    _restore()
    emit(verdict, cases, total_ms, error=error, detail=detail)


if __name__ == "__main__":
    try:
        main()
    except BaseException as exc:  # noqa: BLE001 - 러너 자신의 사고는 인프라 장애다
        _restore()
        emit("IE", [], 0, error=f"runner: {type(exc).__name__}: {exc}")
