import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectDiagnostics } from '../../src/compiler/compile.js';
import {
	STRONG_DIAGNOSTIC_SECTIONS,
	STRONG_DIAGNOSTICS,
	STRONG_RECIPES,
} from '../../src/compiler/strong-diagnostics.js';

const REPO = join(import.meta.dirname, '../../../..');

// Every Strong code the compiler or CLI can report, read from the sources that
// report them, so a new code cannot ship without a catalog entry.
function reportedCodes() {
	const codes = new Set<string>();
	for (const dir of ['packages/octane/src/compiler', 'packages/cli/src/commands/analyze']) {
		for (const file of readdirSync(join(REPO, dir))) {
			if (!file.endsWith('.js') || file === 'strong-diagnostics.js') continue;
			const source = readFileSync(join(REPO, dir, file), 'utf8');
			for (const [code] of source.matchAll(/OCTANE_STRONG_[A-Z0-9_]+/g)) {
				// A prefix such as `OCTANE_STRONG_` used to build or test a code.
				if (!code.endsWith('_')) codes.add(code);
			}
		}
	}
	return codes;
}

function errorCodes(source: string, filename: string) {
	const { diagnostics, error } = collectDiagnostics(`"use strong";\n${source}`, filename);
	expect(error, String(error)).toBe(null);
	return diagnostics
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
}

describe('Strong diagnostic catalog', () => {
	it('documents every Strong code the compiler and CLI report, and no others', () => {
		const catalogued = new Set(STRONG_DIAGNOSTICS.map((entry) => entry.code));
		const reported = reportedCodes();
		expect([...reported].filter((code) => !catalogued.has(code)).sort()).toEqual([]);
		// The one entry that is not a Strong code is the native text onChange
		// warning Strong promotes to an error.
		expect([...catalogued].filter((code) => !reported.has(code))).toEqual([
			'OCTANE_NATIVE_TEXT_ONCHANGE',
		]);
	});

	it('places every code in a known section, once', () => {
		const sections = new Set(STRONG_DIAGNOSTIC_SECTIONS.map((section) => section.id));
		const codes = STRONG_DIAGNOSTICS.map((entry) => entry.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const entry of STRONG_DIAGNOSTICS) expect(sections.has(entry.section)).toBe(true);
	});

	// A recipe is the replacement the docs, CLI, and MCP server teach for a
	// React idiom. Both halves are compiled so neither can drift from what the
	// compiler actually accepts.
	for (const recipe of STRONG_RECIPES) {
		it(`recipe ${recipe.id}: the React idiom reports its codes and the replacement compiles`, () => {
			const filename = `/src/${recipe.id}.tsx`;
			expect([...new Set(errorCodes(recipe.before, filename))].sort()).toEqual(
				[...recipe.codes].sort(),
			);
			expect(errorCodes(recipe.after, filename)).toEqual([]);
		});
	}
});
