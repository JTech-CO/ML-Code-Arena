# tools/ — 개발·운영 CLI

런타임 경로에 포함되지 않는다 (`docs/FILE_TREE.md` §2). 루트에서 `node tools/<name>.js` 로 실행한다.

| 파일 | 역할 | phase | 상태 |
|---|---|---|---|
| `check-boundaries.js` | 모듈 경계 룰이 실제로 위반을 막는지 검증 (INV-3) | M0 | 있음 |
| `judge-cli.js` | 로컬 채점 CLI · 케이스 생성(`--prepare`, INV-10) | M1 | 있음 |
| `judge-fixtures.js` | 판정 8종 재현 + 격리 불변식 게이트 (INV-4~INV-8) | M1 | 있음 |
| `problem-sync.js` | 문제 적재·검증 (`--verify` 로 기대값 재생성, INV-10) | M6 | 예정 |
| `batch-judge.js` | 전 문제 일괄 채점 | M6 | 예정 |
| `contrast-check.js` | 토큰 대비 검사 — 라이트·다크 전 조합 (INV-12) | M4 | 있음 |
| `design-lint.js` | 색 리터럴 격리 + §12 금지 패턴 + 서체 종수 | M4 | 있음 |
| `e2e-api.js` | API→큐→워커→DB→API 종단 왕복 | M3 | 있음 |
| `migrate.js` | 평문 SQL 마이그레이션 (ADR-0008) | M2 | 있음 |
| `bench-submit.js` | 큐 수렴·동시성·지연·잔존물 관측 | M2 | 있음 |
