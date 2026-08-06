/**
 * 비밀번호 해시 — argon2id (docs/TECHNICAL.md §8.1).
 *
 * `@node-rs/argon2` 를 쓰는 이유: 플랫폼별 prebuilt 바이너리를 optionalDependencies 로
 * 배포해 설치 시 네이티브 빌드 스크립트가 돌지 않는다. 필요 없는 빌드 스크립트는
 * 필요 없는 공격면이다 (`pnpm-workspace.yaml` 의 allowBuilds 방침).
 */

import { hash, verify } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id`. ambient const enum 이라 `isolatedModules` 아래서는 import 할 수
 * 없어 값을 직접 쓴다. 이 값이 맞는지는 해시가 `$argon2id$` 로 시작하는지로 테스트가
 * 확인한다 — 상수를 옮겨 적었다는 사실보다 결과가 argon2id 라는 사실이 중요하다.
 */
const ARGON2ID = 2;

/** docs/TECHNICAL.md §8.1 이 명시한 파라미터. */
const PARAMS = Object.freeze({
  algorithm: ARGON2ID,
  memoryCost: 64 * 1024, // 64MB (KiB 단위)
  timeCost: 3,
  parallelism: 4,
});

/**
 * @param {string} plain
 * @returns {Promise<string>} PHC 문자열. `$argon2id$` 로 시작한다
 */
export async function hashPassword(plain) {
  return hash(plain, PARAMS);
}

/**
 * @param {string} storedHash
 * @param {string} plain
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(storedHash, plain) {
  try {
    return await verify(storedHash, plain, PARAMS);
  } catch {
    // 해시가 깨졌거나 다른 알고리즘이다. 인증 실패로 다룬다 —
    // 여기서 던지면 500 이 나가 계정 존재 여부가 드러난다.
    return false;
  }
}

/**
 * 저장된 해시가 argon2id 인지 확인한다. 마이그레이션·감사용 (DoD 9).
 * @param {string} storedHash
 * @returns {boolean}
 */
export function isArgon2id(storedHash) {
  return typeof storedHash === 'string' && storedHash.startsWith('$argon2id$');
}
