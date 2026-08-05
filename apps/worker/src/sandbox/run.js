/**
 * 컨테이너 1회 실행 → 판정.
 *
 * 제출 1건당 컨테이너 1개를 만들고 즉시 지운다 (INV-8). 재사용하면 이전 제출이
 * `/tmp` 에 남긴 파일을 다음 제출이 읽는다. 네트워크만 막고 컨테이너를 돌려 쓰면
 * 격리는 절반만 성립한다.
 *
 * `--rm` 을 쓰지 않는 이유: OOM 여부는 `docker inspect` 로만 알 수 있는데
 * `--rm` 은 종료 즉시 컨테이너를 지워 조회할 대상을 없앤다. 대신 `finally` 에서
 * 반드시 지운다 — 결과 경로가 어디로 빠지든 컨테이너는 남지 않는다.
 */

import { randomUUID } from 'node:crypto';

import { EXECUTION_LIMITS, VERDICT } from '@mlca/shared';

import { docker, removeContainer } from './docker.js';
import { CONTAINER_NAME_PREFIX, buildRunArgs } from './options.js';

/** `timeout -s KILL` 이 죽였을 때의 종료 코드. 128 + SIGKILL(9). */
const EXIT_SIGKILL = 137;
/** GNU coreutils `timeout` 이 상한 도달을 알리는 종료 코드. */
const EXIT_TIMEOUT = 124;

/** 컨테이너가 끝나기를 기다리는 호스트 쪽 상한. 컨테이너가 굳는 경우의 마지막 안전망. */
const HOST_WAIT_MARGIN_MS = 20_000;

/**
 * @typedef {import('@mlca/shared').RunnerOutput} RunnerOutput
 *
 * @typedef {object} SandboxResult
 * @property {import('@mlca/shared').Verdict} verdict
 * @property {RunnerOutput|null} output 러너가 낸 JSON. 없으면 컨테이너가 비정상 종료한 것
 * @property {string} containerId INV-8 검증에 쓴다
 * @property {number|null} exitCode
 * @property {boolean} oomKilled
 * @property {string|null} error 인프라 오류 설명. 사용자에게 그대로 보이지 않는다
 */

/**
 * stdout 에서 러너의 결과 JSON 을 찾는다.
 *
 * 마지막 유효한 JSON 줄을 쓴다. 러너는 한 줄만 내지만, 컨테이너 런타임이 앞뒤로
 * 무언가를 섞는 경우가 있어 관대하게 읽는다.
 * @param {string} stdout
 * @returns {RunnerOutput|null}
 */
function parseRunnerOutput(stdout) {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line || !line.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && typeof parsed.verdict === 'string') {
        return /** @type {RunnerOutput} */ (parsed);
      }
    } catch {
      // 다음 줄을 본다.
    }
  }
  return null;
}

/**
 * 러너가 JSON 을 못 낸 경우의 판정. **컨테이너의 종료 상태만으로** 판단한다.
 *
 * @param {{ exitCode: number|null, oomKilled: boolean, hostTimedOut: boolean }} state
 * @returns {{ verdict: import('@mlca/shared').Verdict, error: string|null }}
 */
function classifyWithoutOutput(state) {
  // OOM 이 SIGKILL 보다 우선한다. cgroup OOM 도 137 로 나타나므로 순서가 중요하다.
  if (state.oomKilled) {
    return { verdict: VERDICT.MLE, error: null };
  }
  if (state.hostTimedOut || state.exitCode === EXIT_TIMEOUT || state.exitCode === EXIT_SIGKILL) {
    return { verdict: VERDICT.TLE, error: null };
  }
  return {
    verdict: VERDICT.IE,
    error: `러너가 결과를 내지 못했다 (exit=${state.exitCode})`,
  };
}

/**
 * 제출 1건을 격리 컨테이너에서 채점한다.
 *
 * @param {{ judgeDir: string, runnerDir: string, image?: string, timeLimitMs?: number, submissionId?: string }} request
 * @returns {Promise<SandboxResult>}
 */
export async function runInSandbox(request) {
  const timeLimitMs = request.timeLimitMs ?? EXECUTION_LIMITS.wallClockMs;
  const containerName = `${CONTAINER_NAME_PREFIX}${request.submissionId ?? randomUUID()}`;

  let containerId = '';

  try {
    const created = await docker(
      buildRunArgs({
        containerName,
        judgeDir: request.judgeDir,
        runnerDir: request.runnerDir,
        ...(request.image === undefined ? {} : { image: request.image }),
        timeLimitMs,
      }),
      { timeoutMs: 60_000 },
    );

    if (created.code !== 0) {
      return {
        verdict: VERDICT.IE,
        output: null,
        containerId: '',
        exitCode: created.code,
        oomKilled: false,
        error: `컨테이너 생성 실패: ${created.stderr.trim() || created.stdout.trim()}`,
      };
    }

    containerId = created.stdout.trim();

    const waited = await docker(['wait', containerName], {
      timeoutMs: timeLimitMs + HOST_WAIT_MARGIN_MS,
    });
    const hostTimedOut = waited.timedOut;
    const exitCode = hostTimedOut ? null : Number.parseInt(waited.stdout.trim(), 10);

    const inspected = await docker(
      ['inspect', containerName, '--format', '{{.State.OOMKilled}} {{.State.ExitCode}}'],
      { timeoutMs: 30_000 },
    );
    const [oomFlag, inspectedExit] = inspected.stdout.trim().split(/\s+/);
    const oomKilled = oomFlag === 'true';

    const logs = await docker(['logs', containerName], { timeoutMs: 30_000 });
    const output = parseRunnerOutput(logs.stdout);

    const effectiveExit = Number.isNaN(exitCode ?? Number.NaN)
      ? Number.parseInt(inspectedExit ?? '', 10)
      : exitCode;

    if (output === null) {
      const classified = classifyWithoutOutput({
        exitCode: Number.isNaN(effectiveExit ?? Number.NaN) ? null : effectiveExit,
        oomKilled,
        hostTimedOut,
      });
      return {
        verdict: classified.verdict,
        output: null,
        containerId,
        exitCode: effectiveExit ?? null,
        oomKilled,
        error: classified.error,
      };
    }

    // 러너가 JSON 을 냈어도 커널이 OOM 으로 죽였다면 그쪽이 진실이다.
    if (oomKilled) {
      return { verdict: VERDICT.MLE, output, containerId, exitCode: effectiveExit ?? null, oomKilled, error: null };
    }

    return {
      verdict: /** @type {import('@mlca/shared').Verdict} */ (output.verdict),
      output,
      containerId,
      exitCode: effectiveExit ?? null,
      oomKilled,
      error: output.error ?? null,
    };
  } catch (error) {
    return {
      verdict: VERDICT.IE,
      output: null,
      containerId,
      exitCode: null,
      oomKilled: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // INV-8 — 결과가 어디로 빠지든 컨테이너는 반드시 사라진다.
    await removeContainer(containerName);
  }
}
