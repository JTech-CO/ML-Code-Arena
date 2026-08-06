import { Moon, Sun } from 'lucide-react';

import { useThemeStore } from '../stores/theme.js';

import styles from './ThemeToggle.module.css';

/**
 * 라이트/다크 전환 (docs/DESIGN.md §8.4).
 *
 * 라벨 텍스트를 함께 두지 않는다 — 아이콘 하나로 충분하고, 상단 내비의 밀도를 지킨다.
 * `aria-label` 은 현재 상태가 아니라 **전환 후 상태**로 쓴다. 버튼의 이름은
 * 그것을 눌렀을 때 일어나는 일이어야 한다.
 */
export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const toggle = useThemeStore((state) => state.toggle);
  const nextLabel = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';

  return (
    <button type="button" className={styles.button} onClick={toggle} aria-label={nextLabel}>
      {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
