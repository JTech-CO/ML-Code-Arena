import { VERDICTS, VERDICT_META } from '@mlca/shared';

/**
 * M0 스캐폴딩 확인용 임시 화면.
 *
 * 실제 화면은 M4(디자인 토큰 + AppShell) 확정 후 M5 에서 만든다.
 * 여기서는 `packages/shared` 의 판정 코드가 웹 번들까지 도달하는지만 확인한다.
 * 스타일을 넣지 않는 것은 의도다 — 토큰이 확정되기 전 임시 스타일은 M4 에서 전부 걷어내야 한다.
 */
export function App() {
  return (
    <main>
      <h1>ML Code Arena</h1>
      <p>M0 스캐폴딩. 화면은 M4·M5 에서 구현한다.</p>

      <h2>판정 코드</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">코드</th>
            <th scope="col">의미</th>
            <th scope="col">발생 조건</th>
          </tr>
        </thead>
        <tbody>
          {VERDICTS.map((code) => (
            <tr key={code}>
              <td>{code}</td>
              <td>{VERDICT_META[code].meaning}</td>
              <td>{VERDICT_META[code].cause}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
