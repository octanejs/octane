import { afterEach, describe, expect, it } from 'vitest';
import { OverflowNode } from '@lexical/overflow';
import { $getRoot, type LexicalEditor } from 'lexical';
import { mount, nextPaint } from '../_helpers';
import { CharacterLimitEditor } from '../_fixtures/character-limit-editor.tsrx';

const MAX_LENGTH = 5;

// Ported from @lexical/react/src/__tests__/unit/LexicalCharacterLimitPlugin.test.tsx (0.51.0).
describe('CharacterLimitPlugin', () => {
	let r: ReturnType<typeof mount> | null = null;
	let editor: LexicalEditor;

	afterEach(() => {
		r?.unmount();
		r = null;
	});

	/**
	 * Mount an editor that already holds `text`, then mount the plugin on top of
	 * it -- which is what toggling the character-limit setting on does.
	 */
	async function mountWithText(
		text: string,
		charset: 'UTF-8' | 'UTF-16' = 'UTF-16',
	): Promise<void> {
		const editorRef: { current: LexicalEditor | null } = { current: null };
		r = mount(CharacterLimitEditor as any, { charset, editorRef, maxLength: MAX_LENGTH, text });
		// The plugin's mount effect reports the count through setState; commit it.
		await nextPaint();
		editor = editorRef.current!;
		expect(editor).toBeTruthy();
	}

	function remainingCharacters(): string {
		const span = r!.container.querySelector('.characters-limit');
		expect(span).not.toBe(null);
		return (span as HTMLElement).textContent ?? '';
	}

	function overflowNodeCount(): number {
		return editor.read(
			() =>
				$getRoot()
					.getAllTextNodes()
					.filter((node) => node.getParent() instanceof OverflowNode).length,
		);
	}

	it('counts the text that is already in the editor when it mounts', async () => {
		await mountWithText('hello world');

		// 5 - 11
		expect(remainingCharacters()).toBe('-6');
		expect(overflowNodeCount()).toBeGreaterThan(0);
	});

	it('reports a full budget for an editor that is under the limit', async () => {
		await mountWithText('hi');

		expect(remainingCharacters()).toBe('3');
		expect(overflowNodeCount()).toBe(0);
	});

	it('counts in the charset it was given', async () => {
		// Three 3-byte characters: 3 UTF-16 code units, 9 UTF-8 bytes.
		await mountWithText('一二三', 'UTF-8');

		expect(remainingCharacters()).toBe('-4');
	});
});
