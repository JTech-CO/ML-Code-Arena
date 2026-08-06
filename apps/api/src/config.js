/**
 * API 설정 로드. 환경변수 목록은 docs/ENVIRONMENT.md §3.
 */

/**
 * @typedef {object} ApiConfig
 * @property {number} port
 * @property {string} host
 * @property {string} nodeEnv
 * @property {boolean} isProduction
 * @property {string} databaseUrl
 * @property {string} redisUrl
 * @property {string} sessionSecret
 * @property {string} ipHashSecret
 * @property {string[]} corsOrigins
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {ApiConfig}
 */
export function loadConfig(env) {
  const rawPort = env['API_PORT'] ?? '3000';
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT 값이 올바르지 않습니다: ${rawPort}`);
  }

  const sessionSecret = env['SESSION_SECRET'];
  const ipHashSecret = env['IP_HASH_SECRET'];

  if (!sessionSecret || !ipHashSecret) {
    throw new Error('SESSION_SECRET 과 IP_HASH_SECRET 이 필요합니다 (docs/ENVIRONMENT.md §3).');
  }

  // 같은 값을 쓰면 세션이 유출됐을 때 IP 해시가 함께 역산 가능해진다.
  // 문서에만 적어 두면 언젠가 같은 값이 들어간다.
  if (sessionSecret === ipHashSecret) {
    throw new Error('SESSION_SECRET 과 IP_HASH_SECRET 은 서로 달라야 합니다.');
  }

  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL 이 필요합니다.');

  const nodeEnv = env['NODE_ENV'] ?? 'development';

  return {
    port,
    host: env['API_HOST'] ?? '127.0.0.1',
    nodeEnv,
    isProduction: nodeEnv === 'production',
    databaseUrl,
    redisUrl: env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
    sessionSecret,
    ipHashSecret,
    corsOrigins: (env['CORS_ORIGINS'] ?? 'http://localhost:5173').split(',').filter(Boolean),
  };
}
