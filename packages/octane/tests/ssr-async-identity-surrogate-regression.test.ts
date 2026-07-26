import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import { prerender } from 'octane/static';

function evalServer(source: string, filename: string): Record<string, any> {
	let code = compile(source, filename, { mode: 'server' }).code;
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRuntime, {});
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
});
