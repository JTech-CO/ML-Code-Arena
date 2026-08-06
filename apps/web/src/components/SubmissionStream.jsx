import { useEffect, useState } from 'react';

import { streamUrl } from '../api/client.js';
import { EMPTY } from '../copy.js';

import { EmptyState } from './States.jsx';
import styles from './SubmissionStream.module.css';
import { VerdictLabel } from './VerdictLabel.jsx';


const MAX_ITEMS = 30;

/**
 * 실시간 제출 스트림 (docs/DESIGN.md §6.5, docs/TECHNICAL.md §7.4).
 *
 * 새 항목은 상단에 추가되며 **120ms fade-in 만** 적용한다. 슬라이드·바운스·펄스 없음.
 * 목록이 계속 움직이면 읽던 항목을 놓친다.
 *
 * 익명 제출은 서버가 스트림에 싣지 않는다 (INV-9 인접 규칙). 프론트에서 거르지 않는
 * 것은 의도다 — 거를 것이 있다면 이미 서버가 잘못 보낸 것이다.
 */
export function SubmissionStream() {
  const [items, setItems] = useState(/** @type {Record<string, any>[]} */ ([]));
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(streamUrl(), { withCredentials: true });

    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('submission', (event) => {
      try {
        const parsed = JSON.parse(/** @type {MessageEvent} */ (event).data);
        setItems((current) => [parsed, ...current].slice(0, MAX_ITEMS));
      } catch {
        // 형식이 깨진 이벤트 하나로 스트림 전체를 끊지 않는다.
      }
    });
    source.addEventListener('error', () => setConnected(false));

    return () => source.close();
  }, []);

  if (items.length === 0) {
    return <EmptyState message={connected ? EMPTY.stream : '스트림에 연결하는 중'} />;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <span className={styles.handle}>{item.handle}</span>
          <span className={styles.problem}>{item.problem}</span>
          <span className={`mono ${styles.runtime}`}>{item.runtime_ms ?? 0}ms</span>
          <VerdictLabel verdict={item.verdict} />
        </li>
      ))}
    </ul>
  );
}
