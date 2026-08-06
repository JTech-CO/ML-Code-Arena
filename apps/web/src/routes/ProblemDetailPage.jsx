import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

import { get, post } from '../api/client.js';
import { CodeEditor } from '../components/CodeEditor.jsx';
import { RestrictionChip } from '../components/RestrictionChip.jsx';
import { ResultPanel } from '../components/ResultPanel.jsx';
import { ErrorState, LoadingState } from '../components/States.jsx';
import { SubmitPanel } from '../components/SubmitPanel.jsx';
import { useAuthStore } from '../stores/auth.js';

import styles from './ProblemDetailPage.module.css';

/** 채점 결과를 기다리며 다시 물어보는 간격. */
const POLL_MS = 400;

/**
 * @param {Record<string, any>} problem
 * @returns {string}
 */
function starterCode(problem) {
  return `def ${problem.entrypoint}():\n    pass\n`;
}

/**
 * 허용 오차는 지수 표기로 보인다. JSON 을 그대로 쓰면 `1e-5` 가 `0.00001` 로 렌더되어
 * 문제 설명의 표기(§6.4 예시)와 어긋나고, 자릿수를 세어야 읽힌다.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function formatTolerance(value, fallback) {
  if (typeof value !== 'number') return fallback;
  return value !== 0 && Math.abs(value) < 1e-3 ? value.toExponential() : String(value);
}

/**
 * 문제 상세 (docs/DESIGN.md §6.4).
 *
 * 좌우 분할이 기본이다. 코드업처럼 문제 페이지와 제출 페이지를 분리하지 않는다 —
 * 문제를 보며 코드를 쓰는 것이 이 화면의 전부이므로 둘이 같이 보여야 한다.
 *
 * 1024px 미만에서는 스플리터 대신 탭으로 완전히 대체한다. 좁은 화면에서 드래그로
 * 폭을 나누는 것은 쓸모가 없다.
 */
export function ProblemDetailPage() {
  const { slug } = useParams();
  const refreshAuth = useAuthStore((state) => state.refresh);

  const [problem, setProblem] = useState(/** @type {Record<string, any>|null} */ (null));
  const [loadError, setLoadError] = useState(/** @type {string|null} */ (null));
  const [source, setSource] = useState('');
  const [submitState, setSubmitState] = useState(
    /** @type {'idle'|'sending'|'judging'} */ ('idle'),
  );
  const [submitError, setSubmitError] = useState(/** @type {string|null} */ (null));
  const [submission, setSubmission] = useState(/** @type {Record<string, any>|null} */ (null));
  const [queuePosition, setQueuePosition] = useState(/** @type {number|null} */ (null));
  const [tab, setTab] = useState(/** @type {'problem'|'code'} */ ('problem'));

  const pollTimer = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null));

  useEffect(() => {
    let cancelled = false;
    setProblem(null);
    setLoadError(null);

    get(`/api/problems/${slug}`)
      .then((body) => {
        if (cancelled) return;
        setProblem(body);
        setSource(starterCode(body));
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(cause?.message ?? '문제를 불러오지 못했습니다.');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  const poll = useCallback(
    /**
     * @param {string} id
     * @returns {Promise<void>}
     */
    async function poll(id) {
      try {
        const body = await get(`/api/submissions/${id}`);
        setSubmission(body);
        if (body.status === 'DONE') {
          setSubmitState('idle');
          void refreshAuth();
          return;
        }
      } catch {
        // 한 번 실패해도 다음 주기에 다시 묻는다.
      }
      pollTimer.current = setTimeout(() => void poll(id), POLL_MS);
    },
    [refreshAuth],
  );

  const submit = useCallback(async () => {
    if (!problem || submitState !== 'idle') return;

    setSubmitState('sending');
    setSubmitError(null);
    setSubmission(null);

    try {
      const accepted = await post('/api/submissions', {
        problem_slug: problem.slug,
        language: 'python',
        source,
      });
      setQueuePosition(accepted.queue_position ?? null);
      setSubmitState('judging');
      setSubmission({ id: accepted.submission_id, status: 'PENDING', verdict: null });
      void poll(accepted.submission_id);
    } catch (cause) {
      setSubmitState('idle');
      setSubmitError(cause instanceof Error ? cause.message : '제출하지 못했습니다.');
      void refreshAuth();
    }
  }, [problem, source, submitState, poll, refreshAuth]);

  if (loadError) return <ErrorState message={loadError} />;
  if (!problem) return <LoadingState message="문제를 불러오는 중" />;

  const statement = (
    <div className={styles.statement}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{problem.statement_md || ''}</ReactMarkdown>

      <dl className={styles.spec}>
        <dt>엔트리포인트</dt>
        <dd className="mono">{problem.entrypoint}</dd>
        <dt>허용 오차</dt>
        <dd className="mono">
          rtol {formatTolerance(problem.compare_options?.rtol, '1e-5')} · atol{' '}
          {formatTolerance(problem.compare_options?.atol, '1e-8')}
        </dd>
      </dl>

      {/* 문제 → 개념 이동. 개념 → 문제와 짝을 이뤄 양방향 모두 1클릭이 된다 (§6.6). */}
      {Array.isArray(problem.concepts) && problem.concepts.length > 0 ? (
        <p className={styles.conceptLinks}>
          {problem.concepts.map((concept) => (
            <Link key={concept.slug} to={`/concepts/${concept.slug}`}>
              {concept.relation === 'prerequisite' ? '선행 개념' : '관련 개념'} →{' '}
              {concept.title}
            </Link>
          ))}
        </p>
      ) : null}
    </div>
  );

  const workspace = (
    <div className={styles.workspace}>
      <div className={styles.editorHeader}>
        <span className={`mono ${styles.filename}`}>solution.py</span>
        <span className={`mono ${styles.language}`}>Python 3.11</span>
      </div>

      <CodeEditor
        value={source}
        onChange={setSource}
        onSubmit={() => void submit()}
        readOnly={submitState !== 'idle'}
      />

      <SubmitPanel
        onSubmit={() => void submit()}
        state={submitState}
        timeLimitMs={problem.time_limit_ms}
        memoryLimitMb={problem.memory_limit_mb}
        error={submitError}
      />

      <ResultPanel submission={submission} queuePosition={queuePosition} />
    </div>
  );

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{problem.title}</h1>
          {/* 제한 칩은 제목 줄에 상시 노출한다. 접거나 툴팁 뒤에 숨기지 않는다 (§6.4) —
              FBD 판정의 대부분은 제한을 못 본 데서 발생한다. */}
          <RestrictionChip restrictions={problem.restrictions} />
        </div>
        <span className={`mono ${styles.tier}`}>단계 {problem.tier}</span>
      </header>

      <nav className={styles.tabs} aria-label="문제 / 코드">
        {[
          { key: 'problem', label: '문제' },
          { key: 'code', label: '코드' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            className={tab === option.key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab(/** @type {'problem'|'code'} */ (option.key))}
            aria-pressed={tab === option.key}
          >
            {option.label}
          </button>
        ))}
      </nav>

      <div className={styles.split}>
        <section className={tab === 'problem' ? styles.paneActive : styles.pane}>{statement}</section>
        <section className={tab === 'code' ? styles.paneActive : styles.pane}>{workspace}</section>
      </div>

      <p className={styles.back}>
        <Link to="/problems">문제집으로</Link>
      </p>
    </article>
  );
}
