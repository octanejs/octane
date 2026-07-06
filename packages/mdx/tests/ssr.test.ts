/**
 * SSR — an MDX document compiled with `mode: 'server'` renders through
 * `octane/server`'s renderToString. The server-compiled module is evaluated
 * with the server runtime injected (same eval trick as
 * packages/octane/tests/hydration/hydration.test.ts); its provider import is
 * the REAL `@octanejs/mdx/server` (the server-mode `providerImportSource`
 * default), so provider semantics run the real code path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import * as ServerProvider from '@octanejs/mdx/server';
import { compileMdxSync } from '@octanejs/mdx/compile';

const FIXTURES = join(process.cwd(), 'packages/mdx/tests/_fixtures');

// Evaluate a server-compiled MDX module. Imports are rewritten to injected
// bindings: `octane/server` → the real server runtime, `@octanejs/mdx/server`
// → the real server provider layer.
function serverModule(name: string): Record<string, any> {
	const file = join(FIXTURES, name);
	let { code } = compileMdxSync(readFileSync(file, 'utf8'), file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]@octanejs\/mdx\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __provider;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export default function MDXContent/, 'function MDXContent');
	code += '\n__exports.default = MDXContent;';
	const fn = new Function('__rt', '__provider', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, ServerProvider, {});
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

	// The server provider layer (@octanejs/mdx/server): octane/server context
	// threads the mapping to every document within one renderToString pass.
	it('MDXProvider provides the mapping across a server render pass', () => {
		const mod = serverModule('basic.mdx');
		const { html } = ServerRT.renderToString(ServerProvider.MDXProvider as any, {
			components: { h1: 'h2', em: 'i' },
			children: ServerRT.createElement(mod.default as any, {}),
		});
		const flat = stripMarkers(html);
		expect(flat).toContain('<h2>Hello, MDX</h2>');
		expect(flat).not.toContain('<h1>');
		expect(flat).toContain('<i>emphasis</i>');
	});

	// Per @mdx-js/react semantics (mirrored from the client layer): the
	// components PROP merges OVER the provider context.
	it('the components prop merges over the server provider mapping', () => {
		const mod = serverModule('basic.mdx');
		const { html } = ServerRT.renderToString(ServerProvider.MDXProvider as any, {
			components: { h1: 'h2', em: 'i' },
			children: ServerRT.createElement(mod.default as any, { components: { h1: 'h3' } }),
		});
		const flat = stripMarkers(html);
		expect(flat).toContain('<h3>Hello, MDX</h3>'); // prop wins
		expect(flat).toContain('<i>emphasis</i>'); // context still applies
	});

	// The provider route and the prop route produce the SAME payload — the
	// supported-everywhere fallback (`components` as a prop) is not a downgrade.
	it('provider mapping and prop mapping serialize identical payloads', () => {
		const mod = serverModule('basic.mdx');
		const components = { h1: 'h2', em: 'i' };
		const viaProp = ServerRT.renderToString(mod.default, { components });
		const viaProvider = ServerRT.renderToString(ServerProvider.MDXProvider as any, {
			components,
			children: ServerRT.createElement(mod.default as any, {}),
		});
		expect(stripMarkers(viaProvider.html)).toBe(stripMarkers(viaProp.html));
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
