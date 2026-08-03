// The CLI page's file trees are generated from what `octane create` actually
// writes. These cover the seam between that generated list and the hand-written
// notes bolted onto it, which is the one part a generator cannot check.
import { describe, it, expect } from 'vitest';
import manifest from '../../packages/cli/data/scaffold-manifest.json';
import { scaffoldTemplate, spaFiles, fullstackFiles } from '../src/content/scaffold-files.ts';

describe('scaffoldTemplate', () => {
	it('returns the generated paths, in the manifest’s order', () => {
		expect(spaFiles.map((entry) => entry.path)).toEqual(manifest.templates.spa);
		expect(fullstackFiles.map((entry) => entry.path)).toEqual(manifest.templates.fullstack);
	});

	it('attaches a note to the path it describes and leaves the rest bare', () => {
		const health = fullstackFiles.find((entry) => entry.path === 'src/server/health.ts');
		expect(health?.note).toBe('GET /api/health');
		expect(fullstackFiles.find((entry) => entry.path === 'src/App.tsrx')?.note).toBeUndefined();
	});

	// A rename in the CLI regenerates the manifest, so the page keeps rendering.
	// Without this the note simply stops appearing, and a page that lost a
	// sentence looks exactly like a page that never had one.
	it('refuses a note for a path the template no longer writes', () => {
		expect(() => scaffoldTemplate('spa', { 'src/Removed.tsrx': 'gone' })).toThrow(
			/no longer writes src\/Removed\.tsrx/,
		);
	});

	it('refuses a template the manifest does not describe', () => {
		expect(() => scaffoldTemplate('nonexistent')).toThrow(/no "nonexistent" template/);
	});
});
