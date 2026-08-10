import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as serverRuntime from 'octane/server';
import { prerender } from 'octane/static';
import { describe, expect, it } from 'vitest';

function evaluateProbe(): Record<string, any> {
	const file = join(fileURLToPath(new URL('.', import.meta.url)), 'async-component.tsrx');
	let { code } = compile(readFileSync(file, 'utf8'), file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_match: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __runtime;`,
	);
	code = code
		.replace(/export async function (\w+)\s*\(/g, 'const $1 = __exports.$1 = async function $1(')
		.replace(/export function (\w+)\s*\(/g, 'const $1 = __exports.$1 = function $1(')
		.replace(/export const (\w+)\s*=/g, 'const $1 = __exports.$1 =');
	const run = new Function('__runtime', '__exports', `${code}\nreturn __exports;`);
	return run(serverRuntime, {});
}

describe('promise-returning mapped component architecture seam', () => {
	const probe = evaluateProbe();

	it('awaits the mapped component and preserves nested children in server output', async () => {
		const { html } = await prerender(probe.AsyncProjectionProbe, {
			component: probe.AsyncMapped,
			label: 'resolved',
		});
		expect(html).toContain('<section id="async-projection">');
		expect(html).toContain('<strong data-label="resolved"><em>nested</em></strong>');
	});

	it('propagates a mapped component rejection through prerender', async () => {
		await expect(
			prerender(probe.AsyncProjectionProbe, {
				component: probe.AsyncMapped,
				label: 'rejected',
				reject: true,
			}),
		).rejects.toThrow('mapped:rejected');
	});
});
