/**
 * 인증·익명 잔여 한도 상태.
 *
 * 잔여 한도를 **클라이언트가 계산하지 않는다.** 서버가 `GET /api/auth/me` 로 주는 값을
 * 그대로 보여준다. 프론트가 세면 제출할 때마다 하나씩 빼는 로직이 생기고, 그 로직은
 * 서버 판단과 어긋나는 순간 사용자에게 거짓말을 한다 (INV-9).
 */

import { create } from 'zustand';

import { get } from '../api/client.js';

/**
 * @typedef {object} AuthState
 * @property {boolean} loaded
 * @property {{ id: string, email: string, handle: string }|null} user
 * @property {{ solved_count: number, limit: number, remaining: number }|null} anonymous
 * @property {boolean} quotaDismissed
 * @property {() => Promise<void>} refresh
 * @property {() => void} dismissQuota
 */

export const useAuthStore = create(
  /** @type {import('zustand').StateCreator<AuthState>} */ ((set) => ({
    loaded: false,
    user: null,
    anonymous: null,
    quotaDismissed: false,

    async refresh() {
      try {
        const body = await get('/api/auth/me');
        set({
          loaded: true,
          user: body.user ?? null,
          anonymous: body.anonymous ?? null,
        });
      } catch {
        // 서버가 없어도 화면은 떠야 한다. 비로그인으로 둔다.
        set({ loaded: true, user: null, anonymous: null });
      }
    },

    dismissQuota() {
      set({ quotaDismissed: true });
    },
  })),
);
