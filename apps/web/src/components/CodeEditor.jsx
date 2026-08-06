import { python } from '@codemirror/lang-python';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

import { useThemeStore } from '../stores/theme.js';

import styles from './CodeEditor.module.css';

/**
 * 구문 강조 — **단색 위계**다.
 *
 * 백서가 "중성색 1계열 + accent 1색 + 판정 상태색, 그 외의 색은 없다"고 못박았다(§3.1).
 * 에디터를 위해 팔레트를 새로 만들면 그 규칙이 깨지고, 한 번 깨지면 다음 화면에서도
 * 깨진다. 대신 명도와 굵기로 위계를 만든다 — 제출 코드가 30줄 남짓이라 이 정도로
 * 충분히 읽힌다. 라이트·다크 모두 토큰을 그대로 쓰므로 테마 전환이 자동으로 따라온다.
 */
const monochromeHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword], fontWeight: '500' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], fontWeight: '500' },
  { tag: [tags.string, tags.number, tags.bool, tags.null], color: 'var(--text-secondary)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--text-muted)' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--text-secondary)' },
]);

/**
 * CodeMirror 6 래퍼.
 *
 * `@uiw/react-codemirror` 를 쓰지 않는 이유는 그것이 `@codemirror/theme-one-dark` 를
 * 필수 peer 로 끌고 오기 때문이다. one-dark 배경은 `--bg-canvas` 와 어긋나고,
 * 에디터 배경이 주변과 다르면 화면이 쪼개져 보인다 (M5 리스크 항목).
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   onSubmit?: () => void,
 *   readOnly?: boolean,
 * }} props
 */
export function CodeEditor({ value, onChange, onSubmit, readOnly = false }) {
  const host = useRef(/** @type {HTMLDivElement|null} */ (null));
  const view = useRef(/** @type {EditorView|null} */ (null));
  const editable = useRef(new Compartment());
  const theme = useThemeStore((state) => state.theme);

  // 콜백을 ref 로 잡아 둔다. 매 렌더마다 EditorView 를 다시 만들면 커서와
  // 실행 취소 이력이 날아간다.
  const handlers = useRef({ onChange, onSubmit });
  handlers.current = { onChange, onSubmit };

  useEffect(() => {
    if (!host.current) return undefined;

    const compartment = editable.current;
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          python(),
          syntaxHighlighting(monochromeHighlight),
          // 제출 단축키 (§10). 에디터에 포커스가 있을 때도 동작해야 한다 —
          // 코드를 다 쓰고 마우스로 버튼을 찾아가는 것은 흐름을 끊는다.
          //
          // `Prec.highest` 가 필요하다. CodeMirror 의 `defaultKeymap`(basicSetup 에 포함)이
          // 이미 `Mod-Enter` 를 `insertBlankLine` 에 묶어 두었고, 그냥 등록하면 그쪽이
          // 이겨서 제출 대신 빈 줄이 삽입된다.
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                preventDefault: true,
                run: () => {
                  handlers.current.onSubmit?.();
                  return true;
                },
              },
            ]),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
          compartment.of(EditorView.editable.of(!readOnly)),
          EditorView.theme({
            '&': {
              fontSize: '13px',
              backgroundColor: 'var(--bg-canvas)',
              color: 'var(--text-primary)',
              height: '100%',
            },
            '.cm-content': {
              fontFamily: 'var(--font-mono)',
              caretColor: 'var(--accent)',
            },
            '.cm-gutters': {
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-muted)',
              border: 'none',
              borderRight: '1px solid var(--border)',
            },
            '.cm-activeLine': { backgroundColor: 'var(--bg-hover)' },
            '.cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)' },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
              backgroundColor: 'var(--accent-bg)',
            },
            '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '-2px' },
            '.cm-cursor': { borderLeftColor: 'var(--accent)' },
          }),
        ],
      }),
    });

    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // 최초 1회만 만든다. value·readOnly 는 아래 effect 들이 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 바깥에서 값이 바뀐 경우(초기 로드·초기화)만 문서를 교체한다.
  useEffect(() => {
    const instance = view.current;
    if (!instance || instance.state.doc.toString() === value) return;
    instance.dispatch({ changes: { from: 0, to: instance.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure(EditorView.editable.of(!readOnly)),
    });
  }, [readOnly]);

  // 색은 전부 CSS 변수라 테마 전환이 자동으로 따라온다. data 속성은 확인용이다.
  return <div ref={host} className={styles.editor} data-theme={theme} />;
}
