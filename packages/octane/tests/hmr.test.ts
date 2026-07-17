import { describe, it, expect } from 'vitest';
import { hmr, HMR, useState, flushSync, type ComponentBody, type Scope } from '../src/index.js';
import { mount } from './_helpers';

/**
 * Direct runtime tests for the `hmr(...)` wrapper. We don't go through the
 * compiler emit here (the compiler's `import.meta.hot.accept` block needs
 * a real Vite dev server to fire); we exercise the wrapper itself by
 * calling `Foo[HMR].update(NewFoo)` manually, which is what the compiler-
 * emitted accept block does at dev time.
 *
 * The component bodies here use the same `(props, scope, extra)` signature
 * the octane compiler emits. They follow the standard
 * "clear-range-then-insert" pattern that compiled bodies use on re-render.
 */

function clearBlockRange(scope: Scope): void {
	const block = scope.block;
	// Root blocks have null markers and own the whole parentNode; non-root
	// blocks own just the inclusive range between markers.
	if (!block.startMarker || !block.endMarker) {
		while (block.parentNode.firstChild) {
			block.parentNode.removeChild(block.parentNode.firstChild);
		}
		return;
	}
	let n: Node | null = block.startMarker.nextSibling;
	while (n && n !== block.endMarker) {
		const next: Node | null = n.nextSibling;
		block.parentNode.removeChild(n);
		n = next;
	}
}

