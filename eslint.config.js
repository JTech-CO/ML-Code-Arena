import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * 모듈 경계 규칙 — docs/FILE_TREE.md §3 의 표를 그대로 옮긴 것이다 (INV-3).
 *
 * `target` = import 하는 쪽, `from` = import 당하는 쪽.
 * 경계가 느슨하면 M3~M5 에서 위반이 누적되어 발견이 늦어진다.
 * 이 룰이 실제로 위반을 막는지는 `pnpm check:boundaries` 로 매번 확인한다.
 */
const BOUNDARY_ZONES = [
  {
    target: './apps/web',
    from: ['./apps/api', './apps/worker'],
    message:
      'apps/web 은 apps/api·apps/worker 를 import 할 수 없습니다. HTTP 로만 통신합니다 (docs/FILE_TREE.md §3, INV-3).',
  },
  {
    target: './apps/api',
    from: ['./apps/web', './apps/worker'],
    message:
      'apps/api 는 apps/web·apps/worker 를 import 할 수 없습니다. 워커와는 큐로만 통신합니다 (docs/FILE_TREE.md §3, INV-3).',
  },
  {
    target: './apps/worker',
    from: ['./apps/web', './apps/api'],
    message:
      'apps/worker 는 apps/web·apps/api 를 import 할 수 없습니다 (docs/FILE_TREE.md §3, INV-3).',
  },
  {
    target: './packages/shared',
    from: ['./apps', './tools', './judge'],
    message:
      'packages/shared 는 순수해야 합니다. 어떤 앱도 import 하지 않습니다 (docs/FILE_TREE.md §3·§4, INV-3).',
  },
  {
    target: ['./apps', './packages', './tools'],
    from: './judge',
    message:
      'JS 코드는 judge/ 를 import 할 수 없습니다. 워커는 파일 경로와 컨테이너로만 접촉합니다 (docs/FILE_TREE.md §3).',
  },
];

/**
 * 워크스페이스 패키지 이름으로 우회하는 경로를 함께 막는다.
 * `import/no-restricted-paths` 는 해석된 파일 경로 기준이므로,
 * 패키지 이름 import 는 이쪽에서 이중으로 차단한다.
 *
 * @param {string[]} forbidden
 * @param {string} message
 */
const restrictPackages = (forbidden, message) => [
  'error',
  {
    patterns: [
      {
        group: forbidden.flatMap((name) => [name, `${name}/*`]),
        message,
      },
    ],
  },
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      // 제출 원문과 임시 산출물이 머무는 곳. 소스가 아니다.
      '.judge-work/**',
      // Python 및 문서·하네스는 JS 린트 대상이 아니다.
      'judge/**',
      'problems/**',
      'harness/**',
      'docs/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { import: importPlugin },
    settings: {
      // 경계 룰이 필요로 하는 것은 **상대 경로 해석**이다. 기본 node 리졸버로 충분하다.
      'import/resolver': {
        node: { extensions: ['.js', '.jsx', '.json'] },
      },
      // 워크스페이스 패키지를 external 이 아닌 internal 그룹으로 분류한다.
      'import/internal-regex': '^@mlca/',
    },
    rules: {
      'import/no-restricted-paths': ['error', { basePath: ROOT, zones: BOUNDARY_ZONES }],
      // `import/no-unresolved` 는 켜지 않는다. 구형 node 리졸버가 `exports` 전용 ESM 패키지
      // (vite·@vitejs/plugin-react 등)를 못 찾아 오탐이 나고, 이를 해결하려면 네이티브 바이너리
      // 리졸버를 물어야 한다. 미해결 import 는 `pnpm typecheck` 가 TS2307 로 이미 잡는다.
      'import/no-self-import': 'error',
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      'import/no-absolute-path': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  {
    files: ['apps/web/src/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { react: reactPlugin },
    settings: { react: { version: '18.3' } },
    rules: {
      // JSX 안의 참조를 "사용"으로 인식시킨다. 없으면 컴포넌트 import 가
      // 전부 no-unused-vars 로 잡힌다. 자동 JSX 런타임이므로 jsx-uses-react 는 불필요하다.
      'react/jsx-uses-vars': 'error',
      'no-restricted-imports': restrictPackages(
        ['@mlca/api', '@mlca/worker'],
        'apps/web 은 다른 앱을 import 할 수 없습니다. HTTP 로만 통신합니다 (INV-3).',
      ),
    },
  },

  {
    files: ['apps/api/src/**/*.js'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': restrictPackages(
        ['@mlca/web', '@mlca/worker'],
        'apps/api 는 다른 앱을 import 할 수 없습니다. 워커와는 큐로만 통신합니다 (INV-3).',
      ),
    },
  },

  {
    files: ['apps/worker/src/**/*.js'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': restrictPackages(
        ['@mlca/web', '@mlca/api'],
        'apps/worker 는 다른 앱을 import 할 수 없습니다 (INV-3).',
      ),
    },
  },

  {
    files: ['packages/shared/src/**/*.js'],
    languageOptions: { globals: globals.node },
    rules: {
      // shared 는 외부 의존을 갖지 않는다. dependencies 가 비어 있으므로
      // node 내장 모듈 외의 어떤 bare import 도 여기서 걸린다 (docs/FILE_TREE.md §2).
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/*.test.js'],
          optionalDependencies: false,
          peerDependencies: false,
          packageDir: path.join(ROOT, 'packages', 'shared'),
        },
      ],
      'no-restricted-imports': restrictPackages(
        ['@mlca/web', '@mlca/api', '@mlca/worker'],
        'packages/shared 는 순수해야 합니다. 어떤 앱도 import 하지 않습니다 (INV-3).',
      ),
    },
  },

  {
    files: ['tools/**/*.js', '**/*.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
