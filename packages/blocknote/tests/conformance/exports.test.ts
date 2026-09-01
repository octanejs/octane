import { describe, expect, it } from 'vitest';
import * as BlockNote from '@octanejs/blocknote';

describe('@octanejs/blocknote — exports', () => {
	it('exports milestone-1 editor bootstrap symbols', () => {
		expect(typeof BlockNote.useCreateBlockNote).toBe('function');
		expect(typeof BlockNote.useBlockNoteEditor).toBe('function');
		expect(typeof BlockNote.useBlockNoteContext).toBe('function');
		expect(BlockNote.BlockNoteContext).toBeTruthy();
	});

	it('keeps the unfinished editor view outside the milestone-1 surface', () => {
		expect('BlockNoteViewRaw' in BlockNote).toBe(false);
		expect('BlockNoteView' in BlockNote).toBe(false);
	});
});
