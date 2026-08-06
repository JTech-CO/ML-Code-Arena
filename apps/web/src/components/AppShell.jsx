import { NavLink, Outlet } from 'react-router-dom';

import styles from './AppShell.module.css';
import { ThemeToggle } from './ThemeToggle.jsx';


/**
 * 상단 내비 3트랙 (docs/DESIGN.md §6.2).
 *
 * 트랙이 3개뿐이므로 데스크톱에서 햄버거 메뉴를 쓰지 않는다. 전부 노출한다.
 * 4번째 트랙 슬롯은 Phase 2 의 대회(아레나) 자리다 (부록 B).
 */
const TRACKS = [
  { to: '/problems', label: '문제집' },
  { to: '/concepts', label: '유형 설명' },
  { to: '/ranking', label: '랭킹' },
];

/**
 * 상단 내비 + 본문 슬롯.
 *
 * 활성 트랙은 하단 2px accent 밑줄로만 표시한다. 배경 채움이나 볼드 전환을 함께
 * 쓰지 않는다 — 표시 수단이 셋이면 어느 것이 활성 신호인지 흐려진다.
 */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        본문으로 건너뛰기
      </a>

      <header className={styles.header}>
        <nav className={styles.nav} aria-label="주요 메뉴">
          <NavLink to="/problems" className={styles.brand}>
            ML Code Arena
          </NavLink>

          <ul className={styles.tracks}>
            {TRACKS.map((track) => (
              <li key={track.to}>
                <NavLink
                  to={track.to}
                  className={({ isActive }) =>
                    isActive ? `${styles.track} ${styles.trackActive}` : styles.track
                  }
                >
                  {track.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <main id="main" className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
