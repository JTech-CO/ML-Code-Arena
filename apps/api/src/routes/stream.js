/**
 * SSE 제출 스트림 (docs/TECHNICAL.md §7.4).
 *
 * 리버스 프록시가 버퍼링하면 이벤트가 뭉쳐서 나가거나 아예 멈춘다.
 * `X-Accel-Buffering: no` 와 주기적 하트비트로 막는다 (RUNBOOK 27번).
 */

const HEARTBEAT_MS = 15_000;

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ stream: ReturnType<typeof import('../sse/stream.js').createSubmissionStream> }} deps
 */
export function registerStreamRoutes(app, deps) {
  app.get('/api/stream/submissions', (request, reply) => {
    // Fastify 에게 소켓을 직접 쓰겠다고 알린다. 이걸 하지 않으면 Fastify 가
    // 응답을 마무리하려다 이미 쓴 헤더와 충돌한다.
    reply.hijack();

    // **CORS 헤더를 손으로 옮겨야 한다.** `reply.raw.writeHead` 는 Fastify 의 reply 를
    // 우회하므로, @fastify/cors 가 훅에서 붙여 둔 헤더가 그냥 사라진다. 그러면 브라우저가
    // EventSource 연결을 CORS 위반으로 끊고(net::ERR_FAILED) 스트림이 조용히 안 온다.
    //
    // 전체 헤더를 퍼뜨리지 않고 필요한 것만 고른다 — 무엇이 왜 나가는지 보이게 둔다.
    /** @type {Record<string, string>} */
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };

    for (const name of [
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'vary',
    ]) {
      const value = reply.getHeader(name);
      if (typeof value === 'string') headers[name] = value;
    }

    reply.raw.writeHead(200, headers);

    // 즉시 한 바이트를 흘려 프록시가 응답을 열게 한다.
    reply.raw.write(': connected\n\n');

    /** @param {Record<string, unknown>} event */
    const send = (event) => {
      reply.raw.write(`event: submission\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = deps.stream.subscribe(send);
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });
}
