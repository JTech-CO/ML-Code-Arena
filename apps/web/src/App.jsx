import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell.jsx';
import { ConceptDetailPage } from './routes/ConceptDetailPage.jsx';
import { ConceptsPage } from './routes/ConceptsPage.jsx';
import { NotFoundPage } from './routes/NotFoundPage.jsx';
import { ProblemDetailPage } from './routes/ProblemDetailPage.jsx';
import { ProblemsPage } from './routes/ProblemsPage.jsx';
import { RankingPage } from './routes/RankingPage.jsx';
import { useAuthStore } from './stores/auth.js';

/** 3트랙 라우팅 (docs/DESIGN.md §6.2). */
export function App() {
  const refresh = useAuthStore((state) => state.refresh);

  // 익명 잔여 한도는 서버가 준다. 첫 진입에 한 번 물어보고, 제출 뒤에 갱신한다.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/problems" replace />} />
        <Route path="/problems" element={<ProblemsPage />} />
        <Route path="/problems/:slug" element={<ProblemDetailPage />} />
        <Route path="/concepts" element={<ConceptsPage />} />
        <Route path="/concepts/:slug" element={<ConceptDetailPage />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
