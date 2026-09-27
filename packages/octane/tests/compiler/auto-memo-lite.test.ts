import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// A memo-guarded component call needs a Block only when the cache must stamp
// or restore context. A context-free callee's guard is a pure skip: the same
// markerless componentSlotLite lowering the unguarded call would emit is kept,
// wrapped in the memo region — the cache adds no mount boundaries. These tests
// pin which callsite/callee shapes keep the lite lowering under a memo guard
// and which keep the full componentSlot/componentSlotVoid regime.
function compileProd(source: string): string {
	return compile(source, 'App.tsrx', { hmr: false, dev: false }).code;
}

// Every component slot call for `callee`, as {helper, slot} pairs — a
// recursive callee emits several callsites at different slot indices.
function slotCalls(code: string, callee: string): { helper: string; slot: string }[] {
	const pattern = new RegExp(
		`_\\$(componentSlotLite|componentSlotVoid|componentSlot)\\(__s, (\\d+), [^,]+, ${callee},`,
		'g',
	);
	const calls = [...code.matchAll(pattern)].map((m) => ({ helper: m[1]!, slot: m[2]! }));
	expect(calls.length, `expected a component slot call for ${callee}`).toBeGreaterThan(0);
	return calls;
}

// A memo region's miss test opens with the call's own slot and reaches the
// cache cells inside the same guard expression — imported-component witness
// misses may sit in between: `__s.slots[N] === undefined || (W.__memo !== true
// || …) || __memoCache$M[K] !== true || …`.
function memoWrappedSlots(code: string, callee: string): number {
	return slotCalls(code, callee).filter(({ slot }) =>
		new RegExp(`__s\\.slots\\[${slot}\\] === undefined \\|\\|[^;]*__memoCache`).test(code),
	).length;
}

const RECURSIVE = `
function Node(props) @{
	@switch (props.depth > 0) {
		@case true: {
			<div class="n">
				<Node depth={props.depth - 1} path={props.path + 'L'} />
				<Node depth={props.depth - 1} path={props.path + 'R'} />
			</div>
		}
		@default: {
			<Leaf path={props.path} />
		}
	}
}

function Leaf(props) @{
	<span class="leaf">{props.path as string}</span>
}

export function App(props) @{
	<Node depth={props.depth} path="r" />
}
`;

describe('compiler memo + lite component slots', () => {
	it('memo-wraps recursive context-free calls with componentSlotLite', () => {
		const code = compileProd(RECURSIVE);
		// The two recursive calls inside the @case arm and the Leaf call in the
		// @default arm all keep the markerless lite lowering under their guards.
		const helpers = slotCalls(code, 'Node').map((c) => c.helper);
		expect(helpers.filter((h) => h === 'componentSlotLite')).toHaveLength(2);
		expect(slotCalls(code, 'Leaf').map((c) => c.helper)).toEqual(['componentSlotLite']);
		// Every callsite is memo-guarded — including the App-level Node call,
		// which memo-wraps a componentSlotVoid because its sole-root position
		// borrows the enclosing block's marker range (inheritRange supersedes
		// lite: the borrow already elides every marker).
		expect(memoWrappedSlots(code, 'Node')).toBe(3);
		expect(memoWrappedSlots(code, 'Leaf')).toBe(1);
		// The lite memo regime never allocates a context-stamping Block.
		expect(code).not.toContain('compilerCacheContext');
	});

	it('keeps the full slot + context stamping for a callee that may read context', () => {
		const code = compileProd(`
			import { Widget } from './widgets.tsrx';
			function WrapsImported(props) @{
				<div><Widget x={props.label} /></div>
			}
			export function App(props) @{
				<section>@if (props.show) {<div><WrapsImported label={props.label} /></div>}</section>
			}
		`);
		expect(slotCalls(code, 'WrapsImported').map((c) => c.helper)).not.toContain(
			'componentSlotLite',
		);
		expect(memoWrappedSlots(code, 'WrapsImported')).toBe(1);
		expect(code).toContain('compilerCacheContext');
	});

	it('keeps the full slot for a hookful callee under the memo guard', () => {
		const code = compileProd(`
			import { useState } from 'octane';
			function Hookful(props) @{
				const [n, setN] = useState(0);
				<span onClick={() => setN(n + 1)}>{props.label as string}{n}</span>
			}
			export function App(props) @{
				<section>@if (props.show) {<div><Hookful label={props.label} /></div>}</section>
			}
		`);
		expect(slotCalls(code, 'Hookful').map((c) => c.helper)).not.toContain('componentSlotLite');
	});

	it('emits no memo region and no lite lowering for a keyed callsite', () => {
		const code = compileProd(`
			function Child(props) @{
				<span>{props.label as string}</span>
			}
			export function App(props) @{
				<section>@if (props.show) {<div><Child key={props.k} label={props.label} /></div>}</section>
			}
		`);
		expect(slotCalls(code, 'Child').map((c) => c.helper)).not.toContain('componentSlotLite');
		expect(memoWrappedSlots(code, 'Child')).toBe(0);
	});

	it('emits no memo region for a callsite carrying children', () => {
		const code = compileProd(`
			function Child(props) @{
				<div>{props.label as string}<span>{props.children}</span></div>
			}
			export function App(props) @{
				<section>@if (props.show) {
					<div><Child label={props.label}><b>{"x"}</b></Child></div>
				}</section>
			}
		`);
		// Children callsites emit the descriptor-config route, not a component
		// slot — and no memo region.
		expect(code).not.toMatch(/componentSlot\w*\(__s, \d+, [^,]+, Child,/);
		expect(code).not.toContain('__memoCache');
	});
});
