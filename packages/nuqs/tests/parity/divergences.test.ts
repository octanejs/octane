import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('@octanejs/nuqs documented integration divergences', () => {
	// OCTANE DIVERGENCE[router-adapters-unavailable][conformance:nuqs-router-adapters]
	// @parity-case conformance:nuqs-router-adapters
	it('exports only the standalone, custom, and testing adapters', () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
		) as { exports: Record<string, string> };
		expect(Object.keys(packageJson.exports).filter((key) => key.startsWith('./adapters/'))).toEqual(
			['./adapters/react', './adapters/custom', './adapters/testing'],
		);
	});

	// OCTANE DIVERGENCE[local-transition-start-type][conformance:nuqs-transition-type]
	// @parity-case conformance:nuqs-transition-type
	it('declares TransitionStartFunction without a React type dependency', () => {
		const source = readFileSync(resolve(__dirname, '../../src/defs.ts'), 'utf8');
		expect(source).toMatch(/export type TransitionStartFunction/);
		expect(source).not.toMatch(/from ['"]react['"]/);
	});
});
