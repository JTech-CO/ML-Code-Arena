"""채점 명세 로드 (`/judge/spec.json`).

spec 은 **플랫폼이 만든 파일**이다. 여기서 나는 오류는 사용자 책임이 아니므로
러너는 `IE` 로 판정한다 (docs/TECHNICAL.md §4.3).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


class SpecError(Exception):
    """명세가 없거나 형식이 어긋난다. 인프라 장애로 취급한다."""


@dataclass(frozen=True)
class Spec:
    entrypoint: str
    time_limit_ms: int
    cpu_time_limit_ms: int
    memory_limit_mb: int
    output_limit_bytes: int
    case_count: int
    compare_options: dict = field(default_factory=dict)
    restrictions: dict = field(default_factory=dict)


def _require_int(raw: dict, key: str, minimum: int = 1) -> int:
    value = raw.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise SpecError(f"spec.{key} 가 올바르지 않다: {value!r}")
    return value


def load(path: Path) -> Spec:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise SpecError(f"명세 파일을 읽을 수 없다: {path}") from exc
    except ValueError as exc:
        raise SpecError("명세 파일이 올바른 JSON 이 아니다") from exc

    if not isinstance(raw, dict):
        raise SpecError("명세 최상위가 객체가 아니다")

    entrypoint = raw.get("entrypoint")
    if not isinstance(entrypoint, str) or not entrypoint.isidentifier():
        raise SpecError(f"spec.entrypoint 가 올바르지 않다: {entrypoint!r}")

    compare_options = raw.get("compare_options") or {}
    restrictions = raw.get("restrictions") or {}
    if not isinstance(compare_options, dict) or not isinstance(restrictions, dict):
        raise SpecError("spec.compare_options / spec.restrictions 는 객체여야 한다")

    return Spec(
        entrypoint=entrypoint,
        time_limit_ms=_require_int(raw, "time_limit_ms"),
        cpu_time_limit_ms=_require_int(raw, "cpu_time_limit_ms"),
        memory_limit_mb=_require_int(raw, "memory_limit_mb"),
        output_limit_bytes=_require_int(raw, "output_limit_bytes"),
        # 최소 1건이다. 0 을 허용하면 케이스 루프가 한 번도 돌지 않고 그대로 `AC` 로
        # 떨어져 **모든 제출이 정답**이 된다. 케이스가 없는 것은 문제 적재 실패이지
        # 사용자 책임이 아니므로 여기서 `IE` 로 끊는다.
        case_count=_require_int(raw, "case_count", minimum=1),
        compare_options=compare_options,
        restrictions=restrictions,
    )
