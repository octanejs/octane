import { describe, it, expect } from 'vitest';
import { createEditor } from 'lexical';
import {
	LexicalComposerContext,
	createLexicalComposerContext,
	useLexicalComposerContext,
} from '@octanejs/lexical';
// Per-subpath import — the drop-in path that mirrors @lexical/react's module
// layout (`@lexical/react/LexicalComposerContext` → swap the scope only).
import { createLexicalComposerContext as createViaSubpath } from '@octanejs/lexical/LexicalComposerContext';

// Phase 0 scaffold smoke test: proves the package resolves via its alias, the
// Lexical 0.46.0 core is installed, and the composer-context foundation works.
describe('@octanejs/lexical scaffold', () => {
	it('resolves the Lexical core dependency', () => {
		expect(typeof createEditor).toBe('function');
	});

	it('exports the composer-context foundation (barrel + per-subpath)', () => {
		expect(LexicalComposerContext).toBeTruthy();
		expect(typeof createLexicalComposerContext).toBe('function');
		expect(typeof useLexicalComposerContext).toBe('function');
		// The subpath export resolves to the same implementation as the barrel.
		expect(createViaSubpath).toBe(createLexicalComposerContext);
	});

	it('createLexicalComposerContext resolves theme, inheriting from a parent', () => {
		const theme = { paragraph: 'my-paragraph' };
		const root = createLexicalComposerContext(undefined, theme);
		expect(root.getTheme()).toBe(theme);

		// A child with no theme of its own inherits the parent's.
		const editor = createEditor({ namespace: 'test', onError: () => {} });
		const child = createLexicalComposerContext([editor, root], undefined);
		expect(child.getTheme()).toBe(theme);

		// A child with its own theme overrides the parent's.
		const ownTheme = { paragraph: 'child-paragraph' };
		const childWithTheme = createLexicalComposerContext([editor, root], ownTheme);
		expect(childWithTheme.getTheme()).toBe(ownTheme);
	});
});
