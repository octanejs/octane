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
		expect(code).toMatch(/Foo\[_\$HMR\]\.update\(module\.Foo\)/);
	});

	it('hmr option off → no wrapping, no accept block', async () => {
		const { compile } = await import('octane/compiler');
		const src = "export function Foo() @{ <span>{'hi'}</span> }\n";
		const { code } = compile(src, 'file.tsrx'); // no { hmr: true }
		expect(code).not.toMatch(/hmr\(/);
		expect(code).not.toMatch(/import\.meta\.hot/);
	});

	it('hmr option off → hook slots are Symbol("<hash>#<n>"), no registry key, no file path', async () => {
		// Only HMR's re-import needs Symbol.for's registry identity; prod output
		// uses plain Symbol with a SHORT UNIQUE description — smaller, and the
		// module id (an ABSOLUTE path under vite) never leaks into shipped
		// bundles. The description must NOT be empty: the runtime composes
		// custom-hook slot paths from slot descriptions (resolveSlot), and bare
		// Symbol() collapsed those paths — custom-hook state collided across call
		// sites (broke the router's useStore → website-wide hydration mismatch).
		const { compile } = await import('octane/compiler');
		const src =
			"import { useState } from 'octane';\n" +
			'export function Foo() @{\n' +
			'  const [n, setN] = useState(0);\n' +
			'  <button onClick={() => setN(n + 1)}>{n as string}</button>\n' +
			'}\n';
		const { code } = compile(src, '/abs/path/to/file.tsrx'); // no { hmr: true }
		expect(code).toMatch(/const _h\$0 = Symbol\("[a-z0-9]+#0"\);/);
		expect(code).not.toMatch(/Symbol\(\)/); // description is load-bearing
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
		expect(prod?.code).toMatch(/const _h\$0 = Symbol\("[a-z0-9]+#0"\);/);
		expect(prod?.code).not.toMatch(/Symbol\(\)|Symbol\.for|abs\/custom/);
	});
});
