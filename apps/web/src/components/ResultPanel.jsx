import { verdictMessage } from '../copy.js';

import styles from './ResultPanel.module.css';
import { ShapeDiff } from './ShapeDiff.jsx';
import { VerdictLabel } from './VerdictLabel.jsx';


/**
 * 채점 결과 (docs/DESIGN.md §6.4·§9·§10).
 *
 * `role="status"` + `aria-live="polite"` 로 스크린리더에 알린다. `assertive` 를 쓰지
 * 않는 것은 의도다 — 사용자가 코드를 읽는 중일 수 있고, 그 작업을 끊을 만큼 급한
 * 소식이 아니다 (§10).
 *
 * 판정 확정 순간이 이 사이트의 **유일한 이벤트 모션**이다 (§9). 좌측 3px 색 레일이
 * 200ms 로 나타난다. 사용자가 몇 초를 기다린 뒤 결과를 받는 순간이므로 여기에만
 * 강조를 준다.
 *
 * @param {{
 *   submission: Record<string, any>|null,
 *   queuePosition?: number|null,
 * }} props
 */
export function ResultPanel({ submission, queuePosition }) {
  if (!submission) {
    return (
      <section className={styles.panel} role="status" aria-live="polite">
        <p className={styles.idle}>제출하면 결과가 여기 표시됩니다.</p>
      </section>
    );
  }

  const done = submission.status === 'DONE';
  const verdict = submission.verdict ?? null;
  const detail = submission.detail ?? null;

  return (
    <section
      className={done ? `${styles.panel} ${styles.settled}` : styles.panel}
      style={
        done && verdict
          ? /** @type {import('react').CSSProperties} */ ({
              '--rail': `var(--verdict-${verdict.toLowerCase()})`,
            })
          : undefined
      }
      role="status"
      aria-live="polite"
    >
      <div className={styles.header}>
        <span className={styles.label}>결과</span>
        <VerdictLabel
          verdict={verdict}
          status={submission.status}
          failedCase={submission.failed_case_seq}
        />

        {done ? (
          <span className={`mono ${styles.metrics}`}>
            {submission.runtime_ms ?? 0}ms · {submission.memory_mb ?? 0}MB
          </span>
        ) : (
          // 스피너를 두지 않는다. 진행 정보가 없는 회전보다 순번이 유용하다 (§9).
          <span className={styles.waiting}>
            {typeof queuePosition === 'number' ? (
              <>
                대기 <span className="mono">{queuePosition}</span>번째
              </>
            ) : (
              '대기 중'
            )}
          </span>
        )}
      </div>

      {done && verdict ? <p className={styles.message}>{verdictMessage(verdict, detail)}</p> : null}

      {verdict === 'WA' ? <ShapeDiff detail={detail} /> : null}

      {verdict === 'FBD' && Array.isArray(detail?.violations) ? (
        <ul className={styles.violations}>
          {detail.violations.map((
            /** @type {{ rule: string, message: string, line: number }} */ violation,
            /** @type {number} */ index,
          ) => (
            <li key={`${violation.rule}-${index}`}>
              {violation.message}
              {violation.line ? <span className={`mono ${styles.line}`}> {violation.line}행</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
