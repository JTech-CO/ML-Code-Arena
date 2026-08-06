/**
 * 문제 슬러그 → 디스크 경로 해석.
 *
 * 워커와 로컬 CLI 가 **같은 구현**을 쓴다. 둘이 다르게 찾으면 CLI 에서 채점되던 문제가
 * 큐를 타면 안 되는 일이 생기고, 그 차이는 재현하기 전까지 보이지 않는다.
 */

import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/worker/src/sandbox/ 에서 저장소 루트까지 네 단계. */
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** @param {string} target */
async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} [root]
 * @returns {string}
 */
export function repoRoot(root) {
  return root ?? process.env['MLCA_REPO_ROOT'] ?? DEFAULT_ROOT;
}

/**
 * `problems/<NNNN-slug>/` 규약과 M1 픽스처를 모두 본다.
 *
 * @param {string} slug
 * @param {string} [root]
 * @returns {Promise<string>}
 * @throws 문제 디렉터리가 없으면 던진다. 이것은 문제 적재 실패이지 사용자 책임이 아니므로
 *         호출부는 `IE` 로 이어가야 한다.
 */
export async function resolveProblemDir(slug, root) {
  const base = repoRoot(root);

  const fixture = path.join(base, 'judge', 'fixtures', 'problems', slug);
  if (await exists(path.join(fixture, 'problem.json'))) return fixture;

  const problemsRoot = path.join(base, 'problems');
  if (await exists(problemsRoot)) {
    const entries = await readdir(problemsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === slug || entry.name.replace(/^\d+-/, '') === slug) {
        const candidate = path.join(problemsRoot, entry.name);
        if (await exists(path.join(candidate, 'problem.json'))) return candidate;
      }
    }
  }

  throw new Error(`문제 디렉터리를 찾을 수 없다: ${slug}`);
}

/**
 * 러너 디렉터리. 컨테이너에 읽기 전용으로 붙는다.
 * @param {string} [root]
 * @returns {string}
 */
export function runnerDir(root) {
  return path.join(repoRoot(root), 'judge', 'runner');
}

/**
 * 제출별 작업 디렉터리의 루트.
 * @param {string} [root]
 * @returns {string}
 */
export function workRoot(root) {
  return process.env['JUDGE_WORK_DIR'] || path.join(repoRoot(root), '.judge-work');
}
