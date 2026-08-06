import styles from './FilterSidebar.module.css';

/** Phase 1 은 단계 1·2·4·5 만 출제한다 (docs/TECHNICAL.md §11). */
const TIER_LABELS = {
  1: '수치·선형대수',
  2: '고전 ML',
  4: '평가·검증',
  5: '최적화',
};

/**
 * 단계·태그·상태 필터 (docs/DESIGN.md §6.3).
 *
 * 코드업의 가장 큰 구조적 약점은 난이도와 태그가 없어 탐색이 순번에만 의존한다는
 * 점이다. 이 사이드바가 그 보완이다 (§1).
 *
 * @param {{
 *   tiers: number[],
 *   tags: string[],
 *   value: { tier: number|null, tag: string|null, status: string },
 *   onChange: (next: { tier: number|null, tag: string|null, status: string }) => void,
 * }} props
 */
export function FilterSidebar({ tiers, tags, value, onChange }) {
  return (
    <aside className={styles.sidebar} aria-label="문제 필터">
      <section className={styles.group}>
        <h2 className={styles.heading}>단계</h2>
        <ul className={styles.list}>
          <li>
            <button
              type="button"
              className={value.tier === null ? `${styles.item} ${styles.active}` : styles.item}
              onClick={() => onChange({ ...value, tier: null })}
            >
              전체
            </button>
          </li>
          {tiers.map((tier) => (
            <li key={tier}>
              <button
                type="button"
                className={value.tier === tier ? `${styles.item} ${styles.active}` : styles.item}
                onClick={() => onChange({ ...value, tier })}
              >
                <span className="mono">{tier}</span>{' '}
                {TIER_LABELS[/** @type {keyof typeof TIER_LABELS} */ (tier)] ?? ''}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {tags.length > 0 ? (
        <section className={styles.group}>
          <h2 className={styles.heading}>태그</h2>
          <ul className={styles.list}>
            {tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className={value.tag === tag ? `${styles.item} ${styles.active}` : styles.item}
                  onClick={() => onChange({ ...value, tag: value.tag === tag ? null : tag })}
                >
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.group}>
        <h2 className={styles.heading}>상태</h2>
        <ul className={styles.list}>
          {[
            { key: 'all', label: '전체' },
            { key: 'unsolved', label: '미해결' },
            { key: 'solved', label: '해결' },
          ].map((option) => (
            <li key={option.key}>
              <button
                type="button"
                className={
                  value.status === option.key ? `${styles.item} ${styles.active}` : styles.item
                }
                onClick={() => onChange({ ...value, status: option.key })}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
