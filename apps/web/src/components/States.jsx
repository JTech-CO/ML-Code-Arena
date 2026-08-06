import styles from './States.module.css';

/**
 * 빈 화면 (docs/DESIGN.md §11.3).
 *
 * 빈 화면은 분위기를 만드는 자리가 아니라 **다음 행동을 지시하는 자리**다.
 * 일러스트나 이모지를 두지 않는다.
 *
 * @param {{ message: string, action?: import('react').ReactNode }} props
 */
export function EmptyState({ message, action }) {
  return (
    <div className={styles.box}>
      <p className={styles.message}>{message}</p>
      {action}
    </div>
  );
}

/**
 * 오류 화면. 사과하지 않고 무엇을 할 수 있는지 알린다 (§11.1).
 * @param {{ message: string, onRetry?: () => void }} props
 */
export function ErrorState({ message, onRetry }) {
  return (
    <div className={styles.box} role="alert">
      <p className={styles.message}>{message}</p>
      {onRetry ? (
        <button type="button" className={styles.retry} onClick={onRetry}>
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

/**
 * 로딩. 스피너·스켈레톤을 쓰지 않는다 (§9) — 진행 정보가 없는 회전보다
 * 무엇을 기다리는지 적힌 문장이 낫다.
 * @param {{ message?: string }} props
 */
export function LoadingState({ message = '불러오는 중' }) {
  return (
    <div className={styles.box}>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
