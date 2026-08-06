import { useNavigate } from 'react-router-dom';

import styles from './ProblemTable.module.css';
import { RestrictionChip } from './RestrictionChip.jsx';
import { VerdictLabel } from './VerdictLabel.jsx';


/**
 * 문제 목록 (docs/DESIGN.md §6.3).
 *
 * 행 높이 40px. 한 화면에 최소 15행이 보여야 한다 — 목록을 훑는 것이 이 화면의
 * 유일한 목적이므로 밀도가 곧 기능이다.
 *
 * 미해결 문제의 상태 열은 가운뎃점으로 채운다. 빈 칸으로 두면 열이 무너져 보인다.
 *
 * 키보드로 훑을 수 있어야 한다 (§10). 방향키로 행을 옮기고 Enter 로 진입한다.
 *
 * @param {{
 *   problems: Record<string, any>[],
 *   statusBySlug?: Record<string, { verdict: import('@mlca/shared').Verdict|null, status: string }>,
 * }} props
 */
export function ProblemTable({ problems, statusBySlug = {} }) {
  const navigate = useNavigate();

  /**
   * @param {import('react').KeyboardEvent<HTMLTableRowElement>} event
   * @param {number} index
   * @param {string} slug
   */
  function onKeyDown(event, index, slug) {
    if (event.key === 'Enter') {
      navigate(`/problems/${slug}`);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    const next = index + (event.key === 'ArrowDown' ? 1 : -1);
    const rows = event.currentTarget.parentElement?.children;
    const target = rows?.[next];
    if (target instanceof HTMLElement) target.focus();
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col" className={styles.numberCol}>
            #
          </th>
          <th scope="col">제목</th>
          <th scope="col" className={styles.restrictionCol}>
            제한
          </th>
          <th scope="col" className={styles.tierCol}>
            단
          </th>
          <th scope="col" className={styles.rateCol}>
            정답률
          </th>
          <th scope="col" className={styles.statusCol}>
            상태
          </th>
        </tr>
      </thead>
      <tbody>
        {problems.map((problem, index) => {
          const mine = statusBySlug[problem.slug];
          return (
            <tr
              key={problem.slug}
              className={styles.row}
              tabIndex={0}
              onClick={() => navigate(`/problems/${problem.slug}`)}
              onKeyDown={(event) => onKeyDown(event, index, problem.slug)}
            >
              <td className={`mono ${styles.numberCol}`}>
                {String(index + 1).padStart(2, '0')}
              </td>
              <td className={styles.title}>{problem.title}</td>
              <td className={styles.restrictionCol}>
                <RestrictionChip restrictions={problem.restrictions} compact />
              </td>
              <td className={`mono ${styles.tierCol}`}>{problem.tier}</td>
              <td className={`mono ${styles.rateCol}`}>
                {problem.acceptance_rate === null ? '·' : `${problem.acceptance_rate}%`}
              </td>
              <td className={styles.statusCol}>
                {mine ? (
                  <VerdictLabel verdict={mine.verdict} status={mine.status} />
                ) : (
                  <span className={styles.unsolved} aria-label="미해결">
                    ·
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
