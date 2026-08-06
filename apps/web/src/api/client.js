/**
 * API 클라이언트.
 *
 * `credentials: 'include'` 가 필수다. 세션과 익명 세션이 전부 쿠키에 있고,
 * 익명 한도는 그 쿠키로만 이어진다 (INV-9). 빠지면 매 요청이 새 익명 세션이 된다.
 */

/**
 * 기본은 **같은 출처**다. 개발에서는 Vite 가 `/api` 를 API 서버로 프록시한다
 * (`vite.config.js`). 교차 출처로 두면 `SameSite=Lax` 세션 쿠키가 실리지 않아
 * 익명 세션이 매 요청 새로 발급된다.
 */
const BASE = import.meta.env['VITE_API_BASE'] ?? '';

/** 서버가 코드로 구분해 준 오류. 화면이 문구를 새로 만들지 않고 그대로 쓴다. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [body]
   */
  constructor(status, code, message, body = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
export async function api(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    // 네트워크가 끊긴 것과 서버가 500 을 준 것은 사용자에게 다른 상황이다.
    throw new ApiError(0, 'NETWORK', '서버에 연결할 수 없습니다.');
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? '요청을 처리하지 못했습니다.',
      body ?? {},
    );
  }
  return body;
}

/** @param {string} path */
export const get = (path) => api(path);

/**
 * @param {string} path
 * @param {unknown} payload
 */
export const post = (path, payload) =>
  api(path, { method: 'POST', body: JSON.stringify(payload) });

/** SSE 스트림 주소. `EventSource` 는 credentials 를 옵션으로 받는다. */
export const streamUrl = () => `${BASE}/api/stream/submissions`;
