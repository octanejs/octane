import * as upstreamReact from '@apollo/client/react';
import * as octaneReact from '@octanejs/apollo-client/react';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

describe('@octanejs/apollo-client/react export surface', () => {
	it('keeps React imports out of the authored binding and public declarations', () => {
		// Core owns the @types/react basis for its migration aliases. Check this
		// binding's own imports without poisoning that transitive dependency.
		const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src');
		const violations: string[] = [];
		for (const file of readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })) {
			if (!/\.(?:ts|tsx|tsrx|js)$/.test(file)) continue;
			const source = readFileSync(join(sourceRoot, file), 'utf8');
			for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
				if (/^(?:react|react-dom)(?:\/|$)/.test(imported.fileName)) {
					violations.push(`${file}: ${imported.fileName}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('provides every runtime export from @apollo/client/react', () => {
		const port = new Set(Object.keys(octaneReact));
		const missing = Object.keys(upstreamReact)
			.filter((name) => !port.has(name))
			.sort();
		expect(missing).toEqual([]);
	});

	it('does not expose runtime names absent from @apollo/client/react', () => {
		const upstream = new Set(Object.keys(upstreamReact));
		const extras = Object.keys(octaneReact)
			.filter((name) => !upstream.has(name))
			.sort();
		expect(extras).toEqual([]);
	});
});
