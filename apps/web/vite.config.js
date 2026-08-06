import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env['VITE_API_TARGET'] ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,

    // API 를 같은 출처로 프록시한다.
    //
    // 세션·익명 세션 쿠키는 `SameSite=Lax` 다 (ADR-0004, docs/TECHNICAL.md §8.1).
    // Lax 쿠키는 교차 사이트 요청에 실리지 않으므로, 브라우저가 `localhost:5173` 이고
    // API 가 `127.0.0.1:3000` 이면 **익명 세션이 매 요청 새로 발급된다** — 한도가
    // 영원히 10 으로 남고 계정 승계도 성립하지 않는다.
    //
    // 쿠키를 `SameSite=None` 으로 푸는 것이 아니라 출처를 합치는 쪽을 택한다.
    // 운영에서는 web 과 api 가 같은 출처(또는 같은 사이트)에 놓이므로 Lax 가 맞고,
    // 개발 편의를 위해 운영 설정을 바꾸면 그 차이가 나중에 버그로 돌아온다.
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false,
      },
    },
  },
});
