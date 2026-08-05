"""`tolerance` 비교 (docs/TECHNICAL.md §4.1.1).

**INV-5**: 이 모듈이 만드는 어떤 값도 기대값을 담지 않는다. 불일치 상세로 내보내는 것은
`shape` · 길이 · 타입 이름 · 사유 코드까지다. 값 자체는 절대 나가지 않는다.

shape 를 노출하는 것은 백서 §4.2.3 이 명시한 예외다. ML 입문자의 최다 오류가 축(axis)
실수이므로 이 피드백의 교육적 가치가 크고, shape 는 정답 수치를 알려주지 않는다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Mismatch:
    """불일치 1건. 여기 담기는 것은 전부 사용자에게 노출 가능한 정보여야 한다 (INV-5)."""

    reason: str
    detail: dict

    def to_dict(self) -> dict:
        return {"reason": self.reason, **self.detail}


def _type_name(value) -> str:
    if isinstance(value, np.ndarray):
        return "ndarray"
    if isinstance(value, (bool, np.bool_)):
        return "bool"
    if isinstance(value, (int, np.integer)):
        return "int"
    if isinstance(value, (float, np.floating)):
        return "float"
    return type(value).__name__


def _scalars_close(actual: float, expected: float, rtol: float, atol: float, equal_nan: bool):
    if math.isnan(actual) and math.isnan(expected):
        return equal_nan
    if math.isinf(actual) or math.isinf(expected):
        return actual == expected
    return abs(actual - expected) <= atol + rtol * abs(expected)


def compare(actual, expected, options: dict) -> Mismatch | None:
    """일치하면 None, 아니면 `Mismatch` 를 돌려준다."""
    rtol = float(options.get("rtol", 1e-5))
    atol = float(options.get("atol", 1e-8))
    equal_nan = bool(options.get("equal_nan", False))
    require_dtype = options.get("require_dtype")

    return _compare(actual, expected, rtol, atol, equal_nan, require_dtype)


def _compare(actual, expected, rtol, atol, equal_nan, require_dtype) -> Mismatch | None:
    # --- None -------------------------------------------------------------
    if expected is None:
        if actual is not None:
            return Mismatch("type_mismatch", {"expected_type": "None", "actual_type": _type_name(actual)})
        return None

    # --- bool: int 의 하위 타입이므로 반드시 먼저 본다 ------------------------
    if isinstance(expected, (bool, np.bool_)):
        if not isinstance(actual, (bool, np.bool_)):
            return Mismatch("type_mismatch", {"expected_type": "bool", "actual_type": _type_name(actual)})
        if bool(actual) != bool(expected):
            return Mismatch("value_mismatch", {"expected_type": "bool", "actual_type": "bool"})
        return None

    # --- str --------------------------------------------------------------
    if isinstance(expected, str):
        if not isinstance(actual, str):
            return Mismatch("type_mismatch", {"expected_type": "str", "actual_type": _type_name(actual)})
        if actual != expected:
            return Mismatch("value_mismatch", {"expected_type": "str", "actual_type": "str"})
        return None

    # --- ndarray ----------------------------------------------------------
    if isinstance(expected, np.ndarray):
        if require_dtype is not None and not isinstance(actual, np.ndarray):
            return Mismatch(
                "dtype_mismatch",
                {"expected_dtype": str(require_dtype), "actual_type": _type_name(actual)},
            )

        # 리스트/튜플로 돌려주는 것은 흔하고, 교육 목적상 막을 이유가 없다.
        # 수치가 맞는지가 핵심이므로 배열로 승격해 비교한다.
        if isinstance(actual, (list, tuple)):
            try:
                actual = np.asarray(actual)
            except (ValueError, TypeError):
                return Mismatch(
                    "type_mismatch",
                    {"expected_type": "ndarray", "actual_type": _type_name(actual)},
                )

        if not isinstance(actual, np.ndarray):
            return Mismatch("type_mismatch", {"expected_type": "ndarray", "actual_type": _type_name(actual)})

        if actual.shape != expected.shape:
            return Mismatch(
                "shape_mismatch",
                {"expected_shape": list(expected.shape), "actual_shape": list(actual.shape)},
            )

        if require_dtype is not None and str(actual.dtype) != str(require_dtype):
            return Mismatch(
                "dtype_mismatch",
                {"expected_dtype": str(require_dtype), "actual_dtype": str(actual.dtype)},
            )

        if expected.dtype.kind in "SU" or actual.dtype.kind in "SU":
            if actual.dtype.kind != expected.dtype.kind or not np.array_equal(actual, expected):
                return Mismatch("value_mismatch", {"expected_shape": list(expected.shape)})
            return None

        try:
            close = np.allclose(actual, expected, rtol=rtol, atol=atol, equal_nan=equal_nan)
        except (TypeError, ValueError):
            return Mismatch(
                "type_mismatch",
                {"expected_type": "ndarray", "actual_type": _type_name(actual)},
            )

        if not close:
            return Mismatch("value_mismatch", {"expected_shape": list(expected.shape)})
        return None

    # --- 스칼라 ------------------------------------------------------------
    if isinstance(expected, (int, float, np.integer, np.floating)):
        if isinstance(actual, (bool, np.bool_)) or not isinstance(
            actual, (int, float, np.integer, np.floating)
        ):
            return Mismatch(
                "type_mismatch",
                {"expected_type": _type_name(expected), "actual_type": _type_name(actual)},
            )
        if not _scalars_close(float(actual), float(expected), rtol, atol, equal_nan):
            return Mismatch(
                "value_mismatch",
                {"expected_type": _type_name(expected), "actual_type": _type_name(actual)},
            )
        return None

    # --- list / tuple ------------------------------------------------------
    if isinstance(expected, (list, tuple)):
        expected_type = "tuple" if isinstance(expected, tuple) else "list"
        if not isinstance(actual, (list, tuple)):
            return Mismatch(
                "type_mismatch",
                {"expected_type": expected_type, "actual_type": _type_name(actual)},
            )
        if len(actual) != len(expected):
            return Mismatch(
                "length_mismatch",
                {"expected_length": len(expected), "actual_length": len(actual)},
            )
        for index, (a, e) in enumerate(zip(actual, expected)):
            mismatch = _compare(a, e, rtol, atol, equal_nan, require_dtype)
            if mismatch is not None:
                return Mismatch(mismatch.reason, {**mismatch.detail, "at": index})
        return None

    # --- dict --------------------------------------------------------------
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return Mismatch("type_mismatch", {"expected_type": "dict", "actual_type": _type_name(actual)})
        if set(actual.keys()) != set(expected.keys()):
            # 키 개수까지만 알린다. 기대 키 이름은 정답의 일부일 수 있다 (INV-5).
            return Mismatch(
                "key_mismatch",
                {"expected_key_count": len(expected), "actual_key_count": len(actual)},
            )
        for key in expected:
            mismatch = _compare(actual[key], expected[key], rtol, atol, equal_nan, require_dtype)
            if mismatch is not None:
                return Mismatch(mismatch.reason, {**mismatch.detail})
        return None

    # 여기 오면 기대값 생성이 잘못된 것이다. 사용자 책임이 아니다.
    raise TypeError(f"비교할 수 없는 기대값 타입: {type(expected).__name__}")
