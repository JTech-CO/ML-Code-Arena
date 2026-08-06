import styles from './VerdictLabel.module.css';

/**
 * 판정 표시 (docs/DESIGN.md §7.2).
 *
 * **색만으로 구분하지 않는다.** 판정 코드 텍스트를 항상 함께 낸다 (INV-11).
 * 흑백 렌더나 색각 이상에서도 `AC` 와 `WA` 가 구분되어야 한다. 색은 스캔을 빠르게
 * 해주는 보조 수단이지 정보 전달의 유일한 통로가 아니다.
 *
 * 배경 뱃지로 칠하지 않는다. 목록에서 20개 행이 전부 색 블록이 되면 밀도가 무너진다 (§3.4).
 *
 * @param {{
 *   verdict: import('@mlca/shared').Verdict|null,
 *   status?: string,
 *   failedCase?: number|null,
 * }} props
 */
export function VerdictLabel({ verdict, status, failedCase }) {
  if (!verdict) {
    // 아직 판정이 없다. 스피너를 두지 않는다 — 진행 정보가 없는 스피너보다
    // 상태 텍스트가 유용하다 (§9).
    const label = status === 'JUDGING' ? '채점 중' : '대기 중';
    return (
      <span className={`mono ${styles.label} ${styles.pending}`} data-verdict="PENDING">
        {label}
      </span>
    );
  }

  return (
    <span
      className={`mono ${styles.label}`}
      style={{ color: `var(--verdict-${verdict.toLowerCase()})` }}
      data-verdict={verdict}
    >
      {verdict}
      {typeof failedCase === 'number' ? ` · ${failedCase}` : ''}
    </span>
  );
}
