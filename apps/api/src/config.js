/**
 * API 설정 로드. 환경변수 목록은 docs/ENVIRONMENT.md §3.
 *
 * M0 단계에서는 기동에 필요한 최소 항목만 읽는다.
 * DB·Redis·세션 시크릿은 M3 에서 필수 검증을 추가한다.
 */

/**
 * @typedef {object} ApiConfig
 * @property {number} port
 * @property {string} host
 * @property {string} nodeEnv
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

  return {
    port,
    host: env['API_HOST'] ?? '127.0.0.1',
    nodeEnv: env['NODE_ENV'] ?? 'development',
  };
}
