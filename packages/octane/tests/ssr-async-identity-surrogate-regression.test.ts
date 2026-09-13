import { loadCompiledFixtureSource } from './_server-fixture.js';
import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { prerender } from 'octane/static';

function evalServer(source: string, filename: string): Record<string, any> {
	return loadCompiledFixtureSource(source, {
		id: filename,
		mode: 'server',
		compileOptions: { mode: 'server' },
	});
}

describe('SSR async identity string encoding', () => {
	it('accepts lone UTF-16 surrogate keys without conflating distinct strings', async () => {
		const mod = evalServer(
			`import { use } from 'octane';
			 export function App(props) @{
				<main>
					@for (const item of props.items; key item.key) {
						const value = use(item.promise);
						<span data-label={item.label}>{item.label + ':' + value as string}</span>
					}
				</main>
			 }`,
			'ssr-async-identity-surrogate-regression.tsrx',
		);
		const cases = [
			['lone-high', '\ud800', 'HIGH'],
			['replacement', '\ufffd', 'REPLACEMENT'],
			['lone-low', '\udc00', 'LOW'],
			['pair', '\ud800\udc00', 'PAIR'],
			['hex-text', 'd800', 'TEXT'],
		] as const;

		const result = await prerender(mod.App, {
			items: cases.map(([label, key, value]) => ({
				label,
				key,
				promise: Promise.resolve(value),
			})),
		});

		for (const [label, , value] of cases) {
			expect(result.html).toContain(`data-label="${label}">${label}:${value}</span>`);
		}
	});

	// The encoder resolves ASCII code units through a prebuilt table and falls back
	// to per-unit formatting above it, so U+007F/U+0080 straddle that split. These
	// keys keep the fixed-width encoding exercised on BOTH sides of it — the
	// surrogate case above only reaches the fallback.
	it('encodes keys on both sides of the ASCII split', async () => {
		const mod = evalServer(
			`import { use } from 'octane';
			 export function App(props) @{
				<main>
					@for (const item of props.items; key item.key) {
						const value = use(item.promise);
						<span data-label={item.label}>{item.label + ':' + value as string}</span>
					}
				</main>
			 }`,
			'ssr-async-identity-ascii-split.tsrx',
		);
		const cases = [
			['ascii-nul', '\u0000', 'NUL'],
			['ascii-max', '\u007f', 'DEL'],
			['above-ascii', '\u0080', 'PAD'],
			['mixed', 'a\u0080b', 'MIXED'],
			['plain', 'plain-key', 'PLAIN'],
		] as const;

		const result = await prerender(mod.App, {
			items: cases.map(([label, key, value]) => ({
				label,
				key,
				promise: Promise.resolve(value),
			})),
		});

		for (const [label, , value] of cases) {
			expect(result.html).toContain(`data-label="${label}">${label}:${value}</span>`);
		}
	});

	it('keeps long keys distinct when their shared prefix contains delimiters and lone surrogates', async () => {
		const mod = evalServer(
			`import { use } from 'octane';
			 export function App(props) @{
				<main>
					@for (const item of props.items; key item.key) {
						const value = use(item.promise);
						<span data-label={item.label}>{item.label + ':' + value as string}</span>
					}
				</main>
			 }`,
			'ssr-long-async-identity-surrogates.tsrx',
		);
		const prefix = '|@component-key:\u0000'.repeat(5);
		const cases = [
			['lone-high', prefix + '\ud800', 'HIGH'],
			['replacement', prefix + '\ufffd', 'REPLACEMENT'],
			['lone-low', prefix + '\udc00', 'LOW'],
			['pair', prefix + '\ud800\udc00', 'PAIR'],
			['same-prefix', prefix + 'a', 'FIRST'],
			['same-prefix-longer', prefix + 'aa', 'SECOND'],
		] as const;

		const result = await prerender(mod.App, {
			items: cases.map(([label, key, value]) => ({
				label,
				key,
				promise: Promise.resolve(value),
			})),
		});

		for (const [label, , value] of cases) {
			expect(result.html).toContain(`data-label="${label}">${label}:${value}</span>`);
		}
	});
});
