import styles from './ShapeDiff.module.css';

/**
 * shape 대조 블록 (docs/DESIGN.md §2.3).
 *
 * ML 입문자의 최다 오류가 축(axis) 실수이므로, **이 블록 하나가 오답 피드백의 대부분을
 * 담당한다.** 그래서 결과 패널에서 가장 눈에 띄는 자리에 둔다.
 *
 * **기대값 자체는 절대 표시하지 않는다** (INV-5). 여기 오는 것은 shape·길이·타입 이름
 * 까지다. 서버가 이미 그것만 주지만, 화면에서도 형태만 읽는다 — 응답에 없어야 할 것이
 * 섞여 들어와도 여기서 다시 걸린다.
 *
 * @param {{ detail: Record<string, any>|null }} props
 */
export function ShapeDiff({ detail }) {
  if (!detail) return null;

  /** @param {unknown} shape */
  const format = (shape) => {
    if (!Array.isArray(shape)) return null;
    if (shape.length === 0) return '()';
    if (shape.length === 1) return `(${shape[0]},)`;
    return `(${shape.join(', ')})`;
  };

  /** @type {{ label: string, expected: string, actual: string }|null} */
  let rows = null;

  const expectedShape = format(detail['expected_shape']);
  const actualShape = format(detail['actual_shape']);
  if (expectedShape && actualShape) {
    rows = { label: 'shape', expected: expectedShape, actual: actualShape };
  } else if (detail['expected_type'] && detail['actual_type']) {
    rows = { label: '타입', expected: detail['expected_type'], actual: detail['actual_type'] };
  } else if (detail['expected_length'] !== undefined && detail['actual_length'] !== undefined) {
    rows = {
      label: '길이',
      expected: String(detail['expected_length']),
      actual: String(detail['actual_length']),
    };
  } else if (expectedShape) {
    // 값 불일치라 shape 는 같다. 그래도 어떤 형태를 다뤘는지는 알려준다.
    return (
      <dl className={styles.block}>
        <dt className={styles.term}>shape</dt>
        <dd className={`mono ${styles.value}`}>{expectedShape}</dd>
      </dl>
    );
  }

  if (!rows) return null;

  return (
    <dl className={styles.block}>
      <dt className={styles.term}>기대 {rows.label}</dt>
      <dd className={`mono ${styles.value}`}>{rows.expected}</dd>
      <dt className={styles.term}>실제 {rows.label}</dt>
      <dd className={`mono ${styles.value}`}>{rows.actual}</dd>
    </dl>
  );
}
