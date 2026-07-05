/**
 * SSR — an MDX document compiled with `mode: 'server'` renders through
 * `octane/server`'s renderToString. The server-compiled module is evaluated
 * with the server runtime injected (same eval trick as
 * packages/octane/tests/hydration/hydration.test.ts) plus a provider stub for
 * the module's `@octanejs/mdx` import.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import { compileMdxSync } from '@octanejs/mdx/compile';

const FIXTURES = join(process.cwd(), 'packages/mdx/tests/_fixtures');

// Evaluate a server-compiled MDX module. Imports are rewritten to injected
// bindings: `octane/server` → the real server runtime, `@octanejs/mdx` → a
// stub provider (context has no cross-runtime SSR threading yet — see
// docs/mdx-migration-plan.md — so the stub returns the empty mapping, exactly
// what the real `useMDXComponents()` yields with no provider mounted).
function serverModule(name: string): Record<string, any> {
	const file = join(FIXTURES, name);
	let { code } = compileMdxSync(readFileSync(file, 'utf8'), file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]@octanejs\/mdx['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __provider;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export default function MDXContent/, 'function MDXContent');
	code += '\n__exports.default = MDXContent;';
	const fn = new Function('__rt', '__provider', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, { useMDXComponents: () => ({}) }, {});
}

// Hydration block markers aside, the payload is plain HTML.
function stripMarkers(html: string): string {
	return html.replace(/<!--[^>]*-->/g, '');
}

describe('SSR', () => {
	it('renderToString renders a markdown document', () => {
		const mod = serverModule('basic.mdx');
		const { html } = ServerRT.renderToString(mod.default, {});
		const flat = stripMarkers(html);
		expect(flat).toContain('<h1>Hello, MDX</h1>');
		expect(flat).toContain('<em>emphasis</em>');
		expect(flat).toContain('<li>one</li>');
		expect(flat).toContain('<code class="language-js">const x = 1;\n</code>');
	});

	it('the components prop applies on the server', () => {
		const mod = serverModule('basic.mdx');
		const { html } = ServerRT.renderToString(mod.default, {
			components: { h1: 'h2', em: 'i' },
		});
		const flat = stripMarkers(html);
		expect(flat).toContain('<h2>Hello, MDX</h2>');
		expect(flat).not.toContain('<h1>');
		expect(flat).toContain('<i>emphasis</i>');
	});

	it('frontmatter exports and expressions work server-side', () => {
		const mod = serverModule('frontmatter.mdx');
		expect(mod.frontmatter).toEqual({ title: 'Doc Title', tags: ['octane', 'mdx'] });
		const { html } = ServerRT.renderToString(mod.default, {});
		const flat = stripMarkers(html);
		expect(flat).toContain('<h1>Doc Title</h1>');
		expect(flat).toContain('Tagged 2 ways.');
	});
});
