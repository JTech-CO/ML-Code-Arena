import { EMPTY } from '../copy.js';

import styles from './RankingTable.module.css';
import { EmptyState } from './States.jsx';


/**
 * 랭킹 (docs/DESIGN.md §6.5).
 *
 * 순위·해결 수는 mono + tabular-nums 다. 숫자가 세로로 정렬되지 않으면 비교가 안 된다.
 *
 * `IE` 는 여기 들어올 수 없다 — 서버의 `user_ranking` 뷰가 `solved` 만 보고,
 * `solved` 는 최초 `AC` 에만 채워진다 (docs/TECHNICAL.md §4.3).
 *
 * @param {{ ranking: Record<string, any>[] }} props
 */
export function RankingTable({ ranking }) {
  if (ranking.length === 0) return <EmptyState message={EMPTY.ranking} />;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col" className={styles.rankCol}>
            순위
          </th>
          <th scope="col">핸들</th>
          <th scope="col" className={styles.countCol}>
            해결
          </th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((row) => (
          <tr key={row.handle}>
            <td className={`mono ${styles.rankCol}`}>{row.rank}</td>
            <td className={styles.handle}>{row.handle}</td>
            <td className={`mono ${styles.countCol}`}>{row.solved_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
