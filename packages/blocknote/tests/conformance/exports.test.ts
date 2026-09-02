import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as BlockNote from '@octanejs/blocknote';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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

	it('packs only the supported milestone-1 source surface', () => {
		const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
		expect(manifest.files).toEqual([
			'src/index.ts',
			'src/editor/BlockNoteContext.ts',
			'src/hooks/useBlockNoteEditor.ts',
			'src/hooks/useCreateBlockNote.tsrx',
			'README.md',
		]);
	});
});
