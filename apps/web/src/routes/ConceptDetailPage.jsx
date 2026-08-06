import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

import { get } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/States.jsx';

import styles from './ConceptDetailPage.module.css';

/**
 * 개념 문서 (docs/DESIGN.md §6.6).
 *
 * 읽기 전용 장문 콘텐츠. 최대 폭 720px — 한 줄이 길어지면 다음 줄 첫 글자를 찾는 데
 * 눈이 미끄러진다.
 *
 * 하단의 연결 문제 목록이 **개념 → 문제** 이동을 1클릭으로 만든다. 반대 방향은
 * 문제 상세의 선행 개념 링크가 담당한다 — 양방향 모두 1클릭이어야 한다.
 */
export function ConceptDetailPage() {
  const { slug } = useParams();
  const [concept, setConcept] = useState(/** @type {Record<string, any>|null} */ (null));
  const [error, setError] = useState(/** @type {string|null} */ (null));

  useEffect(() => {
    let cancelled = false;
    setConcept(null);
    setError(null);

    get(`/api/concepts/${slug}`)
      .then((body) => {
        if (!cancelled) setConcept(body);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause?.message ?? '개념 문서를 불러오지 못했습니다.');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) return <ErrorState message={error} />;
  if (!concept) return <LoadingState message="개념 문서를 불러오는 중" />;

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{concept.title}</h1>
        <span className={`mono ${styles.tier}`}>단계 {concept.tier}</span>
      </header>

      <div className={styles.body}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{concept.body_md || ''}</ReactMarkdown>
      </div>

      {Array.isArray(concept.problems) && concept.problems.length > 0 ? (
        <section className={styles.linked}>
          <h2 className={styles.linkedTitle}>연결된 문제</h2>
          <ul className={styles.linkedList}>
            {concept.problems.map((problem) => (
              <li key={problem.slug} className={styles.linkedItem}>
                <Link to={`/problems/${problem.slug}`}>{problem.title}</Link>
                <span className={`mono ${styles.relation}`}>
                  {problem.relation === 'prerequisite' ? '선행' : '연습'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={styles.back}>
        <Link to="/concepts">유형 설명으로</Link>
      </p>
    </article>
  );
}
