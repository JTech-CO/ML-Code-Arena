"""테스트케이스 직렬화 — 안전한 포맷만 허용한다 (INV-7, ADR-0003).

구조는 JSON, 배열은 `.npz` 에 담는다. 두 파일이 한 쌍이다.

    case_00.json   구조 (태그된 노드 트리)
    case_00.npz    배열 본체 (JSON 이 키로 참조)

**왜 태그 트리인가**: 평범한 JSON 으로 담으면 사용자 dict 와 우리 메타데이터를
구분할 수 없다. `{"__nd__": "a0"}` 같은 관용 키는 사용자가 같은 키를 쓰는 순간 깨진다.
모든 값을 `{"t": <태그>, ...}` 로 감싸면 충돌이 원리적으로 없고, 로더가 태그
화이트리스트로 검증할 수 있다.

**담을 수 있는 것**: None, bool, int, float, str, list, tuple, dict, numpy 배열.
ADR-0003 이 명시한 제약이며, 임의 Python 객체는 담지 못한다.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

#: 로더가 받아들이는 태그. 이 목록에 없는 태그는 거부한다.
_TAGS = frozenset({"none", "bool", "int", "float", "str", "list", "tuple", "dict", "nd"})

#: 허용 dtype kind. `O`(object)는 역직렬화 시 코드 실행 경로가 열리므로 절대 불가.
#: b=bool, i=int, u=uint, f=float, c=complex, S=bytes, U=str
_SAFE_DTYPE_KINDS = frozenset("biufcSU")


class CodecError(Exception):
    """직렬화·역직렬화 실패. 플랫폼 책임이며 사용자 코드 책임이 아니다."""


# --------------------------------------------------------------------------- 인코딩


def _encode(value, arrays: dict) -> dict:
    if value is None:
        return {"t": "none"}

    # bool 은 int 의 하위 타입이므로 반드시 먼저 본다.
    if isinstance(value, (bool, np.bool_)):
        return {"t": "bool", "v": bool(value)}

    if isinstance(value, (int, np.integer)):
        return {"t": "int", "v": int(value)}

    if isinstance(value, (float, np.floating)):
        f = float(value)
        if math.isnan(f):
            return {"t": "float", "s": "nan"}
        if math.isinf(f):
            return {"t": "float", "s": "inf" if f > 0 else "-inf"}
        # repr 로 담아 왕복 시 비트 손실이 없게 한다. JSON 숫자 파싱은 구현마다 다르다.
        return {"t": "float", "v": repr(f)}

    if isinstance(value, str):
        return {"t": "str", "v": value}

    if isinstance(value, np.ndarray):
        if value.dtype.kind not in _SAFE_DTYPE_KINDS:
            raise CodecError(f"허용되지 않는 배열 dtype: {value.dtype!r}")
        key = f"a{len(arrays)}"
        arrays[key] = value
        return {"t": "nd", "k": key}

    if isinstance(value, tuple):
        return {"t": "tuple", "v": [_encode(item, arrays) for item in value]}

    if isinstance(value, list):
        return {"t": "list", "v": [_encode(item, arrays) for item in value]}

    if isinstance(value, dict):
        return {
            "t": "dict",
            "v": [[_encode(k, arrays), _encode(v, arrays)] for k, v in value.items()],
        }

    raise CodecError(f"담을 수 없는 타입: {type(value).__name__}")


def dump(value, json_path: Path, npz_path: Path) -> None:
    """`value` 를 JSON + npz 한 쌍으로 저장한다."""
    arrays: dict = {}
    tree = _encode(value, arrays)

    json_path.write_text(json.dumps(tree, ensure_ascii=False), encoding="utf-8")

    # 배열이 없어도 빈 npz 를 만든다. 로더가 두 파일의 존재를 전제할 수 있어야 한다.
    np.savez(npz_path, **arrays)


# --------------------------------------------------------------------------- 디코딩


def _decode(node, arrays):
    if not isinstance(node, dict):
        raise CodecError(f"노드가 객체가 아니다: {type(node).__name__}")

    tag = node.get("t")
    if tag not in _TAGS:
        raise CodecError(f"허용되지 않는 태그: {tag!r}")

    if tag == "none":
        return None
    if tag == "bool":
        return bool(node["v"])
    if tag == "int":
        return int(node["v"])
    if tag == "float":
        if "s" in node:
            return {"nan": math.nan, "inf": math.inf, "-inf": -math.inf}[node["s"]]
        return float(node["v"])
    if tag == "str":
        return str(node["v"])
    if tag == "list":
        return [_decode(item, arrays) for item in node["v"]]
    if tag == "tuple":
        return tuple(_decode(item, arrays) for item in node["v"])
    if tag == "dict":
        return {_decode(k, arrays): _decode(v, arrays) for k, v in node["v"]}

    # tag == "nd"
    key = node["k"]
    if key not in arrays:
        raise CodecError(f"npz 에 없는 배열 키: {key!r}")
    return arrays[key]


def load(json_path: Path, npz_path: Path):
    """JSON + npz 한 쌍을 되읽는다.

    `np.load` 에 `allow_pickle=False` 를 명시하는 것이 1차 방어이고,
    되읽은 뒤 dtype kind 를 화이트리스트로 다시 확인하는 것이 2차 방어다.
    numpy 의 기본값에 기대지 않는다 — 기본값이 바뀌면 신뢰 경계가 조용히 무너진다.
    """
    try:
        tree = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CodecError(f"케이스 구조 파일을 읽을 수 없다: {json_path.name}") from exc

    try:
        with np.load(npz_path, allow_pickle=False) as handle:
            arrays = {}
            for key in handle.files:
                array = handle[key]
                if array.dtype.kind not in _SAFE_DTYPE_KINDS:
                    raise CodecError(f"허용되지 않는 배열 dtype: {array.dtype!r}")
                arrays[key] = array
    except CodecError:
        raise
    except (OSError, ValueError) as exc:
        raise CodecError(f"케이스 배열 파일을 읽을 수 없다: {npz_path.name}") from exc

    return _decode(tree, arrays)
