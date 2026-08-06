/**
 * 실시간 제출 스트림 (docs/TECHNICAL.md §7.4).
 *
 * WebSocket 대신 SSE 를 쓰는 이유는 단방향 브로드캐스트로 충분하고 프록시·재연결
 * 처리가 단순하기 때문이다.
 *
 * 채점 완료는 Postgres `LISTEN/NOTIFY` 로 받는다. 워커가 직접 발행하지 않는 이유는
 * 두 가지다 — 결과 쓰기와 같은 트랜잭션이라 알림이 빠질 수 없고, `apps/api` 와
 * `apps/worker` 는 서로를 import 할 수 없어 DB 가 둘의 유일한 접점이다 (INV-3).
 *
 * **익명 제출은 스트림에 오르지 않는다** (docs/TECHNICAL.md §7.4).
 */

import pg from 'pg';

import { findById } from '../db/submissions.js';
import { streamEvent } from '../serialize.js';

const CHANNEL = 'submission_judged';

/**
 * 구독자 집합을 관리하고 DB 알림을 팬아웃한다.
 * @param {{ databaseUrl: string, logger?: { error: (msg: string) => void } }} options
 */
export function createSubmissionStream(options) {
  /** @type {Set<(event: Record<string, unknown>) => void>} */
  const subscribers = new Set();

  /** @type {pg.Client|null} */
  let client = null;
  let closed = false;

  async function connect() {
    if (closed) return;
    client = new pg.Client({ connectionString: options.databaseUrl });

    client.on('error', (error) => {
      options.logger?.error(`SSE 알림 연결 오류: ${error.message}`);
      // 연결이 끊기면 재연결한다. 끊긴 채로 두면 스트림이 조용히 멈춘다.
      setTimeout(() => void connect(), 1000);
    });

    client.on('notification', (message) => {
      void handleNotification(message.payload);
    });

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
  }

  /** @param {string|undefined} submissionId */
  async function handleNotification(submissionId) {
    if (!submissionId || subscribers.size === 0) return;
    try {
      const row = await findById(submissionId);
      // 익명 제출은 handle 이 없다. 스트림에 올리지 않는다.
      if (!row || !row.user_id || !row.handle) return;

      const event = streamEvent(row);
      for (const send of subscribers) send(event);
    } catch (error) {
      options.logger?.error(`SSE 이벤트 생성 실패: ${String(error)}`);
    }
  }

  return {
    start: connect,

    /**
     * @param {(event: Record<string, unknown>) => void} send
     * @returns {() => void} 구독 해제
     */
    subscribe(send) {
      subscribers.add(send);
      return () => subscribers.delete(send);
    },

    get subscriberCount() {
      return subscribers.size;
    },

    /**
     * 테스트에서 알림 경로를 직접 태우기 위한 통로.
     * @param {string} submissionId
     * @returns {Promise<void>}
     */
    async emitForTest(submissionId) {
      await handleNotification(submissionId);
    },

    async close() {
      closed = true;
      subscribers.clear();
      if (client) {
        const closing = client;
        client = null;
        await closing.end().catch(() => {});
      }
    },
  };
}
