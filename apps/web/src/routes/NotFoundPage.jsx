import { Link } from 'react-router-dom';

/** 사과하지 않고 다음 행동을 지시한다 (docs/DESIGN.md §11.1·§11.3). */
export function NotFoundPage() {
  return (
    <section>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>
        <Link to="/problems">문제집으로</Link>
      </p>
    </section>
  );
}
