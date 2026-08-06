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
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

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
