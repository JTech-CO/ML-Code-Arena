import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { get } from '../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { EMPTY } from '../copy.js';

import styles from './ConceptsPage.module.css';

/** 유형 설명 목록 (docs/DESIGN.md §6.6). */
export function ConceptsPage() {
  const [concepts, setConcepts] = useState(/** @type {Record<string, any>[]|null} */ (null));
  const [error, setError] = useState(/** @type {string|null} */ (null));

  async function load() {
    setError(null);
    try {
      const body = await get('/api/concepts');
      setConcepts(body.concepts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '개념 문서를 불러오지 못했습니다.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!concepts) return <LoadingState message="개념 문서를 불러오는 중" />;

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>유형 설명</h1>
      {concepts.length === 0 ? (
        <EmptyState message={EMPTY.concepts} />
      ) : (
        <ul className={styles.list}>
          {concepts.map((concept) => (
            <li key={concept.slug} className={styles.item}>
              <Link to={`/concepts/${concept.slug}`} className={styles.link}>
                {concept.title}
              </Link>
              <span className={`mono ${styles.tier}`}>단계 {concept.tier}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
