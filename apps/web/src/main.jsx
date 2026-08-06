import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// 서체는 2종을 넘지 않는다 (docs/DESIGN.md §4.1). npm 패키지로 자체 호스팅하는 것은
// 의도다 — CDN 을 타면 오프라인 개발이 깨지고 첫 렌더가 외부 응답에 묶인다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import './styles/tokens.css';
import './styles/base.css';

import { App } from './App.jsx';

const container = document.getElementById('root');

if (!container) {
  throw new Error('마운트 대상 #root 를 찾을 수 없습니다.');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