describe('hmr — runtime wrapper', () => {
	it('renders the initial component body', () => {
		const Foo = hmr(((_props: any, scope: Scope, _extra: any) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'initial';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>);
		const r = mount(Foo);
		expect(r.find('.leaf').textContent).toBe('initial');
		r.unmount();
	});

	it('exposes the HMR meta via the HMR Symbol', () => {
		const Foo = hmr(((_scope: Scope, _props: any, _extra: any) => {}) as ComponentBody<any>);
		const meta = (Foo as any)[HMR];
		expect(meta).toBeDefined();
		expect(typeof meta.update).toBe('function');
		expect(meta.liveBlocks instanceof Set).toBe(true);
	});

	it('update() swaps the body of live blocks + re-renders', () => {
		const v1: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf v1';
			root.textContent = 'A';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		const v2: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf v2';
			root.textContent = 'B';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;

		const Foo = hmr(v1);
		const r = mount(Foo);
		expect(r.find('.leaf').textContent).toBe('A');
		expect(r.find('.leaf').classList.contains('v1')).toBe(true);

		// Simulate what `import.meta.hot.accept` does: hand `update` a wrapper
		// built around the new fn. The wrapper unwraps before storing.
		const NewFoo = hmr(v2);
		flushSync(() => {
			(Foo as any)[HMR].update(NewFoo);
		});
		expect(r.find('.leaf').textContent).toBe('B');
		expect(r.find('.leaf').classList.contains('v2')).toBe(true);

		r.unmount();
	});

	it('rejects an update whose compiled output ABI is incompatible', () => {
		const v1: ComponentBody<any> = ((_props: any, scope: Scope) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'committed';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		const v2: ComponentBody<any> = ((_props: any, scope: Scope) => {
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'incompatible';
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		(v2 as any).__octaneReturnedOutput = true;

		const Foo = hmr(v1);
		const r = mount(Foo);
		let accepted = true;
		flushSync(() => {
			accepted = (Foo as any)[HMR].update(hmr(v2));
		});
		expect(accepted).toBe(false);
		expect((Foo as any)[HMR].fn).toBe(v1);
		expect(r.find('.leaf').textContent).toBe('committed');
		r.unmount();
	});

	it('preserves hook state across update() — stable Symbol.for keys', () => {
		// Both bodies use the SAME hook symbol (simulating the compiler's
		// `Symbol.for('octane:file.tsrx:Foo.useState#0')`-stable emit).
		const HOOK_SYM = Symbol.for('octane:hmr.test.ts:Counter.useState#0');
		const v1: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			const [n] = useState(0, HOOK_SYM as any);
			clearBlockRange(scope);
			const root = document.createElement('span');
			root.className = 'leaf';
			root.textContent = 'v1:' + n;
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;
		const v2: ComponentBody<any> = ((_props: any, scope: Scope, _extra: any) => {
			const [n, setN] = useState(0, HOOK_SYM as any);
			clearBlockRange(scope);
			const root = document.createElement('button');
			root.className = 'leaf';
			root.id = 'bump';
			root.textContent = 'v2:' + n;
			root.onclick = () => setN((c: number) => c + 1);
			scope.block.parentNode.insertBefore(root, scope.block.endMarker);
		}) as ComponentBody<any>;

		const Counter = hmr(v1);
		const r = mount(Counter);
		expect(r.find('.leaf').textContent).toBe('v1:0');

		// First push state forward via a "new module" v1' that increments.
		// We achieve that here by swapping to v2 (which uses the same Symbol),
		// bumping via click, then swapping back to v1.
		flushSync(() => {
			(Counter as any)[HMR].update(hmr(v2));
		});
		expect(r.find('.leaf').textContent).toBe('v2:0');
		// Click to bump the state.
		r.click('#bump');
		expect(r.find('.leaf').textContent).toBe('v2:1');

		// Now swap BACK to v1 — the state should still be 1 (NOT reset to 0),
		// proving the hooks Map survived the body swap because both versions
		// used the same Symbol.for() key.
		flushSync(() => {
			(Counter as any)[HMR].update(hmr(v1));
		});
		expect(r.find('.leaf').textContent).toBe('v1:1');

		r.unmount();
	});

	it('compiler emits Symbol.for(...) for hook slots and an import.meta.hot.accept block', async () => {
		const { compile } = await import('octane/compiler');
		const src =
			"import { useState } from 'octane';\n" +
			'export function Foo() @{\n' +
			'  const [n, setN] = useState(0);\n' +
			'  <button onClick={() => setN(n + 1)}>{n as string}</button>\n' +
			'}\n';
		const { code } = compile(src, 'file.tsrx', { hmr: true });
		// Stable Symbol.for-based hook slot (so re-imports get the same identity).
		expect(code).toMatch(/Symbol\.for\("octane:file\.tsrx:Foo\.useState#0"\)/);
		// Inline HMR wrapping on the exported component (shadow-proof `_$` alias).
		expect(code).toMatch(/export const Foo = _\$hmr\(function Foo/);
		// Vite-shaped accept block.
		expect(code).toMatch(/if \(import\.meta\.hot\)/);
		expect(code).toMatch(
			/if \(!Foo\[_\$HMR\]\.update\(module\.Foo\)\) import\.meta\.hot\.invalidate\(\)/,
		);
	});

	it('marks mixed shorthand bodies so HMR can invalidate an ABI-changing edit', async () => {
		const { compile } = await import('octane/compiler');
		const direct = compile(
			`export function Foo(p) @{ <span>{p.label as string}</span> }`,
			'file.tsrx',
			{ hmr: true },
		).code;
		const mixed = compile(
			`export function Foo(p) @{ if (p.empty) return null; <span>{p.label as string}</span> }`,
			'file.tsrx',
			{ hmr: true },
		).code;

		expect(direct).not.toContain('__octaneReturnedOutput');
		expect(mixed).toContain('{ __octaneReturnedOutput: true }');
		expect(mixed).toContain('if (!Foo[_$HMR].update(module.Foo)) import.meta.hot.invalidate();');
	});

	it('webpack HMR preserves named and default wrapper identity across repeated updates', async () => {
		const { compile } = await import('octane/compiler');
		const runtime = new Proxy(
			{ hmr, HMR },
			{
				get(target, property) {
					return (target as any)[property] ?? (() => undefined);
				},
			},
		);
		const compileVersion = (version: number) =>
			compile(
				`export function Named() @{ <span>{'named ${version}'}</span> }\n` +
					`export default function Default() @{ <b>{'default ${version}'}</b> }\n`,
				'file.tsrx',
				{ hmr: 'webpack' },
			).code;
		const evaluate = (code: string, data: Record<string, any> | undefined) => {
			const transformed =
				code
					.replace(/^import \{ ([^}]+) \} from 'octane';/m, (_match, imports: string) => {
						const properties = imports
							.split(', ')
							.map((specifier) => specifier.replace(' as ', ': '))
							.join(', ');
						return `const { ${properties} } = runtime;`;
					})
					.replace(/\bexport let /g, 'let ')
					.replace(/export \{ Default as default \};/g, '')
					.replaceAll('import.meta.webpackHot', 'hot') + '\nreturn { Named, default: Default };';
			let dispose: ((value: Record<string, any>) => void) | undefined;
			let accepted = false;
			let invalidated = false;
			const hot = {
				data,
				dispose(callback: (value: Record<string, any>) => void) {
					dispose = callback;
				},
				accept() {
					accepted = true;
				},
				invalidate() {
					invalidated = true;
				},
			};
			const exports = Function('runtime', 'hot', transformed)(runtime, hot) as {
				Named: any;
				default: any;
			};
			const nextData: Record<string, any> = {};
			dispose?.(nextData);
			expect(accepted).toBe(true);
			expect(invalidated).toBe(false);
			return { exports, data: nextData };
		};

		const first = evaluate(compileVersion(1), undefined);
		const firstNamedBody = first.exports.Named[HMR].fn;
		const firstDefaultBody = first.exports.default[HMR].fn;
		const second = evaluate(compileVersion(2), first.data);
		expect(second.exports.Named).toBe(first.exports.Named);
		expect(second.exports.default).toBe(first.exports.default);
		expect(second.exports.Named[HMR].fn).not.toBe(firstNamedBody);
		expect(second.exports.default[HMR].fn).not.toBe(firstDefaultBody);

		const secondNamedBody = second.exports.Named[HMR].fn;
		const secondDefaultBody = second.exports.default[HMR].fn;
		const third = evaluate(compileVersion(3), second.data);
		expect(third.exports.Named).toBe(first.exports.Named);
		expect(third.exports.default).toBe(first.exports.default);
		expect(third.exports.Named[HMR].fn).not.toBe(secondNamedBody);
		expect(third.exports.default[HMR].fn).not.toBe(secondDefaultBody);

		const output = compileVersion(3);
		expect(output).toContain('import.meta.webpackHot.data?.__octaneComponents?.Named');
		expect(output).toContain('import.meta.webpackHot.dispose');
		expect(output).toContain('import.meta.webpackHot.accept();');
		expect(output).not.toContain('import.meta.hot');
	});

	it('wraps plain return-JSX exports for both HMR dialects', async () => {
		const { compile } = await import('octane/compiler');
		const source =
			`export function Named() { return <span>{'named'}</span>; }\n` +
			`export default function Default() { return <b>{'default'}</b>; }\n`;
		const vite = compile(source, 'file.tsx', { hmr: 'vite' }).code;
		expect(vite).toContain('Named = _$hmr(Named);');
		expect(vite).toContain('Default = _$hmr(Default);');
		expect(vite).toContain('import.meta.hot.accept');

		const webpack = compile(source, 'file.tsx', { hmr: 'webpack' }).code;
		expect(webpack).toContain('export { Named };');
		expect(webpack).toContain('export { Default as default };');
		expect(webpack).toContain('import.meta.webpackHot.dispose');
	});

	it('hmr option off → no wrapping, no accept block', async () => {
		const { compile } = await import('octane/compiler');
		const src = "export function Foo() @{ <span>{'hi'}</span> }\n";
		const { code } = compile(src, 'file.tsrx'); // no { hmr: true }
		expect(code).not.toMatch(/hmr\(/);
		expect(code).not.toMatch(/import\.meta\.hot/);
	});

	it('hmr option off → proven render-scope hooks use tiny local numbers', async () => {
		// Only HMR's re-import needs Symbol.for registry identity. Production
		// component bodies run in a fresh Scope, so direct base hooks need only a
		// local integer. The app output carries neither a range reservation nor the
		// module id (an absolute Vite path). Arbitrary helpers and custom-hook
		// boundaries retain runtime-ranged Symbols.
		const { compile } = await import('octane/compiler');
		const src =
			"import { useState } from 'octane';\n" +
			'export function Foo() @{\n' +
			'  const [n, setN] = useState(0);\n' +
			'  <button onClick={() => setN(n + 1)}>{n as string}</button>\n' +
			'}\n';
		const { code } = compile(src, '/abs/path/to/file.tsrx'); // no { hmr: true }
		expect(code).toMatch(/useState\(0, 0\)/);
		expect(code).not.toMatch(/const _h\$\d+ = \d+;/);
		expect(code).not.toContain('_$hookSlots');
		expect(code).not.toMatch(/Symbol\(/);
		expect(code).not.toMatch(/Symbol\.for/);
		expect(code).not.toMatch(/abs\/path/);
	});

	it('slotHooks (plain .ts pass) follows the same gate', async () => {
		const { slotHooks } = await import('../src/compiler/slot-hooks.js');
		const src =
			"import { useState } from 'octane';\n" +
			'export function useCounter() {\n' +
			'  const [n, setN] = useState(0);\n' +
			'  return [n, setN];\n' +
			'}\n';
		const dev = slotHooks(src, '/abs/custom.ts', { hmr: true });
		expect(dev?.code).toMatch(/Symbol\.for\("octane:\/abs\/custom\.ts:useCounter\.useState#0"\)/);
		const prod = slotHooks(src, '/abs/custom.ts');
		expect(prod?.code).toMatch(/_\$hookSlots\(1\)/);
		expect(prod?.code).toMatch(/const _h\$0 = Symbol\(_hs\$\);/);
		expect(prod?.code).not.toMatch(/Symbol\.for|abs\/custom/);
	});

	it('slots first-class subtemplate hooks once with the callable-helper ABI', async () => {
		const { compile } = await import('octane/compiler');
		const { code } = compile(
			`import { useState } from 'octane';
			 export function App() @{
			   const child = () => @{ const [value] = useState(1); <span>{value as string}</span> };
			   <div>{child}</div>
			 }`,
			'subtemplate-slots.tsrx',
			{ hmr: false },
		);
		const call = code.match(/useState\(1, ([^)]+)\)/);
		expect(call?.[1]).toMatch(/^_h\$\d+$/);
		expect(code).not.toMatch(/useState\(1, _h\$\d+, _h\$\d+\)/);
		expect(code).toMatch(/const _h\$\d+ = Symbol\(_hs\$(?: \+ \d+)?\);/);
	});

	it('avoids user bindings when naming full-compiler and surgical slot declarations', async () => {
		const { compile } = await import('octane/compiler');
		const source = `import { useState } from 'octane';
			const _hs$ = 'user base';
			const _$hookSlots = 'user helper';
			export function helper() { const _h$0 = 'user site'; return useState(1); }`;
		const full = compile(source, 'slot-names.tsrx', { hmr: false }).code;
		expect(full).toContain('hookSlots as _$hookSlots$');
		expect(full).toContain('const _hs$$ = /* @__PURE__ */ _$hookSlots$(1);');
		expect(full).toMatch(/const _h\$0\$ = Symbol\(_hs\$\$\);/);
		expect(full).toContain('useStateWithGetter(1, _h$0$)');

		const { slotHooks } = await import('../src/compiler/slot-hooks.js');
		const surgical = slotHooks(source, 'slot-names.ts')!.code;
		expect(surgical).toContain('hookSlots as _$hookSlots$');
		expect(surgical).toContain('const _hs$$ = /* @__PURE__ */ _$hookSlots$(1);');
		expect(surgical).toMatch(/const _h\$0\$ = Symbol\(_hs\$\$\);/);
		expect(surgical).toContain('useStateWithGetter(1, _h$0$)');
	});

	it('avoids a hookSlots helper collision in client and server component output', async () => {
		const { compile } = await import('octane/compiler');
		const source = `import { useState } from 'octane';
			const _$hookSlots = 'user helper';
			export function App() {
				const state = useState(1);
				return <div>{state[0] as string}</div>;
			}`;
		for (const mode of ['client', 'server'] as const) {
			const code = compile(source, `slot-helper-${mode}.tsrx`, { mode, hmr: false }).code;
			expect(code).toContain('hookSlots as _$hookSlots$');
			expect(code).toContain('/* @__PURE__ */ _$hookSlots$(1)');
		}
	});
});
