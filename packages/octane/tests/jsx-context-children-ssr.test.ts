import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';

// SSR backwards-compat for `.tsx`: a React-style `<Ctx.Provider value>` lowers to
// `createElement(Provider, {}, <child/>)`, so its children reach the server Provider
// as an ELEMENT DESCRIPTOR (not a render function). The server must render those
// descriptor children inside the provider's scope, or direct-JSX provider SSR emits
// empty output — breaking the TSX/JSX + SSR story.

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const m = evalServer(
	readFileSync(join(FIXTURES, 'jsx-context-children.tsx'), 'utf8'),
	'jsx-context-children.tsx',
);

describe('SSR — .tsx <Context.Provider> with descriptor children', () => {
	it('renders the provider element children and flows context through them', async () => {
		const { html } = await RT.renderToString(m.ProviderApp, {});
		// The descriptor children render (not dropped).
		expect(html).toContain('class="wrap"');
		expect((html.match(/class="leaf"/g) || []).length).toBe(2);
		// Context value flows to the leaves through the provider.
		expect(html).toContain('provided');
		expect(html).not.toContain('default');
	});
});
