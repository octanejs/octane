import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';

// Render-phase state updates on the server (runtime.server.ts's
// invokeComponentBody loop): a useState/useReducer dispatch fired while its own
// component renders re-invokes the body until a pass settles, and each retry
// REWINDS what the discarded pass emitted. The React-facing outcomes live in
// conformance/ssr-server-semantics.test.ts; this file pins the octane-specific
// rewind bookkeeping — useId numbering, suspense seed order, hoisted head
// markup, and slot keying through custom hooks — by comparing against a twin
// that renders the settled state in a single pass.

const SRC = `
import { useState, useId, use, preload } from 'octane';

export function Updater() @{
	const [count, setCount] = useState(0);
	const id = useId();
	if (count < 3) setCount(count + 1);
	<span id={id}>{'Count: ' + count}</span>
}
// The settled twin: starts at the converged state, renders in one pass.
export function Settled() @{
	const [count] = useState(3);
	const id = useId();
	<span id={id}>{'Count: ' + count}</span>
}
export function IdSibling() @{
	const id = useId();
	<p id={id}>sib</p>
}
export function App() @{
	<div><Updater /><IdSibling /></div>
}
export function AppRef() @{
	<div><Settled /><IdSibling /></div>
}

export function TitleUpdater() @{
	const [count, setCount] = useState(0);
	if (count < 2) setCount(count + 1);
	<>
		<title>render-phase</title>
		<span>{'Count: ' + count}</span>
	</>
}

export function SuspenseUpdater(p) @{
	const [count, setCount] = useState(0);
	const v = use(p.data);
	if (count < 2) setCount(count + 1);
	<span>{v + ':' + count}</span>
}

function useCounter(limit) {
	const [count, setCount] = useState(0);
	if (count < limit) setCount(count + 1);
	return count;
}
export function CustomHookUpdater() @{
	const count = useCounter(4);
	<span>{'Count: ' + count}</span>
}

function useCell(initial) {
	const [value] = useState(initial);
	return value;
}
export function ConditionalCustomHooks() @{
	const [showFirst, setShowFirst] = useState(true);
	let first = -1;
	if (showFirst) first = useCell(10);
	const second = useCell(20);
	if (showFirst) setShowFirst(false);
	<span>{first + '/' + second}</span>
}

export function TwoCells() @{
	const [a, setA] = useState(0);
	const [b, setB] = useState(0);
	if (a < 2) setA(a + 1);
	if (a === 2 && b < 3) setB(b + 1);
	<span>{a + '/' + b}</span>
}

function DiscardedStyle() @{
	<div class="discarded-style">
		{'discarded'}
		<style>
			.discarded-style {
				--discarded-render-pass: 1;
			}
		</style>
	</div>
}
function SettledStyle() @{
	<div class="settled-style">
		{'settled'}
		<style>
			.settled-style {
				--settled-render-pass: 1;
			}
		</style>
	</div>
}
export function ArtifactUpdater() @{
	const [phase, setPhase] = useState(0);
	if (phase === 0) {
		preload('/discarded-render-pass.css', { as: 'style' });
		setPhase(1);
	}
	preload('/shared-render-pass.css', { as: 'style' });
	<section>
		@if (phase === 0) {
			<DiscardedStyle />
		} @else {
			<SettledStyle />
		}
	</section>
}

export function Runaway() @{
	const [count, setCount] = useState(0);
	setCount(count + 1);
	<span>{'Count: ' + count}</span>
}
`;

function evalServer(source: string): Record<string, any> {
	let { code } = compile(source, 'render-phase-state.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(RT, {});
}

const mod = evalServer(SRC);

describe('SSR render-phase state updates — rewind bookkeeping', () => {
	it('settled output is byte-identical to a single-pass render of the final state (useId, markers, sibling order)', () => {
		const html = RT.renderToString(mod.App).html;
		expect(html).toContain('Count: 3');
		expect(html).toBe(RT.renderToString(mod.AppRef).html);
	});

	it('rewinds hoisted head markup — a discarded pass leaves no duplicate <title>', () => {
		const html = RT.renderToString(mod.TitleUpdater).html;
		expect(html).toContain('Count: 2');
		expect(html.match(/<title>/g)).toHaveLength(1);
	});

	it('rewinds the suspense seed stream — one use() seeds exactly once across the passes', async () => {
		const data = Promise.resolve('hi');
		const html = (await prerender(mod.SuspenseUpdater, { data })).html;
		expect(html).toContain('hi:2');
		// The seed payload is the SERIAL array — duplicates would show up here.
		expect(html).toContain('["hi"]');
	});

	it('keys custom-hook state through withSlot — the loop converges', () => {
		expect(RT.renderToString(mod.CustomHookUpdater).html).toContain('Count: 4');
	});

	it('keeps repeated custom-hook calls independent when a retry skips the first call', () => {
		expect(RT.renderToString(mod.ConditionalCustomHooks).html).toContain('-1/20');
	});

	it('converges chained updates across two independent cells', () => {
		expect(RT.renderToString(mod.TwoCells).html).toContain('2/3');
	});

	it('rewinds scoped CSS and resource-hint dedupe state from a discarded pass', () => {
		const { html, css } = RT.renderToString(mod.ArtifactUpdater);

		expect(html).toContain('settled');
		expect(html).not.toContain('discarded-render-pass.css');
		expect(html.match(/href="\/shared-render-pass\.css"/g)).toHaveLength(1);
		expect(css).toContain('--settled-render-pass');
		expect(css).not.toContain('--discarded-render-pass');
	});

	it('throws after 25 passes when a render-phase update never settles', () => {
		expect(() => RT.renderToString(mod.Runaway)).toThrow(/Too many re-renders/);
	});
});
