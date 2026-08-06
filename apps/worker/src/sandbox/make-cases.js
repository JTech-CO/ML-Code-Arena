/**
 * 케이스 생성 컨테이너 실행 (INV-10).
 *
 * `tools/judge-cli.js --prepare` 와 `tools/problem-sync.js` 가 **같은 함수**를 쓴다.
 * 둘이 다른 방식으로 컨테이너를 띄우면, 한쪽에서 만든 기대값과 다른 쪽에서 만든
 * 기대값이 달라질 수 있고 그 차이는 정답 제출의 `WA` 로만 드러난다.
 */

import { randomUUID } from 'node:crypto';

import { docker, removeContainer } from './docker.js';
import { buildMakeCasesArgs } from './options.js';

/**
 * @typedef {object} CaseManifest
 * @property {number} case_count
 * @property {string} entrypoint
 * @property {string} digest 재생성 대조용 sha256
 * @property {string} numpy 기대값을 만든 numpy 버전
 * @property {number} reference_ms 기준 구현이 전 케이스를 도는 데 걸린 시간
 */

/**
 * 문제 디렉터리의 `cases/` 를 다시 만든다. 기존 케이스는 러너가 지우고 새로 쓴다.
 *
 * @param {object} target
 * @param {string} target.problemDir
 * @param {string} target.runnerDir
 * @param {string} [target.image]
 * @returns {Promise<CaseManifest>}
 * @throws 생성이 실패하면 컨테이너의 stderr 를 담아 던진다. 여기 실패는 출제자의
 *         `generator.py`·`reference.py`·제한 설정 문제이므로 원문을 그대로 보여 준다.
 */
export async function makeCases(target) {
  const containerName = `mlca-mkcases-${randomUUID()}`;

  // 고아 컨테이너가 같은 이름을 쥐고 있으면 생성이 실패한다. 이름에 UUID 가 들어가므로
  // 충돌은 사실상 없지만, 앞선 실행이 중간에 죽었을 때를 위해 한 번 지우고 시작한다.
  await removeContainer(containerName);

  try {
    const created = await docker(
      buildMakeCasesArgs({
        containerName,
        problemDir: target.problemDir,
        runnerDir: target.runnerDir,
        ...(target.image === undefined ? {} : { image: target.image }),
      }),
      { timeoutMs: 120_000 },
    );
    if (created.code !== 0) {
      throw new Error(`케이스 생성 컨테이너를 만들 수 없다: ${created.stderr.trim()}`);
    }

    const waited = await docker(['wait', containerName], { timeoutMs: 300_000 });
    const logs = await docker(['logs', containerName], { timeoutMs: 60_000 });
    const exitCode = Number.parseInt(waited.stdout.trim(), 10);

    if (exitCode !== 0) {
      throw new Error(`케이스 생성 실패 (exit=${exitCode})\n${logs.stderr.trim()}`);
    }

    const line = logs.stdout.trim().split('\n').at(-1) ?? '';
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`케이스 매니페스트를 읽을 수 없다: ${line.slice(0, 200)}`);
    }
  } finally {
    await removeContainer(containerName);
  }
}
