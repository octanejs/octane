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
	<>
		<style>
			.discarded-style {
				--discarded-render-pass: 1;
			}
		</style>
		<div class="discarded-style">{'discarded'}</div>
	</>
}
function SettledStyle() @{
	<>
		<style>
			.settled-style {
				--settled-render-pass: 1;
			}
		</style>
		<div class="settled-style">{'settled'}</div>
	</>
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

function DiscardedArtifacts() @{
	<>
		<style>
			.leaked-pass {
				--leaked-pass: 1;
			}
		</style>
		<i class="leaked-pass">{'leaked'}</i>
	</>
}
export function RetrySibling(props) @{
	const [settled, setSettled] = useState(false);
	if (!settled) {
		preload('/discarded-' + props.mark + '.css', { as: 'style' });
		setSettled(true);
	}
	<section>
		@if (!settled) {
			<DiscardedArtifacts />
		} @else {
			<b class="settled">{props.mark}</b>
		}
	</section>
}
export function PairedRetries() @{
	<div><RetrySibling mark="a" /><RetrySibling mark="b" /></div>
}
// The settled twin: same component/hook/branch shape, converged initial state.
export function SettledSibling(props) @{
	const [settled] = useState(true);
	<section>
		@if (!settled) {
			<DiscardedArtifacts />
		} @else {
			<b class="settled">{props.mark}</b>
		}
	</section>
}
export function PairedRef() @{
	<div><SettledSibling mark="a" /><SettledSibling mark="b" /></div>
}

// Two @for loops drive the frame's occurrence counters through both
// representations: the small loop keeps four site keys in the flat pair list
// and hits each once per iteration, while the large loop overflows nine
// distinct sites into a promoted Map. A counter that cannot increment — or a
// retry that fails to rewind it — rewrites a use() cache key and
// cross-resolves values between iterations.
export function ManyUsesRetry(p) @{
	const [n, setN] = useState(0);
	if (n < 2) setN(n + 1);
	<div>
		@for (const it of p.small; key it.k) {
			const a = use(it.a); const b = use(it.b); const c = use(it.c); const d = use(it.d);
			<span>{n + it.k + '=' + a + b + c + d}</span>
		}
		@for (const it of p.large; key it.k) {
			const v0 = use(it.v0); const v1 = use(it.v1); const v2 = use(it.v2);
			const v3 = use(it.v3); const v4 = use(it.v4); const v5 = use(it.v5);
			const v6 = use(it.v6); const v7 = use(it.v7); const v8 = use(it.v8);
			<span>{n + it.k + '=' + v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8}</span>
		}
	</div>
}
export function ManyUsesRef(p) @{
	const [n] = useState(2);
	<div>
		@for (const it of p.small; key it.k) {
			const a = use(it.a); const b = use(it.b); const c = use(it.c); const d = use(it.d);
			<span>{n + it.k + '=' + a + b + c + d}</span>
		}
		@for (const it of p.large; key it.k) {
			const v0 = use(it.v0); const v1 = use(it.v1); const v2 = use(it.v2);
			const v3 = use(it.v3); const v4 = use(it.v4); const v5 = use(it.v5);
			const v6 = use(it.v6); const v7 = use(it.v7); const v8 = use(it.v8);
			<span>{n + it.k + '=' + v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8}</span>
		}
	</div>
}

function ScopedUseChild(p) @{
	const v = use(p.data);
	<i>{p.mark + '=' + v}</i>
}
// Ten @try sites run their arms under ten distinct scopes on this one frame,
// promoting its per-scope child counters to a Map; the last arm holds TWO
// children, so the same scope's counter must increment — a counter stuck at
// zero gives both children one frame segment, colliding their use() keys and
// cross-resolving values. The retry must rebuild identical ones.
export function ManyArmsRetry(p) @{
	const [settled, setSettled] = useState(false);
	if (!settled) setSettled(true);
	<div>
		@try {<><ScopedUseChild mark="s0" data={p.s0} /><ScopedUseChild mark="s1" data={p.s1} /></>} @pending {<b>px</b>}
		@try {<ScopedUseChild mark="t1" data={p.d1} />} @pending {<b>p1</b>}
		@try {<ScopedUseChild mark="t2" data={p.d2} />} @pending {<b>p2</b>}
		@try {<ScopedUseChild mark="t3" data={p.d3} />} @pending {<b>p3</b>}
		@try {<ScopedUseChild mark="t4" data={p.d4} />} @pending {<b>p4</b>}
		@try {<ScopedUseChild mark="t5" data={p.d5} />} @pending {<b>p5</b>}
		@try {<ScopedUseChild mark="t6" data={p.d6} />} @pending {<b>p6</b>}
		@try {<ScopedUseChild mark="t7" data={p.d7} />} @pending {<b>p7</b>}
		@try {<ScopedUseChild mark="t8" data={p.d8} />} @pending {<b>p8</b>}
		@try {<ScopedUseChild mark="t9" data={p.d9} />} @pending {<b>p9</b>}
	</div>
}
export function ManyArmsRef(p) @{
	const [settled] = useState(true);
	<div>
		@try {<><ScopedUseChild mark="s0" data={p.s0} /><ScopedUseChild mark="s1" data={p.s1} /></>} @pending {<b>px</b>}
		@try {<ScopedUseChild mark="t1" data={p.d1} />} @pending {<b>p1</b>}
		@try {<ScopedUseChild mark="t2" data={p.d2} />} @pending {<b>p2</b>}
		@try {<ScopedUseChild mark="t3" data={p.d3} />} @pending {<b>p3</b>}
		@try {<ScopedUseChild mark="t4" data={p.d4} />} @pending {<b>p4</b>}
		@try {<ScopedUseChild mark="t5" data={p.d5} />} @pending {<b>p5</b>}
		@try {<ScopedUseChild mark="t6" data={p.d6} />} @pending {<b>p6</b>}
		@try {<ScopedUseChild mark="t7" data={p.d7} />} @pending {<b>p7</b>}
		@try {<ScopedUseChild mark="t8" data={p.d8} />} @pending {<b>p8</b>}
		@try {<ScopedUseChild mark="t9" data={p.d9} />} @pending {<b>p9</b>}
	</div>
}

// A suspended component replays through runDiscoveryRound on a fresh frame
// reproducing its own path; a render-phase retry on that pass must still
// rewind the scoped counts the discarded invocation accumulated — leaking
// them would shift the children's use() keys onto one another's values.
export function JobRetry(p) @{
	const [n, setN] = useState(0);
	if (n < 2) setN(n + 1);
	<section>
		@try {<ScopedUseChild mark="j0" data={p.j0} />} @pending {<b>w</b>}
		@try {<ScopedUseChild mark="j1" data={p.j1} />} @pending {<b>w</b>}
		@try {<ScopedUseChild mark="j2" data={p.j2} />} @pending {<b>w</b>}
		{n}
	</section>
}
export function JobRef(p) @{
	const [n] = useState(2);
	<section>
		@try {<ScopedUseChild mark="j0" data={p.j0} />} @pending {<b>w</b>}
		@try {<ScopedUseChild mark="j1" data={p.j1} />} @pending {<b>w</b>}
		@try {<ScopedUseChild mark="j2" data={p.j2} />} @pending {<b>w</b>}
		{n}
	</section>
}
`;

function evalServer(source: string): Record<string, any> {
	let { code } = compile(source, 'render-phase-state.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
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

	it('rewinds collections that were empty when the discarded pass began — sequential retries cannot leak or resurrect artifacts', () => {
		// Each sibling's first pass is discarded while every captured collection
		// (scoped CSS, head hints, preload transfers) is still empty, so rewind must
		// REMOVE what that pass created — restoring "empty" is not enough, and a
		// snapshot shared across siblings must never carry one sibling's discarded
		// state into the other's rewind.
		const { html, css } = RT.renderToString(mod.PairedRetries);
		expect(html).toBe(RT.renderToString(mod.PairedRef).html);
		expect(html).not.toContain('leaked-pass');
		expect(html).not.toContain('discarded-a.css');
		expect(html).not.toContain('discarded-b.css');
		expect(css).not.toContain('--leaked-pass');
	});

	it('promotes per-site use() counters past the flat-list limit without shifting occurrence keys across retries', async () => {
		// `small` exercises array-path increments (4 keys, hit twice); `large`
		// forces promotion (9 keys). A counter stuck at zero, or a rewind that
		// fails to reset it, rewrites a use() key and cross-resolves iterations.
		const mkItem = (k: string, names: string[]) =>
			Object.fromEntries([
				['k', k],
				...names.map((name, i) => [name, Promise.resolve(k + i)] as const),
			]);
		const props = {
			small: [mkItem('x', ['a', 'b', 'c', 'd']), mkItem('y', ['a', 'b', 'c', 'd'])],
			large: [
				mkItem(
					'p',
					Array.from({ length: 9 }, (_, i) => 'v' + i),
				),
				mkItem(
					'q',
					Array.from({ length: 9 }, (_, i) => 'v' + i),
				),
			],
		};
		const html = (await prerender(mod.ManyUsesRetry, props)).html;
		expect(html).toBe((await prerender(mod.ManyUsesRef, props)).html);
		expect(html).toContain('2x=x0x1x2x3');
		expect(html).toContain('2y=y0y1y2y3');
		expect(html).toContain('2q=q0q1q2q3q4q5q6q7q8');
	});

	it('promotes per-scope child counters past the flat-list limit without conflating arm scopes across retries', async () => {
		// Ten @try sites give this frame ten distinct arm scopes; child use() keys
		// embed the scope-qualified frame segment, so a conflated counter would
		// cross-resolve two children's data or collide their boundary identity.
		const props = Object.fromEntries([
			['s0', Promise.resolve('S0')],
			['s1', Promise.resolve('S1')],
			...Array.from({ length: 9 }, (_, i) => [`d${i + 1}`, Promise.resolve('D' + (i + 1))]),
		]);
		const html = (await prerender(mod.ManyArmsRetry, props)).html;
		expect(html).toBe((await prerender(mod.ManyArmsRef, props)).html);
		expect(html).toContain('s0=S0');
		expect(html).toContain('s1=S1');
		for (let i = 1; i < 10; i++) expect(html).toContain(`t${i}=D${i}`);
		// The unresolved buffered path exercises the same promoted counters via
		// the pending scopes.
		expect((await RT.renderToString(mod.ManyArmsRetry, props)).html).toBe(
			(await RT.renderToString(mod.ManyArmsRef, props)).html,
		);
	});

	it('restores populated scoped counters on a deferred-job replay without aliasing the snapshot', async () => {
		// The children suspend during discovery, so JobRetry replays with a frame
		// whose scoped counts are already non-empty when the retry captures them.
		// Two dispatches mean two rewinds of that captured list — if the restore
		// aliased the snapshot, pass two would corrupt pass three's counters and
		// shift each child's use() key onto a sibling's resolved value.
		const props = Object.fromEntries(
			Array.from({ length: 3 }, (_, i) => ['j' + i, Promise.resolve('J' + i)]),
		);
		const html = (await prerender(mod.JobRetry, props)).html;
		expect(html).toBe((await prerender(mod.JobRef, props)).html);
		for (let i = 0; i < 3; i++) expect(html).toContain(`j${i}=J${i}`);
	});

	it('throws after 25 passes when a render-phase update never settles', () => {
		expect(() => RT.renderToString(mod.Runaway)).toThrow(/Too many re-renders/);
	});
});
