import { SUBMIT } from '../copy.js';

import styles from './SubmitPanel.module.css';

/**
 * 제출 버튼과 제한 안내 (docs/DESIGN.md §6.4).
 *
 * 버튼 라벨은 흐름 전체에서 같은 이름을 유지한다 — `제출` → `채점 중` → `채점 완료`.
 * `Submit`·`전송`·`보내기` 를 혼용하지 않는다 (§11.4).
 *
 * @param {{
 *   onSubmit: () => void,
 *   state: 'idle'|'sending'|'judging',
 *   timeLimitMs: number,
 *   memoryLimitMb: number,
 *   error?: string|null,
 * }} props
 */
export function SubmitPanel({ onSubmit, state, timeLimitMs, memoryLimitMb, error }) {
  const busy = state !== 'idle';

  return (
    <div className={styles.panel}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.row}>
        <span className={`mono ${styles.limits}`}>
          {Math.round(timeLimitMs / 1000)}초 · {memoryLimitMb}MB
        </span>

        <button type="button" className={styles.submit} onClick={onSubmit} disabled={busy}>
          {SUBMIT[state]}
        </button>
      </div>

      <p className={styles.hint}>
        <kbd className={`mono ${styles.kbd}`}>Ctrl</kbd>
        <span aria-hidden="true"> + </span>
        <kbd className={`mono ${styles.kbd}`}>Enter</kbd>
        <span> 로도 제출됩니다.</span>
      </p>
    </div>
  );
}
