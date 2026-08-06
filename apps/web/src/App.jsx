import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell.jsx';
import { PlaceholderPage } from './routes/PlaceholderPage.jsx';

/**
 * 3트랙 라우팅 (docs/DESIGN.md §6.2).
 *
 * 화면 내용은 M5 가 채운다. M4 는 토큰과 껍데기까지다 — 토큰이 흔들리면 컴포넌트를
 * 전부 다시 손대야 하므로 토큰을 먼저 확정한다.
 */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/problems" replace />} />
        <Route
          path="/problems"
          element={
            <PlaceholderPage
              title="문제집"
              note="단계·태그·상태 필터와 문제 목록이 이 자리에 온다. M5 에서 구현한다."
            />
          }
        />
        <Route
          path="/concepts"
          element={
            <PlaceholderPage
              title="유형 설명"
              note="개념 문서와 문제 사이의 양방향 링크가 이 자리에 온다. M5·M6 에서 구현한다."
            />
          }
        />
        <Route
          path="/ranking"
          element={
            <PlaceholderPage
              title="랭킹"
              note="해결 문제 수 기준 랭킹표와 실시간 제출 스트림이 이 자리에 온다. M5 에서 구현한다."
            />
          }
        />
        <Route
          path="*"
          element={
            <PlaceholderPage
              title="페이지를 찾을 수 없습니다"
              note="주소를 다시 확인해 주세요."
            />
          }
        />
      </Route>
    </Routes>
  );
}
