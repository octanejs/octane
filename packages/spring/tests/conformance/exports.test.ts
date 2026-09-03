import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as binding from '../../src/index';
import * as parallax from '../../src/parallax';
import { SpringValue } from '../../src/engine';
import crosswalk from '../../audit/export-crosswalk.json';

describe('pinned public runtime exports', () => {
	it('matches @react-spring/web@10.1.2 in both directions', () => {
		expect(Object.keys(binding).sort()).toEqual(Object.keys(crosswalk.root).sort());
		expect(new SpringValue(0)).toBeInstanceOf(binding.FrameValue);
	});

	it('matches @react-spring/parallax@10.1.2 in both directions', () => {
		expect(Object.keys(parallax).sort()).toEqual(Object.keys(crosswalk.parallax).sort());
	});
});

it('keeps React imports out of authored Spring source and adapted type probes', () => {
	const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
	const violations: string[] = [];
	for (const directory of ['src', 'typetests']) {
		for (const file of readdirSync(join(packageRoot, directory), { recursive: true })) {
			if (!/\.(?:ts|tsx|tsrx|js)$/.test(file)) continue;
			const source = readFileSync(join(packageRoot, directory, file), 'utf8');
			for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
				if (/^(?:react|react-dom)(?:\/|$)/.test(imported.fileName)) {
					violations.push(`${directory}/${file}: ${imported.fileName}`);
				}
			}
		}
	}
	expect(violations).toEqual([]);
});
