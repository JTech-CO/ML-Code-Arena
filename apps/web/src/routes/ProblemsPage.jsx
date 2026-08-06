import { useEffect, useMemo, useState } from 'react';

import { get } from '../api/client.js';
import { FilterSidebar } from '../components/FilterSidebar.jsx';
import { ProblemTable } from '../components/ProblemTable.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { EMPTY } from '../copy.js';

import styles from './ProblemsPage.module.css';

/**
 * 문제집 (docs/DESIGN.md §6.3).
 *
 * 필터를 서버 질의로 넘기지 않고 클라이언트에서 거른다. Phase 1 은 문제가 30개뿐이라
 * 전부 받아 두는 편이 왕복보다 빠르고, 필터를 바꿀 때마다 화면이 비었다 차지 않는다.
 */
export function ProblemsPage() {
  const [problems, setProblems] = useState(/** @type {Record<string, any>[]|null} */ (null));
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [filter, setFilter] = useState({
    tier: /** @type {number|null} */ (null),
    tag: /** @type {string|null} */ (null),
    status: 'all',
  });

  async function load() {
    setError(null);
    try {
      const body = await get('/api/problems?limit=200');
      setProblems(body.problems);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '문제 목록을 불러오지 못했습니다.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const tiers = useMemo(
    () => [...new Set((problems ?? []).map((p) => p.tier))].sort((a, b) => a - b),
    [problems],
  );

  const visible = useMemo(() => {
    if (!problems) return [];
    return problems.filter((problem) => {
      if (filter.tier !== null && problem.tier !== filter.tier) return false;
      return true;
    });
  }, [problems, filter]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!problems) return <LoadingState message="문제 목록을 불러오는 중" />;

  return (
    <div className={styles.layout}>
      <FilterSidebar tiers={tiers} tags={[]} value={filter} onChange={setFilter} />

      <section className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>문제집</h1>
          <span className={`mono ${styles.count}`}>
            {visible.length} / {problems.length}
          </span>
        </header>

        {visible.length === 0 ? (
          <EmptyState message={EMPTY.filteredProblems} />
        ) : (
          <ProblemTable problems={visible} />
        )}
      </section>
    </div>
  );
}
