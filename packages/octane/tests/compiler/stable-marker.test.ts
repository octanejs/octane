import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { parseModule } from '@tsrx/core';
import { walkAst } from '../_profile-output.js';

// Definition-site purity stamps (`$$stable`, emitted as `markStable`/`__st`
// calls): production client output tags a component whose committed output is
// a pure projection of its props snapshot, so the runtime may keep that subtree
// on a shallow-equal parent update — React.memo's contract applied at the
// definition site. Deferred hook bodies (effects, ref callbacks, memo
// factories) are admitted because they run at commit/dispatch time, never in
// the skipped render; a render-time context read (useContext/use) must
// re-execute on provider changes, so it is not.

const c = (source: string, options?: Record<string, unknown>): string =>
	compile(source, 'stable-marker.tsrx', options).code;

const ctsx = (source: string, options?: Record<string, unknown>): string =>
	compile(source, 'stable-marker.tsx', options).code;

// Resolve the `__st` runtime import alias and collect the component names it
// stamps, across every emission shape: `const X = __st(fn)` initializers,
// `typeof X === 'function' && __st(X)` hoisted-declaration stamps, and
// module-tail `__st(X)` follow-ups.
function stableStampedNames(code: string): Set<string> {
	const ast = parseModule(code, 'stable-marker.js');
	const aliases = new Set<string>();
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'octane') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportSpecifier' && specifier.imported.name === '__st') {
				aliases.add(specifier.local.name);
			}
		}
	}
	const stamped = new Set<string>();
	if (aliases.size === 0) return stamped;
	const isStableCall = (node: any) =>
		node?.type === 'CallExpression' &&
		node.callee?.type === 'Identifier' &&
		aliases.has(node.callee.name);
	walkAst(ast, (node: any) => {
		if (isStableCall(node)) {
			// Statement/guarded form: the argument is the component identifier.
			const argument = node.arguments?.[0];
			if (argument?.type === 'Identifier') stamped.add(argument.name);
			if (argument?.type === 'FunctionExpression' && argument.id?.name)
				stamped.add(argument.id.name);
		}
		// Initializer form: `const X = __st(function X() {})` — the function id or
		// the declarator binding names the component.
		if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
			let wrapped = false;
			walkAst(node.init, (inner: any) => {
				if (isStableCall(inner)) wrapped = true;
			});
			if (wrapped) stamped.add(node.id.name);
		}
	});
	return stamped;
}

