/**
 * Octane-only unpaired framework-contract tests for the public adapter surface.
 * Outside react-parity ownership — see packages/inertia/UPSTREAM.md.
 */
import { describe, expect, it } from 'vitest';
import * as core from '@inertiajs/core';
import * as binding from '@octanejs/inertia';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

describe('@octanejs/inertia framework-neutral exports', () => {
	it('keeps React imports out of the authored binding, including its public types', () => {
		// Octane owns and ships the @types/react basis for its migration aliases.
		// Poisoning React resolution globally also poisons that transitive basis;
		// enforce this binding's dependency boundary at its authored imports.
		const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src');
		const violations: string[] = [];
		for (const file of readdirSync(sourceRoot, { recursive: true })) {
			if (!/\.(?:ts|tsx|tsrx|js)$/.test(file)) continue;
			const source = readFileSync(join(sourceRoot, file), 'utf8');
			for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
				if (/^(?:react|react-dom|@inertiajs\/react)(?:\/|$)/.test(imported.fileName)) {
					violations.push(`${file}: ${imported.fileName}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it('preserves the upstream core singleton identities', () => {
		expect(binding.router).toBe(core.router);
		expect(binding.http).toBe(core.http);
		expect(binding.progress).toBe(core.progress);
	});

	it('does not expose an accidental partial adapter surface', () => {
		expect(Object.keys(binding).sort()).toEqual([
			'config',
			'http',
			'progress',
			'resetLayoutProps',
			'router',
			'setLayoutProps',
			'useForm',
			'useHttp',
			'usePage',
			'usePoll',
			'usePrefetch',
			'useRemember',
		]);
	});
});
