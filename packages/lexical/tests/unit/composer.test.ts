import { describe, it, expect, vi } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { mount, flushEffects } from '../_helpers';
import { ComposerProbe } from '../_fixtures/composer-probe.tsrx';
import { IsEmptyProbe } from '../_fixtures/is-empty-probe.tsrx';
import { nextPaint } from '../_helpers';

const throwErr = (e: unknown) => {
	throw e;
};

// Ported from @lexical/react/src/__tests__/unit/LexicalComposer.test.tsx.
describe('LexicalComposer (ported from @lexical/react)', () => {
	it('LexicalComposerContext: theme reaches the context', () => {
		const theme = {};
		let ctx: any;
		const r = mount(ComposerProbe as any, {
			initialConfig: { namespace: '', nodes: [], onError: throwErr, theme },
			onContext: (c: any) => (ctx = c),
		});
		flushEffects();
		expect(ctx[1].getTheme()).toBe(theme);
		r.unmount();
	});

	it('forwards initialConfig.onWarn to the editor as a (error, editor) handler', () => {
		const onWarn = vi.fn();
		let ctx: any;
		const r = mount(ComposerProbe as any, {
			initialConfig: { namespace: '', nodes: [], onError: throwErr, onWarn },
			onContext: (c: any) => (ctx = c),
		});
		flushEffects();
		const editor = ctx[0];
		const error = new Error('test warning');
		editor._onWarn(error);
		expect(onWarn).toHaveBeenCalledTimes(1);
		expect(onWarn).toHaveBeenCalledWith(error, editor);
		r.unmount();
	});

	// The upstream test also covers StrictMode (2 editors); octane has no StrictMode
	// double-invoke (intentional divergence), so only the single-instance case applies.
	it('creates exactly one editor and runs the initialEditorState updater once', async () => {
		const editors = new Set<any>();
		let contextCalls = 0;
		let ctx: any;
		const editorState = (editor: any) => {
			editors.add(editor);
			editor.update(() => {
				$getRoot().append($createParagraphNode().append($createTextNode('initial state')));
			});
		};
		const r = mount(ComposerProbe as any, {
			initialConfig: { namespace: '', nodes: [], onError: throwErr, editorState },
			onContext: (c: any) => {
				ctx = c;
				contextCalls++;
			},
		});
		flushEffects();
		// The updater calls editor.update nested inside initializeEditor's update; let
		// Lexical flush the queued update before reading.
		await nextPaint();
		flushEffects();
		expect(editors.size).toBe(1);
		expect(contextCalls).toBe(1);
		expect(ctx[0].read('latest', () => $getRoot().getTextContent())).toBe('initial state');
		r.unmount();
	});
});

// Ported from @lexical/react/src/__tests__/unit/useLexicalIsTextContentEmpty.test.tsx
// (manual editor, no LexicalComposer).
describe('useLexicalIsTextContentEmpty (ported from @lexical/react)', () => {
	it('hook works against a standalone editor', async () => {
		let editor: any;
		let isBlank: boolean | undefined;
		const r = mount(IsEmptyProbe as any, {
			onState: (ed: any, blank: boolean) => {
				editor = ed;
				isBlank = blank;
			},
		});
		flushEffects();
		expect(isBlank).toBe(true);

		editor.update(
			() => {
				$getRoot().append($createParagraphNode().append($createTextNode('foo')));
			},
			{ discrete: true },
		);
		flushEffects();
		await nextPaint();
		flushEffects();
		expect(isBlank).toBe(false);
		r.unmount();
	});
});
