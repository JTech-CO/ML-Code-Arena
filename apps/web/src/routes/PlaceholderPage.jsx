import styles from './PlaceholderPage.module.css';

/**
 * M5 가 채울 자리.
 *
 * 빈 화면은 분위기를 만드는 자리가 아니라 다음 행동을 지시하는 자리다
 * (docs/DESIGN.md §11.3). 여기서는 아직 지시할 행동이 없으므로 무엇이 올 자리인지만
 * 적는다. 로딩 스피너나 스켈레톤을 두지 않는다 — 기다릴 것이 없다.
 *
 * @param {{ title: string, note: string }} props
 */
export function PlaceholderPage({ title, note }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className={styles.note}>{note}</p>
    </section>
  );
}
