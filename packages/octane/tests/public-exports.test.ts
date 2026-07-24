// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	assertRequiredPublicValueExports,
	missingPublishedPublicSubpaths,
	publishedRuntimeEntries,
	REQUIRED_PUBLIC_VALUE_EXPORTS,
} from '../scripts/verify-dist.mjs';

describe('published package export contract', () => {
	it('requires committed names while permitting additive exports', () => {
		const required = REQUIRED_PUBLIC_VALUE_EXPORTS['./static'];

		expect(() =>
			assertRequiredPublicValueExports('./static', [...required, 'futureExport']),
		).not.toThrow();
		expect(() => assertRequiredPublicValueExports('./static', ['futureExport'])).toThrow(
			'./static omitted required named exports: prerender',
		);
	});

	it('checks every JavaScript branch of conditional exports', () => {
		const entries = publishedRuntimeEntries({
			'./feature': {
				types: './dist/feature.d.ts',
				import: {
					node: './dist/feature-node.mjs',
					default: './dist/feature.js',
				},
				require: ['./dist/feature.cjs', null],
			},
		});

		expect(entries).toHaveLength(3);
		expect(entries).toEqual(
			expect.arrayContaining([
				['./feature', './dist/feature-node.mjs'],
				['./feature', './dist/feature.js'],
				['./feature', './dist/feature.cjs'],
			]),
		);
	});

	it('publishes every subpath advertised to source consumers', () => {
		expect(
			missingPublishedPublicSubpaths(
				{ '.': './src/index.ts', './helper': './src/helper.ts' },
				{ '.': './dist/index.js' },
			),
		).toEqual(['./helper']);

		const manifest = JSON.parse(
			readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
		) as {
			exports: Record<string, unknown>;
			publishConfig: { exports: Record<string, unknown> };
		};

		expect(
			missingPublishedPublicSubpaths(manifest.exports, manifest.publishConfig.exports),
		).toEqual([]);
	});
});
