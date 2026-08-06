/** 문제·개념·랭킹 조회 라우트 (docs/TECHNICAL.md §7.1). */

import { getPool } from '../db/pool.js';
import { findBySlug, list } from '../db/problems.js';
import { problemDetail, problemSummary } from '../serialize.js';

/**
 * @param {string|undefined} raw
 * @returns {number|undefined}
 */
function toInt(raw) {
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

/** @param {import('fastify').FastifyInstance} app */
export function registerContentRoutes(app) {
  app.get('/api/problems', async (request, reply) => {
    const query = /** @type {Record<string, string|undefined>} */ (request.query ?? {});
    const rows = await list({
      ...(toInt(query['tier']) === undefined ? {} : { tier: /** @type {number} */ (toInt(query['tier'])) }),
      ...(toInt(query['difficulty']) === undefined
        ? {}
        : { difficulty: /** @type {number} */ (toInt(query['difficulty'])) }),
      ...(query['tag'] ? { tag: query['tag'] } : {}),
      ...(toInt(query['limit']) === undefined ? {} : { limit: /** @type {number} */ (toInt(query['limit'])) }),
    });
    return reply.send({ problems: rows.map(problemSummary) });
  });

  app.get('/api/problems/:slug', async (request, reply) => {
    const params = /** @type {{ slug: string }} */ (request.params);
    const row = await findBySlug(params.slug);

    // 미공개 문제는 없는 것과 같이 다룬다. 존재 여부를 알려주면 출제 예정 목록이 샌다.
    if (!row || !row.is_published) {
      return reply.code(404).send({ code: 'PROBLEM_NOT_FOUND', message: '문제를 찾을 수 없습니다.' });
    }
    return reply.send(problemDetail(row));
  });

  app.get('/api/concepts', async (_request, reply) => {
    const result = await getPool().query(
      `SELECT slug, title, tier FROM concepts ORDER BY tier, slug`,
    );
    return reply.send({ concepts: result.rows });
  });

  app.get('/api/concepts/:slug', async (request, reply) => {
    const params = /** @type {{ slug: string }} */ (request.params);
    const concept = await getPool().query(
      `SELECT id, slug, title, tier, body_md FROM concepts WHERE slug = $1`,
      [params.slug],
    );
    if (concept.rowCount === 0) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: '개념 문서를 찾을 수 없습니다.' });
    }

    const linked = await getPool().query(
      `SELECT p.slug, p.title, p.tier, p.difficulty, l.relation
         FROM concept_problem_links l
         JOIN problems p ON p.id = l.problem_id
        WHERE l.concept_id = $1 AND p.is_published
        ORDER BY p.tier, p.difficulty`,
      [concept.rows[0].id],
    );

    const row = concept.rows[0];
    return reply.send({
      slug: row.slug,
      title: row.title,
      tier: row.tier,
      body_md: row.body_md,
      problems: linked.rows,
    });
  });

  app.get('/api/ranking', async (request, reply) => {
    const query = /** @type {{ limit?: string }} */ (request.query ?? {});
    const limit = Math.min(toInt(query.limit) ?? 50, 200);

    // `user_ranking` 뷰는 `solved` 만 본다. `solved` 는 최초 AC 에만 채워지므로
    // `IE` 는 구조적으로 랭킹에 들어올 수 없다 (docs/TECHNICAL.md §4.3).
    const result = await getPool().query(
      `SELECT handle, solved_count, last_solved_at
         FROM user_ranking
        WHERE solved_count > 0
        ORDER BY solved_count DESC, last_solved_at ASC
        LIMIT $1`,
      [limit],
    );
    return reply.send({
      ranking: result.rows.map((row, index) => ({
        rank: index + 1,
        handle: row.handle,
        solved_count: Number(row.solved_count),
        last_solved_at: row.last_solved_at,
      })),
    });
  });
}
