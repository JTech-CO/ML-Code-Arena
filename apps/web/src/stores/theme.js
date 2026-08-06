/**
 * 테마 상태 (ADR-0006).
 *
 * 초기값을 `localStorage` 가 아니라 **DOM 에서 읽는다.** `<head>` 의 인라인 스크립트가
 * 이미 `data-theme` 을 확정했으므로, 여기서 다시 저장소를 읽으면 두 곳이 판단하게 되고
 * 어긋날 여지가 생긴다. DOM 이 단일 출처다.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'mlca-theme';

/** @returns {'light'|'dark'} */
function currentTheme() {
  return document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
}

/**
 * @typedef {object} ThemeState
 * @property {'light'|'dark'} theme
 * @property {() => void} toggle
 */

export const useThemeStore = create(
  /** @type {import('zustand').StateCreator<ThemeState>} */ ((set, get) => ({
    theme: currentTheme(),

    toggle() {
      const next = get().theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset['theme'] = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // 저장이 막혀도 이번 세션의 전환은 동작해야 한다.
      }
      set({ theme: next });
    },
  })),
);
