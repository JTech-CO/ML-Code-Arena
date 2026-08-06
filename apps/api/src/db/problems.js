/** 문제 조회. 공개되지 않은 문제는 조회 경로에서 보이지 않는다. */

import { getPool } from './pool.js';

/**
 * @param {string} slug
 * @returns {Promise<Record<string, any>|null>}
 */
export async function findBySlug(slug) {
  const result = await getPool().query(
    `SELECT p.id, p.slug, p.title, p.tier, p.difficulty, p.judge_mode, p.allowed_languages,
            p.entrypoint, p.time_limit_ms, p.memory_limit_mb, p.restrictions, p.compare_options,
            p.statement_md, p.is_published,
            s.judged_count, s.accepted_count, s.acceptance_rate
       FROM problems p
       LEFT JOIN problem_stats s ON s.problem_id = p.id
      WHERE p.slug = $1`,
    [slug],
  );
  return result.rows[0] ?? null;
}

/**
 * @param {{ tier?: number, difficulty?: number, tag?: string, limit?: number, offset?: number }} filter
 * @returns {Promise<Record<string, any>[]>}
 */
export async function list(filter = {}) {
  const conditions = ['p.is_published'];
  /** @type {any[]} */
  const params = [];

  if (filter.tier !== undefined) {
    params.push(filter.tier);
    conditions.push(`p.tier = $${params.length}`);
  }
  if (filter.difficulty !== undefined) {
    params.push(filter.difficulty);
    conditions.push(`p.difficulty = $${params.length}`);
  }
  if (filter.tag) {
    params.push(filter.tag);
    conditions.push(
      `EXISTS (SELECT 1 FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
                WHERE pt.problem_id = p.id AND t.name = $${params.length})`,
    );
  }

  params.push(Math.min(filter.limit ?? 100, 200));
  const limitParam = `$${params.length}`;
  params.push(filter.offset ?? 0);
  const offsetParam = `$${params.length}`;

  const result = await getPool().query(
    `SELECT p.id, p.slug, p.title, p.tier, p.difficulty, p.restrictions,
            s.judged_count, s.accepted_count, s.acceptance_rate
       FROM problems p
       LEFT JOIN problem_stats s ON s.problem_id = p.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.tier, p.difficulty, p.slug
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );
  return result.rows;
}
