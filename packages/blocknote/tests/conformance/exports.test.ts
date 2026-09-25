import { describe, expect, it } from 'vitest';
import * as BlockNote from '@octanejs/blocknote';

describe('@octanejs/blocknote — exports', () => {
	it('ships the headless view without a default-UI BlockNoteView', () => {
		// OCTANE DIVERGENCE[blocknote-headless][conformance:blocknote-headless]:
		// @blocknote/react also exports the default UI (toolbars, menus,
		// ComponentsContext). This binding ships only the headless view, so a
		// UI-kit `BlockNoteView` must not appear to exist.
		expect(typeof BlockNote.BlockNoteViewRaw).toBe('function');
		expect(typeof BlockNote.BlockNoteViewEditor).toBe('function');
		expect('BlockNoteView' in BlockNote).toBe(false);
		expect('BlockNoteDefaultUI' in BlockNote).toBe(false);
		expect('ComponentsContext' in BlockNote).toBe(false);
	});
});