describe('$$stable definition-site marker emission', () => {
	it('stamps a component whose only hooks are deferred lifecycle hooks', () => {
		const code = c(`
			import { useEffect, useRef } from 'octane';
			export function Stable(props) @{
				const seen = useRef(0);
				useEffect(() => {
					seen.current += 1;
					props.onMount?.(seen.current);
				}, null);
				<div>{props.label as string}</div>
			}
		`);
		expect(stableStampedNames(code)).toContain('Stable');
	});

	it('stamps a component using useMemo and useCallback', () => {
		const code = c(`
			import { useCallback, useMemo } from 'octane';
			export function Stable(props) @{
				const total = useMemo(() => props.a + props.b, [props.a, props.b]);
				const choose = useCallback(() => total > 0, [total]);
				<div onClick={() => props.pick?.(choose())}>{'' + total}</div>
			}
		`);
		expect(stableStampedNames(code)).toContain('Stable');
	});

	it('stamps a component with self-managed state — the stamp only governs parent updates', () => {
		const code = c(`
			import { useState } from 'octane';
			export function Stable() @{
				const [n, setN] = useState(0);
				<button onClick={() => setN(n + 1)}>{'' + n}</button>
			}
		`);
		expect(stableStampedNames(code)).toContain('Stable');
	});

	it('stamps a useReducer + useImperativeHandle component', () => {
		const code = c(`
			import { useImperativeHandle, useReducer } from 'octane';
			export function Stable(props) @{
				const [n, dispatch] = useReducer((s, a) => s + a, 0);
				useImperativeHandle(props.api, () => ({ bump: () => dispatch(1) }), null);
				<button onClick={() => dispatch(1)}>{'' + n}</button>
			}
		`);
		expect(stableStampedNames(code)).toContain('Stable');
	});

	it('rejects a render-time use() read', () => {
		const code = c(`
			import { use } from 'octane';
			export function Reads(props) @{
				const v = use(props.data);
				<div>{v as string}</div>
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('rejects an imported component child — the boundary cannot self-govern under a bailed parent', () => {
		// A `$$stable` block bail keeps the committed subtree without invoking the
		// child's callsite witness, so an opaque import reading mutable module
		// state (or gaining a veto compare after lazy resolution) would strand.
		const code = c(`
			import { Imported } from './imported.tsrx';
			export function Stable(props) @{
				<div><Imported label={props.label} /></div>
			}
		`);
		expect(stableStampedNames(code).has('Stable')).toBe(false);
	});

	it('rejects a render-time useContext read', () => {
		const code = c(`
			import { createContext, useContext } from 'octane';
			const Ctx = createContext(0);
			export function Reads() @{
				const v = useContext(Ctx);
				<div>{'' + v}</div>
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('rejects a render-position ref content read', () => {
		const code = c(`
			import { useRef } from 'octane';
			export function Reads(props) @{
				const box = useRef(props.initial);
				<div>{'' + box.current}</div>
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('rejects a deferred ref read laundered through a render-prop callback', () => {
		const code = c(`
			import { useRef } from 'octane';
			function Child(props) @{
				<div>{props.render() as string}</div>
			}
			export function Reads() @{
				const box = useRef(1);
				<Child render={() => '' + box.current} />
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('rejects an unproven render-time call', () => {
		const code = c(`
			export function Reads(props) @{
				const stamped = props.stamp();
				<div>{stamped as string}</div>
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('rejects a live imported binding read the props snapshot cannot witness', () => {
		const code = c(`
			import { helper } from './helpers.js';
			export function Reads(props) @{
				<div>{(props.prefix + helper.label) as string}</div>
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('rejects mutable module state reads', () => {
		const code = c(`
			let serial = 0;
			export function Reads() @{
				const n = serial;
				<div>{'' + n}</div>
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('rejects a component spread over a component tag', () => {
		const code = c(`
			function Inner(props) @{
				<div>{props.label as string}</div>
			}
			export function Reads(props) @{
				<Inner {...props} />
			}
		`);
		expect(stableStampedNames(code).has('Reads')).toBe(false);
	});

	it('propagates the stamp to same-module pure parents, declaration order aside', () => {
		const code = c(`
			export function Outer(props) @{
				<section><Inner label={props.label} /></section>
			}
			function Inner(props) @{
				<div>{props.label as string}</div>
			}
		`);
		const stamped = stableStampedNames(code);
		expect(stamped.has('Inner')).toBe(true);
		expect(stamped.has('Outer')).toBe(true);
	});

	it('does not stamp a parent whose same-module child is not proven stable', () => {
		const code = c(`
			function Inner(props) @{
				const stamped = props.stamp();
				<div>{stamped as string}</div>
			}
			export function Outer(props) @{
				<section><Inner stamp={props.stamp} /></section>
			}
		`);
		const stamped = stableStampedNames(code);
		expect(stamped.has('Inner')).toBe(false);
		expect(stamped.has('Outer')).toBe(false);
	});

	it('does not stamp a memo() wrapper binding', () => {
		const code = c(`
			import { memo } from 'octane';
			function Inner(props) @{
				<div>{props.label as string}</div>
			}
			export const Wrapped = memo(Inner);
		`);
		const stamped = stableStampedNames(code);
		expect(stamped.has('Inner')).toBe(true);
		expect(stamped.has('Wrapped')).toBe(false);
	});

	it('stamps a return-JSX (.tsx) component through the module tail', () => {
		const code = ctsx(`
			import { useEffect } from 'octane';
			export function Stable(props) {
				useEffect(() => {
					props.onMount?.();
				}, null);
				return <div>{props.label}</div>;
			}
		`);
		expect(stableStampedNames(code)).toContain('Stable');
	});

	it('stamps components that call hooks through the octane namespace', () => {
		const code = c(`
			import * as Octane from 'octane';
			export function Stable(props) @{
				Octane.useEffect(() => {
					props.onMount?.();
				}, null);
				<div>{props.label as string}</div>
			}
		`);
		expect(stableStampedNames(code)).toContain('Stable');
	});

	it('stamps a lazily-created state initializer without descending it', () => {
		const code = c(`
			import { useState } from 'octane';
			export function Stable() @{
				const [items] = useState(() => new Set());
				<div>{'' + items.size}</div>
			}
		`);
		expect(stableStampedNames(code)).toContain('Stable');
	});

	describe('suppressed outside production client builds', () => {
		const source = `
			import { useEffect } from 'octane';
			export function Stable(props) @{
				useEffect(() => {
					props.onMount?.();
				}, null);
				<div>{props.label as string}</div>
			}
		`;
		it('dev', () => {
			expect(stableStampedNames(c(source, { dev: true })).size).toBe(0);
		});
		it('hmr', () => {
			expect(stableStampedNames(c(source, { hmr: 'vite' })).size).toBe(0);
		});
		it('profile', () => {
			expect(stableStampedNames(c(source, { profile: true })).size).toBe(0);
		});
		it('server', () => {
			expect(stableStampedNames(c(source, { mode: 'server' })).size).toBe(0);
		});
		it('autoMemo diagnostic escape hatch', () => {
			expect(stableStampedNames(c(source, { autoMemo: false })).size).toBe(0);
		});
	});
});
