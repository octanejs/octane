import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as BlockNote from '@octanejs/blocknote';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('@octanejs/blocknote exports', () => {
	it('exports the core editor adapter', () => {
		expect(BlockNote.BlockNoteContext).toBeTruthy();
		expect(BlockNote.BlockNoteView).toBeTypeOf('function');
		expect(BlockNote.BlockNoteViewEditor).toBeTypeOf('function');
		expect(BlockNote.useBlockNoteContext).toBeTypeOf('function');
		expect(BlockNote.useBlockNoteEditor).toBeTypeOf('function');
		expect(BlockNote.useCreateBlockNote).toBeTypeOf('function');
	});

	it('keeps the package private while retained port provenance is unresolved', () => {
		const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

		expect(manifest.private).toBe(true);
		expect(manifest.license).toBe('SEE LICENSE IN UPSTREAM.md');
		expect(manifest.dependencies).toEqual({ '@blocknote/core': 'catalog:default' });
		expect(manifest.files).toEqual(['src', 'README.md', 'UPSTREAM.md', 'LICENSE']);
	});
});
