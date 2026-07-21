import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// Octane's `lazy()` creates a descriptor with no side effects, so direct
// calls to the octane-imported `lazy` are emitted with `/* @__PURE__ */` —
// an unused lazy declaration then tree-shakes exactly like `React.lazy`
// does. Start's import-protection depends on this: it verifies after
// tree-shaking that no denied `*.client.*` module stays reachable from the
// server bundle, and a ClientOnly-stripped-but-retained lazy const was the
// difference between the octane and react tanstack.com builds.
describe('pure annotation on octane lazy() calls', () => {
	const SRC =
		"import { lazy } from 'octane';\n" +
		"const L = lazy(() => import('~/x.client'));\n" +
		'export function App() {\n\treturn <p>hi</p>;\n}\n';

	for (const mode of ['client', 'server'] as const) {
		it(`${mode} emit annotates the call`, () => {
			const { code } = compile(
				'App.tsrx' === '' ? '' : SRC,
				'App.tsrx',
				mode === 'server' ? { mode: 'server' } : undefined,
			);
			expect(code).toMatch(/\/\* @__PURE__ \*\/ lazy\(/);
		});
	}

	it('a module-nested shadow of the local disables annotation', () => {
		const src =
			"import { lazy } from 'octane';\n" +
			'export function helper() {\n' +
			'\tconst lazy = (fn: any) => fn();\n' +
			"\treturn lazy(() => 'x');\n" +
			'}\n' +
			'export function App() {\n\treturn <p>hi</p>;\n}\n';
		const { code } = compile(src, 'App.tsrx', {});
		expect(code).not.toMatch(/@__PURE__ \*\/ lazy\(/);
	});
});
