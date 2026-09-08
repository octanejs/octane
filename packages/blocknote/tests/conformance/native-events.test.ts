import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(import.meta.dirname, '../../src');

const collectTsrxSources = (directory: string): string[] =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			return collectTsrxSources(path);
		}

		return entry.isFile() && entry.name.endsWith('.tsrx') ? [path] : [];
	});

describe('@octanejs/blocknote — native events', () => {
	it('does not unwrap Octane keyboard events as React synthetic events', () => {
		// OCTANE DIVERGENCE[blocknote-native-keyboard-events][conformance:blocknote-native-keyboard-events]:
		// Octane handlers receive native DOM events, while React handlers receive synthetic wrappers.
		const syntheticEventAssumptions = collectTsrxSources(sourceRoot).flatMap((file) =>
			readFileSync(file, 'utf8').includes('.nativeEvent') ? [relative(sourceRoot, file)] : [],
		);

		expect(syntheticEventAssumptions).toEqual([]);
	});
});
