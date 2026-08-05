/**
 * `@mlca/shared` — 앱 간 공유 계층의 단일 진입점.
 *
 * `apps/web` · `apps/api` · `apps/worker` 가 공유해야 하는 것은 전부 여기를 통한다.
 * 앱끼리 직접 참조하는 우회는 금지한다 (docs/FILE_TREE.md §4, INV-3).
 *
 * 이 패키지는 **순수**하다. 부수효과도, 외부 의존도 갖지 않는다.
 */

export * from './verdict/index.js';
export * from './constants/index.js';
export * from './schema/index.js';
