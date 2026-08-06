/** 사용자 조회·생성. 비밀번호 해시는 절대 밖으로 내보내지 않는다. */

import { getPool } from './pool.js';

/**
 * @typedef {object} UserRow
 * @property {string} id
 * @property {string} email
 * @property {string} handle
 * @property {string} password_hash
 */

/**
 * @param {{ email: string, handle: string, passwordHash: string }} input
 * @returns {Promise<{ id: string, handle: string, email: string }>}
 */
export async function createUser(input) {
  const result = await getPool().query(
    `INSERT INTO users (email, handle, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, handle`,
    [input.email, input.handle, input.passwordHash],
  );
  return result.rows[0];
}

/**
 * @param {string} email
 * @returns {Promise<UserRow|null>}
 */
export async function findByEmail(email) {
  const result = await getPool().query(
    `SELECT id, email, handle, password_hash FROM users WHERE email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

/**
 * @param {string} id
 * @returns {Promise<{ id: string, email: string, handle: string }|null>}
 */
export async function findById(id) {
  const result = await getPool().query(`SELECT id, email, handle FROM users WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

/**
 * 이메일·핸들 중복 여부를 한 번에 본다. 어느 쪽이 중복인지 알려주면 계정 목록을
 * 확인하는 통로가 되므로, 호출부는 구분 없이 하나의 메시지로 응답한다.
 * @param {{ email: string, handle: string }} input
 * @returns {Promise<boolean>}
 */
export async function exists(input) {
  const result = await getPool().query(
    `SELECT 1 FROM users WHERE email = $1 OR handle = $2 LIMIT 1`,
    [input.email, input.handle],
  );
  return (result.rowCount ?? 0) > 0;
}
