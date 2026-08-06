import styles from './RestrictionChip.module.css';

/**
 * 제한 칩 (docs/DESIGN.md §6.4).
 *
 * **툴팁·아코디언 뒤에 숨기지 않는다.** `FBD` 판정의 대부분은 제한을 못 본 데서
 * 발생한다. 접어 두면 사용자는 제출하고 나서야 규칙을 알게 된다.
 *
 * `compact` 는 목록용이다. 목록의 행 높이는 40px 로 고정돼 있고 (§6.3), 칩이 두 줄로
 * 접히는 순간 행이 부풀어 한 화면에 15행이 들어가지 않는다. 목록에서는 가장 중요한
 * 제한 하나(허용 목록)만 보이고, **전체 제한은 상세 화면의 제목 줄**에서 전부 노출된다.
 * 숨기는 것이 아니라 두 화면이 역할을 나누는 것이다.
 *
 * @param {{ restrictions: Record<string, any>|null, compact?: boolean }} props
 */
export function RestrictionChip({ restrictions, compact = false }) {
  if (!restrictions) return null;

  /** @type {string[]} */
  const chips = [];

  const allowed = restrictions['allowed_imports'];
  if (Array.isArray(allowed) && allowed.length > 0) {
    chips.push(`${allowed.join(' · ')}만`);
  }

  if (!compact) {
    const forbiddenAttributes = restrictions['forbidden_attributes'];
    if (Array.isArray(forbiddenAttributes)) {
      for (const attribute of forbiddenAttributes) chips.push(`${attribute} 금지`);
    }

    const forbiddenImports = restrictions['forbidden_imports'];
    if (Array.isArray(forbiddenImports)) {
      for (const name of forbiddenImports) chips.push(`${name} 금지`);
    }
  }

  if (chips.length === 0) return null;

  return (
    <span className={compact ? `${styles.group} ${styles.compact}` : styles.group}>
      {chips.map((chip) => (
        <span key={chip} className={`mono ${styles.chip}`}>
          {chip}
        </span>
      ))}
    </span>
  );
}
