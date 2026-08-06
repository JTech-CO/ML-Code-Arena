import { useEffect, useState } from 'react';

import { get } from '../api/client.js';
import { RankingTable } from '../components/RankingTable.jsx';
import { ErrorState, LoadingState } from '../components/States.jsx';
import { SubmissionStream } from '../components/SubmissionStream.jsx';

import styles from './RankingPage.module.css';

/** 랭킹 + 실시간 제출 (docs/DESIGN.md §6.5). */
export function RankingPage() {
  const [ranking, setRanking] = useState(/** @type {Record<string, any>[]|null} */ (null));
  const [error, setError] = useState(/** @type {string|null} */ (null));

  async function load() {
    setError(null);
    try {
      const body = await get('/api/ranking');
      setRanking(body.ranking);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '랭킹을 불러오지 못했습니다.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className={styles.layout}>
      <section className={styles.column}>
        <h1 className={styles.title}>랭킹</h1>
        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : ranking ? (
          <RankingTable ranking={ranking} />
        ) : (
          <LoadingState message="랭킹을 불러오는 중" />
        )}
      </section>

      <section className={styles.column}>
        <h2 className={styles.title}>실시간 제출</h2>
        <SubmissionStream />
      </section>
    </div>
  );
}
