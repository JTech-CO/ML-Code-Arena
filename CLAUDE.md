# CLAUDE.md

> 정본은 `harness/CLAUDE.md` 다. 이 파일은 Claude Code 자동 로드 지점이며, 내용을 복제하지 않고 참조만 한다.
> 규칙을 고칠 때는 `harness/CLAUDE.md` 만 고친다.

@harness/CLAUDE.md

## 세션 시작 순서

1. `harness/PROGRESS.md` — 현재 phase·다음 할 일·미결
2. `harness/phases/M<n>_*.md` — 해당 phase 의 DoR·할 일·DoD·검증
3. `harness/docs/` — 관련 백서 절 (phase 별 참조 지도는 `harness/docs/README.md`)

## 이 저장소에서 자주 쓰는 명령

~~~bash
pnpm install
pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm check:boundaries   # 경계 룰이 실제로 위반을 막는지 확인 (INV-3)
~~~
