/**
 * 제출별 작업 디렉터리 준비·정리.
 *
 * 컨테이너에 `/judge:ro` 로 붙는 디렉터리를 만든다 (docs/TECHNICAL.md §4.2.1):
 *
 *     <root>/<submissionId>/
 *       solution.py    사용자 제출 원문
 *       spec.json      채점 명세
 *       cases/         입력·기대값
 *
 * 케이스를 문제 디렉터리에서 **복사**하는 이유: 중첩 바인드 마운트를 늘리지 않기 위해서다.
 * Windows Docker Desktop 은 마운트마다 번역 계층을 타므로, 마운트 수를 줄이는 편이
 * 실패 지점을 줄인다. Phase 1 의 케이스는 실행 시간이 1초를 넘지 않도록 크기가 잡혀 있어
 * 복사 비용이 무시할 수준이다.
 */

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EXECUTION_LIMITS } from '@mlca/shared';

/**
 * @typedef {object} JudgeSpec
 * @property {string} entrypoint
 * @property {number} time_limit_ms
 * @property {number} cpu_time_limit_ms
 * @property {number} memory_limit_mb
 * @property {number} output_limit_bytes
 * @property {number} case_count
 * @property {object} compare_options
 * @property {object} restrictions
 */

/**
 * 문제 정의(`problem.json`)를 러너가 읽는 명세로 옮긴다.
 *
 * 제한 수치는 문제가 덮어쓰지 않는 한 공유 상수를 쓴다. 같은 숫자가 두 곳에 있으면
 * 한쪽만 바뀌는 순간 격리 전제가 갈라진다.
 *
 * @param {Record<string, any>} problem `problem.json` 내용
 * @param {number} caseCount
 * @returns {JudgeSpec}
 */
export function buildSpec(problem, caseCount) {
  return {
    entrypoint: problem['entrypoint'],
    time_limit_ms: problem['time_limit_ms'] ?? EXECUTION_LIMITS.wallClockMs,
    cpu_time_limit_ms: problem['cpu_time_limit_ms'] ?? EXECUTION_LIMITS.cpuMs,
    memory_limit_mb: problem['memory_limit_mb'] ?? EXECUTION_LIMITS.memoryMb,
    output_limit_bytes: EXECUTION_LIMITS.outputBytes,
    case_count: caseCount,
    compare_options: problem['compare_options'] ?? {},
    restrictions: problem['restrictions'] ?? {},
  };
}

/**
 * `cases/` 안의 `case_NN.json` 개수를 센다. manifest 를 신뢰하지 않고 실제 파일을 본다.
 * @param {string} casesDir
 * @returns {Promise<number>}
 */
export async function countCases(casesDir) {
  const entries = await readdir(casesDir);
  return entries.filter((name) => /^case_\d{2}\.json$/.test(name)).length;
}

/**
 * @param {{ root: string, submissionId: string, source: string, spec: JudgeSpec, casesDir: string }} input
 * @returns {Promise<string>} 만들어진 작업 디렉터리 경로
 */
export async function prepareWorkDir(input) {
  const dir = path.join(input.root, input.submissionId);

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  await writeFile(path.join(dir, 'solution.py'), input.source, 'utf8');
  await writeFile(path.join(dir, 'spec.json'), JSON.stringify(input.spec), 'utf8');
  await cp(input.casesDir, path.join(dir, 'cases'), { recursive: true });

  return dir;
}

/**
 * 작업 디렉터리를 지운다. 남겨 두면 제출 원문이 디스크에 쌓인다.
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function cleanWorkDir(dir) {
  await rm(dir, { recursive: true, force: true });
}
