/**
 * 채점 작업 처리 — 큐에서 꺼낸 제출 1건을 격리 컨테이너에 태우고 결과를 기록한다.
 *
 * **재시도는 `IE` 에만 적용한다.** `WA`·`TLE` 를 재시도하면 사용자 코드가 여러 번
 * 실행되어 자원이 낭비되고 통계가 오염된다. `IE` 는 사용자 책임이 아니므로
 * (docs/TECHNICAL.md §4.3) 다시 시도할 가치가 있다.
 *
 * 재시도를 유발하는 방법은 **예외를 던지는 것**이다. BullMQ 는 정상 반환을 성공으로
 * 보므로, `IE` 를 그냥 기록하고 반환하면 재시도가 일어나지 않는다.
 */

import path from 'node:path';

import { VERDICT } from '@mlca/shared';

import { claimForJudging, recordResult } from '../result/submissions.js';
import { resolveProblemDir, runnerDir, workRoot } from '../sandbox/problem-dir.js';
import { runInSandbox } from '../sandbox/run.js';
import { buildSpec, cleanWorkDir, countCases, prepareWorkDir } from '../sandbox/workdir.js';

import { MAX_ATTEMPTS } from './connection.js';

/** 재시도를 유발하기 위한 예외. 메시지는 로그에만 남고 사용자에게 가지 않는다. */
export class RetryableJudgeError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RetryableJudgeError';
  }
}

/**
 * @typedef {object} ProcessorOptions
 * @property {string} [root] 저장소 루트
 * @property {string} [image] 채점 이미지 태그
 */

/**
 * @param {ProcessorOptions} [options]
 * @returns {(job: { data: { submission_id: string } }) => Promise<{ verdict: string|null, skipped?: boolean }>}
 */
export function createJudgeProcessor(options = {}) {
  const root = options.root;
  const image = options.image ?? process.env['JUDGE_IMAGE'];

  return async function process(job) {
    const submissionId = job.data.submission_id;

    const claimed = await claimForJudging(submissionId);
    if (!claimed) {
      // 이미 DONE 이다. 워커가 죽어 같은 작업이 다시 온 경우이며, 다시 채점하지 않는다.
      return { verdict: null, skipped: true };
    }

    const isLastAttempt = claimed.attempts >= MAX_ATTEMPTS;

    /** @type {string|null} */
    let judgeDir = null;

    try {
      const problemDir = await resolveProblemDir(claimed.problemSlug, root);
      const casesDir = path.join(problemDir, 'cases');
      const caseCount = await countCases(casesDir);

      judgeDir = await prepareWorkDir({
        root: workRoot(root),
        submissionId,
        source: claimed.source,
        spec: buildSpec(
          {
            entrypoint: claimed.entrypoint,
            time_limit_ms: claimed.timeLimitMs,
            restrictions: claimed.restrictions,
            compare_options: claimed.compareOptions,
          },
          caseCount,
        ),
        casesDir,
      });

      const result = await runInSandbox({
        judgeDir,
        runnerDir: runnerDir(root),
        submissionId,
        timeLimitMs: claimed.timeLimitMs,
        ...(image === undefined ? {} : { image }),
      });

      if (result.verdict === VERDICT.IE && !isLastAttempt) {
        throw new RetryableJudgeError(
          `IE (시도 ${claimed.attempts}/${MAX_ATTEMPTS}): ${result.error ?? '원인 미상'}`,
        );
      }

      await recordResult({
        submissionId,
        verdict: result.verdict,
        output: result.output,
      });

      return { verdict: result.verdict };
    } catch (error) {
      if (isLastAttempt) {
        // 더 시도할 곳이 없다. IE 로 확정해 제출이 JUDGING 에 갇히지 않게 한다.
        await recordResult({ submissionId, verdict: VERDICT.IE, output: null });
        return { verdict: VERDICT.IE };
      }
      throw error;
    } finally {
      // 제출 원문이 디스크에 남지 않는다. 결과 경로가 어디로 빠지든 지운다.
      if (judgeDir) await cleanWorkDir(judgeDir);
    }
  };
}
