# 채점 런타임 이미지 — docs/TECHNICAL.md §3.2 · §5.
#
# 이 이미지는 **런타임만** 담는다. 러너 코드(`judge/runner/`)와 제출·케이스는
# 워커가 읽기 전용 볼륨으로 붙인다. 러너를 굽지 않는 덕에 러너를 고칠 때마다
# 이미지를 다시 만들 필요가 없고, `docker build judge/image` 한 줄이 유지된다.
#
# 빌드: docker build -t mlca-python:3.11 judge/image

FROM python:3.11-slim

# pip 캐시·빌드 도구를 남기지 않는다. 공격면과 이미지 크기를 동시에 줄인다.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --require-hashes=false -r /tmp/requirements.txt \
    && rm -f /tmp/requirements.txt \
    && find /usr/local -name '__pycache__' -type d -prune -exec rm -rf {} + \
    && rm -rf /root/.cache

# 사용자 코드는 nobody 로 돈다. 워커가 --user 로 다시 강제하지만(단일 상수 모듈),
# 이미지 기본값을 맞춰 두면 이미지를 직접 돌릴 때도 root 로 떨어지지 않는다.
USER 65534:65534

# HOME 을 /tmp 로 두는 이유: --read-only 루트에서 파이썬이 쓸 곳이 tmpfs 뿐이다.
# PYTHONDONTWRITEBYTECODE 가 없으면 읽기 전용 마운트에 .pyc 를 쓰려다 실패한다.
ENV HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=0

WORKDIR /judge

# 기본 커맨드는 두지 않는다. 실행 커맨드와 시간 제한은 워커의 격리 옵션 상수
# 한 곳에서만 조립한다 (HARNESS.md §4.3).
