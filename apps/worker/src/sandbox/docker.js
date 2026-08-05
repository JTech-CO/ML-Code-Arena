/**
 * Docker CLI 호출 래퍼.
 *
 * 워커는 사용자 코드를 **직접 실행하지 않는다.** 오직 컨테이너를 만들고 지울 뿐이다
 * (docs/TECHNICAL.md §3.3). 이 전제가 깨지면 소켓 마운트가 곧 호스트 루트 권한이 된다.
 */

import { spawn } from 'node:child_process';

/**
 * @typedef {object} ExecResult
 * @property {number|null} code 종료 코드. 시그널로 죽었으면 null
 * @property {string|null} signal
 * @property {string} stdout
 * @property {string} stderr
 * @property {boolean} timedOut 호스트 쪽 상한에 걸렸는지
 */

/**
 * `docker` 를 한 번 호출한다.
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<ExecResult>}
 */
export function docker(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const timer =
      options.timeoutMs === undefined
        ? null
        : setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, options.timeoutMs);

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

/**
 * Docker 데몬이 응답하는지 확인한다.
 * @returns {Promise<{ ok: boolean, version?: string, message?: string }>}
 */
export async function checkDaemon() {
  try {
    const result = await docker(['version', '--format', '{{.Server.Version}}'], {
      timeoutMs: 20_000,
    });
    if (result.code === 0 && result.stdout.trim()) {
      return { ok: true, version: result.stdout.trim() };
    }
    return { ok: false, message: (result.stderr || result.stdout).trim() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 컨테이너를 강제로 지운다. 실패해도 던지지 않는다 — 정리 실패가 채점 결과를 바꾸면 안 된다.
 * @param {string} nameOrId
 * @returns {Promise<void>}
 */
export async function removeContainer(nameOrId) {
  try {
    await docker(['rm', '--force', '--volumes', nameOrId], { timeoutMs: 30_000 });
  } catch {
    // 무시한다. 고아 컨테이너는 이름 접두사로 따로 청소한다.
  }
}
