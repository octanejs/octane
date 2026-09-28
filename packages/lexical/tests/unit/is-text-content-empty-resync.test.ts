import { describe, it, expect, afterEach } from 'vitest';
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	createEditor,
	type LexicalEditor,
	ParagraphNode,
} from 'lexical';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { IsEmptyResyncProbe } from '../_fixtures/is-empty-resync-probe.tsrx';

type MountResult = ReturnType<typeof mount>;

// Ported from @lexical/react/src/__tests__/unit/useLexicalIsTextContentEmptyResync.test.tsx (0.51.0).
// Both upstream cases are ported. Each re-renders ONE probe instance with new
// props, since a remount would re-run the useState initializer and hide the bug;
// the onMount counter asserts the instance survived.
describe('useLexicalIsTextContentEmpty re-derives its value', () => {
	let mounted: MountResult | null = null;
	let current: boolean | undefined;
	let mounts = 0;

	afterEach(() => {
		if (mounted) {
			mounted.unmount();
			mounted = null;
		}
		current = undefined;
		mounts = 0;
	});

	function makeEditor(text: string): LexicalEditor {
		const editor = createEditor({
			namespace: 'is-text-content-empty',
			nodes: [ParagraphNode],
			onError: (error) => {
				throw error;
			},
		});
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				if (text !== '') {
					paragraph.append($createTextNode(text));
				}
				$getRoot().clear().append(paragraph);
			},
			{ discrete: true },
		);
		return editor;
	}

	async function render(editor: LexicalEditor, trim: boolean): Promise<boolean> {
		const props = {
			editor,
			trim,
			onRender: (value: boolean) => {
				current = value;
			},
			onMount: () => {
				mounts++;
			},
		};
		if (mounted === null) {
			mounted = mount(IsEmptyResyncProbe as any, props);
		} else {
			mounted.update(IsEmptyResyncProbe as any, props);
		}
		flushEffects();
		await nextPaint();
		flushEffects();
		// The committed DOM agrees with the last rendered value.
		expect(mounted.find('span').getAttribute('data-empty')).toBe(String(current));
		return current!;
	}

	it('follows a change of the trim argument', async () => {
		// Whitespace-only content is empty when trimmed and not empty otherwise,
		// so the answer depends entirely on `trim`.
		const editor = makeEditor('   ');

		expect(await render(editor, false)).toBe(false);
		expect(await render(editor, true)).toBe(true);
		expect(mounts).toBe(1);
	});

	it('follows a change of the editor', async () => {
		const withText = makeEditor('hello');
		const empty = makeEditor('');

		expect(await render(withText, true)).toBe(false);
		expect(await render(empty, true)).toBe(true);
		expect(mounts).toBe(1);
	});
});
