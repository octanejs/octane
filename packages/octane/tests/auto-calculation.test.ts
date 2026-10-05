import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import {
	DerivedIdentity,
	DerivedValue,
	HookCallDeclarations,
	ReassignedLocal,
	HandlerOnlyCalculation,
	LiveReceiverCalculation,
	resetIdentities,
} from './_fixtures/auto-calculation.tsrx';
import {
	callTsxCallableProjection,
	TsxDerivedIdentity,
	TsxLiveReceiverCalculation,
	TsxUnstablePrefixedHook,
} from './_fixtures/tsx-auto-memo.tsx';

// A derived `const` whose initializer reaches a render-time call is cached on
// its component-local inputs. The observable contract is identity stability —
// downstream consumers keyed on that identity (an autoMemo region's dependency
// tuple, a memo() child's prop) can only bail if it holds — and, of course,
// that the cached value is still correct.
//
// The cache is a production-compile lowering, so `octane-prod` exercises the
// inline flat-cache branch while `octane` exercises the runtime hook form.
// Identical expectations across both projects is the semantic-equivalence
// proof, which is why these are behavioral assertions rather than codegen ones.

beforeEach(() => {
	resetIdentities();
});

describe('auto-calculation — identity is stable while inputs are', () => {
	it('reuses a derived array across an unrelated re-render', () => {
		const r = mount(DerivedIdentity);
		const first = r.find('#di-identity').textContent;
		expect(r.find('#di-count').textContent).toBe('1');

		// Unrelated state moves; `items` does not.
		r.click('#di-tick');
		expect(r.find('#di-tickval').textContent).toBe('1');
		expect(r.find('#di-identity').textContent).toBe(first);

		r.click('#di-tick');
		expect(r.find('#di-tickval').textContent).toBe('2');
		expect(r.find('#di-identity').textContent).toBe(first);
		r.unmount();
	});

	it('rebuilds the derived array when its input changes', () => {
		const r = mount(DerivedIdentity);
		const first = r.find('#di-identity').textContent;

		r.click('#di-add');
		const second = r.find('#di-identity').textContent;
		expect(second).not.toBe(first);
		expect(r.find('#di-count').textContent).toBe('2');

		// …and holds the new identity across the next unrelated render.
		r.click('#di-tick');
		expect(r.find('#di-identity').textContent).toBe(second);
		expect(r.find('#di-count').textContent).toBe('2');
		r.unmount();
	});
});

describe('auto-calculation — cached values stay correct', () => {
	it('recomputes a reduction and an imported projection when rows change', () => {
		const r = mount(DerivedValue);
		expect(r.find('#dv-total').textContent).toBe('3');
		expect(r.find('#dv-labels').textContent).toBe('r1:1,r2:2');

		// Unrelated re-render: values unchanged.
		r.click('#dv-tick');
		expect(r.find('#dv-tickval').textContent).toBe('1');
		expect(r.find('#dv-total').textContent).toBe('3');
		expect(r.find('#dv-labels').textContent).toBe('r1:1,r2:2');

		// Real input change reaches both derived values, repeatedly.
		r.click('#dv-bump');
		expect(r.find('#dv-total').textContent).toBe('13');
		expect(r.find('#dv-labels').textContent).toBe('r1:11,r2:2');
		r.click('#dv-bump');
		expect(r.find('#dv-total').textContent).toBe('23');
		expect(r.find('#dv-labels').textContent).toBe('r1:21,r2:2');
		r.unmount();
	});
});

describe('auto-calculation — hook calls are never cached', () => {
	// A cache around a hook call freezes its state cell and any subscription it
	// owns — a far worse failure than a stale value. Both declarations below are
	// syntactically indistinguishable from an ordinary creation; only the naming
	// convention marks them as hooks.
	it('keeps a custom hook declaration live', () => {
		const r = mount(HookCallDeclarations);
		expect(r.find('#hc-count').textContent).toBe('0');

		r.click('#hc-bump');
		expect(r.find('#hc-count').textContent).toBe('1');

		// An unrelated re-render must not resurrect a stale cell either.
		r.click('#hc-tick');
		expect(r.find('#hc-count').textContent).toBe('1');
		r.click('#hc-bump');
		expect(r.find('#hc-count').textContent).toBe('2');
		r.unmount();
	});

	it('keeps an `unstable_`-prefixed hook declaration live', () => {
		// React's staging prefix, mirrored by bindings — @octanejs/remix-router
		// ships `unstable_useRouterState`, and caching it froze the router's
		// pending navigation state at "(idle)".
		const r = mount(HookCallDeclarations);
		expect(r.find('#hc-label-value').textContent).toBe('a');

		r.click('#hc-label');
		expect(r.find('#hc-label-value').textContent).toBe('b');

		r.click('#hc-tick');
		expect(r.find('#hc-label-value').textContent).toBe('b');
		r.unmount();
	});
});

describe('auto-calculation — shapes that must keep recomputing', () => {
	it('leaves a reassigned local alone', () => {
		// Caching a `let`'s initializer would drop the reassignment below it.
		const r = mount(ReassignedLocal);
		expect(r.find('#rl-label').textContent).toBe('[base]');

		r.click('#rl-tick');
		expect(r.find('#rl-label').textContent).toBe('[changed]');
		r.unmount();
	});

	it('keeps a handler-only calculation correct as its inputs grow', () => {
		const r = mount(HandlerOnlyCalculation);
		r.click('#ho-read');
		expect(r.find('#ho-seen').textContent).toBe('r1:1');

		r.click('#ho-bump');
		r.click('#ho-read');
		expect(r.find('#ho-seen').textContent).toBe('r1:1|r2:2');
		r.unmount();
	});
});

describe('auto-calculation — a member call on a live receiver is never cached', () => {
	it('re-reads a stable receiver whose method answer changes', () => {
		// A cache keyed on the receiver's identity would freeze this reading, which
		// is how caching `virtualizer.getVirtualItems()` froze a virtualized list
		// mid-scroll. The receiver carries the hazard, so the author naming the
		// result does not make it safe.
		const r = mount(LiveReceiverCalculation);
		const first = r.find('#lr-reading').textContent;

		r.click('#lr-tick');
		expect(r.find('#lr-tickval').textContent).toBe('1');
		expect(r.find('#lr-reading').textContent).not.toBe(first);

		const second = r.find('#lr-reading').textContent;
		r.click('#lr-tick');
		expect(r.find('#lr-reading').textContent).not.toBe(second);
		r.unmount();
	});
});

describe('auto-calculation — React-style return components', () => {
	it('preserves derived identity across unrelated updates and invalidates changed inputs', () => {
		const root = mount(TsxDerivedIdentity);
		const first = root.find('#tsx-derived-identity').textContent;
		expect(root.find('#tsx-derived-values').textContent).toBe('r1:1');

		root.click('#tsx-derived-tick');
		expect(root.find('#tsx-derived-identity').textContent).toBe(first);

		root.click('#tsx-derived-add');
		const second = root.find('#tsx-derived-identity').textContent;
		expect(second).not.toBe(first);
		expect(root.find('#tsx-derived-values').textContent).toBe('r1:1,r2:2');

		root.click('#tsx-derived-tick');
		expect(root.find('#tsx-derived-identity').textContent).toBe(second);
		root.unmount();
	});

	it('keeps a live method-backed calculation reactive', () => {
		const root = mount(TsxLiveReceiverCalculation);
		const first = root.find('#tsx-receiver-value').textContent;

		root.click('#tsx-receiver-tick');
		const second = root.find('#tsx-receiver-value').textContent;
		expect(second).not.toBe(first);

		root.click('#tsx-receiver-tick');
		expect(root.find('#tsx-receiver-value').textContent).not.toBe(second);
		root.unmount();
	});

	it('keeps an imported uppercase UNSTABLE_ custom hook live after a built-in hook', () => {
		const root = mount(TsxUnstablePrefixedHook);
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('0');

		root.click('#tsx-unstable-hook-increment');
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('1');

		root.click('#tsx-unstable-hook-tick');
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('1');

		root.click('#tsx-unstable-hook-increment');
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('2');
		root.unmount();
	});

	it('keeps hookless return components callable outside a render scope', () => {
		const rows = [{ id: 1, n: 1 }];
		expect(() => callTsxCallableProjection({ rows })).not.toThrow();

		const root = mount(callTsxCallableProjection, { rows });
		expect(root.find('#tsx-callable-values').textContent).toBe('r1:1');
		root.unmount();
	});
});

// Strong modules assert that render-time calls are pure projections, so an
// inline render expression is cached exactly like the same expression named by
// a `const`. Strong caching is a production client lowering, so this source is
// compiled with production options in both test projects. The runner supplies
// the projection and identity probes, outside the analyzed component source.
const STRONG_INLINE_CALCULATIONS = `
	'use strong';
	import { useState } from 'octane';

	type Row = { readonly id: number; readonly n: number };
	type Project = (rows: readonly Row[]) => readonly string[];
	type Identify = (value: object) => string;

	function RowsIdentity({ rows, identify }: { rows: readonly string[]; identify: Identify }) @{
		<span id="strong-prop-identity">{identify(rows) as string}</span>
	}

	export function InlineCalculations({ project, identify }: { project: Project; identify: Identify }) @{
		const [rows, setRows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const [tick, setTick] = useState(0);
		const total = rows.length * 1.25;
		<div>
			<button id="strong-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
			<button
				id="strong-add"
				onClick={() => setRows([...rows, { id: rows.length + 1, n: rows.length + 1 }])}
			>{'add'}</button>
			<span id="strong-hole-identity">{identify(project(rows)) as string}</span>
			<RowsIdentity rows={project(rows)} identify={identify} />
			<span id="strong-attribute" title={project(rows).join(',')}>{'rows'}</span>
			<output id="strong-total">{total.toFixed(2)}</output>
			<span id="strong-tick-value">{String(tick)}</span>
		</div>
	}

	type User = { readonly name: string };

	function Gate({ open, children }: { open: boolean; children: unknown }) @{
		<>
			@if (open) {
				<section>{children}</section>
			}
		</>
	}

	export function DeferredCalculations({ user, open }: { user: User | null; open: boolean }) @{
		<div>
			@if (user !== null) {
				<b id="strong-arm">{user.name.toUpperCase() as string}</b>
			}
			<Gate open={open}>
				<i id="strong-child">{user!.name.toUpperCase() as string}</i>
			</Gate>
		</div>
	}
`;

// The React-style form: returned JSX is cached after an authored hook, while a
// hookless return component stays an ordinary function callable anywhere.
const STRONG_RETURN_CALCULATIONS = `
	'use strong';
	import { useState } from 'octane';

	type Row = { readonly id: number; readonly n: number };
	type Probes = {
		project: (rows: readonly Row[]) => readonly string[];
		identify: (value: object) => string;
	};

	export function ReturnCalculations({ project, identify }: Probes) {
		const [rows, setRows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const [tick, setTick] = useState(0);
		return (
			<div>
				<button id="return-tick" onClick={() => setTick(tick + 1)}>tick</button>
				<button
					id="return-add"
					onClick={() => setRows([...rows, { id: rows.length + 1, n: rows.length + 1 }])}
				>
					add
				</button>
				<span id="return-identity">{identify(project(rows))}</span>
				<span id="return-tick-value">{String(tick)}</span>
			</div>
		);
	}

	export function CallableReturn({ project, identify, rows }: Probes & { rows: readonly Row[] }) {
		return <span id="return-callable">{identify(project(rows))}</span>;
	}
`;

describe('auto-calculation — Strong inline render expressions', () => {
	const client = loadCompiledFixtureSource(STRONG_INLINE_CALCULATIONS, {
		id: 'strong-inline-calculations.tsrx',
		mode: 'client',
		compileOptions: { hmr: false, dev: false },
	});
	const returned = loadCompiledFixtureSource(STRONG_RETURN_CALCULATIONS, {
		id: 'strong-return-calculations.tsx',
		mode: 'client',
		compileOptions: { hmr: false, dev: false },
	});

	function probes() {
		let next = 0;
		const ids = new WeakMap<object, number>();
		return {
			project: (rows: ReadonlyArray<{ id: number; n: number }>) =>
				rows.map((row) => `r${row.id}:${row.n}`),
			identify: (value: object) => {
				let id = ids.get(value);
				if (id === undefined) ids.set(value, (id = ++next));
				return 'id' + id;
			},
		};
	}

	it('keeps inline hole and prop calculations stable while their inputs are', () => {
		const r = mount(client.InlineCalculations, probes());
		const hole = r.find('#strong-hole-identity').textContent;
		const prop = r.find('#strong-prop-identity').textContent;
		expect(r.find('#strong-attribute').getAttribute('title')).toBe('r1:1');
		expect(r.find('#strong-total').textContent).toBe('1.25');

		r.click('#strong-tick');
		expect(r.find('#strong-tick-value').textContent).toBe('1');
		expect(r.find('#strong-hole-identity').textContent).toBe(hole);
		expect(r.find('#strong-prop-identity').textContent).toBe(prop);

		r.click('#strong-add');
		const nextHole = r.find('#strong-hole-identity').textContent;
		const nextProp = r.find('#strong-prop-identity').textContent;
		expect(nextHole).not.toBe(hole);
		expect(nextProp).not.toBe(prop);
		expect(r.find('#strong-attribute').getAttribute('title')).toBe('r1:1,r2:2');
		expect(r.find('#strong-total').textContent).toBe('2.50');

		r.click('#strong-tick');
		expect(r.find('#strong-tick-value').textContent).toBe('2');
		expect(r.find('#strong-hole-identity').textContent).toBe(nextHole);
		expect(r.find('#strong-prop-identity').textContent).toBe(nextProp);
		r.unmount();
	});

	it('keeps a returned inline calculation stable after an authored hook', () => {
		const r = mount(returned.ReturnCalculations, probes());
		const first = r.find('#return-identity').textContent;

		r.click('#return-tick');
		expect(r.find('#return-tick-value').textContent).toBe('1');
		expect(r.find('#return-identity').textContent).toBe(first);

		r.click('#return-add');
		const second = r.find('#return-identity').textContent;
		expect(second).not.toBe(first);

		r.click('#return-tick');
		expect(r.find('#return-tick-value').textContent).toBe('2');
		expect(r.find('#return-identity').textContent).toBe(second);
		r.unmount();
	});

	it('keeps a hookless Strong return component an ordinary deferred function', () => {
		// A direct call returns an element that reads its inputs when it renders.
		// Caching the hole would read them at the call instead.
		const reads: object[] = [];
		const { project, identify } = probes();
		const props = {
			project,
			identify: (value: object) => {
				reads.push(value);
				return identify(value);
			},
			rows: [{ id: 1, n: 1 }],
		};
		expect(() => returned.CallableReturn(props)).not.toThrow();
		expect(reads).toEqual([]);

		const r = mount(returned.CallableReturn, props);
		expect(r.find('#return-callable').textContent).toBe('id1');
		r.unmount();
	});

	it('evaluates expressions in directive arms and component children only when they render', () => {
		// Moving either expression into setup would read `name` of null.
		const r = mount(client.DeferredCalculations, { user: null, open: false });
		expect(r.container.querySelector('#strong-arm')).toBeNull();
		expect(r.container.querySelector('#strong-child')).toBeNull();

		r.update(client.DeferredCalculations, { user: { name: 'ada' }, open: true });
		expect(r.find('#strong-arm').textContent).toBe('ADA');
		expect(r.find('#strong-child').textContent).toBe('ADA');

		r.update(client.DeferredCalculations, { user: null, open: false });
		expect(r.container.querySelector('#strong-arm')).toBeNull();
		expect(r.container.querySelector('#strong-child')).toBeNull();
		r.unmount();
	});
});

// A cached calculation can only hit while each of its inputs keeps its
// identity, so a `const` read only by another cached calculation is cached too,
// through a chain of any length. Compatibility mode admits imported callees, so
// the runner supplies the projections as a module; Strong admits any call, so
// there they arrive as props.
const CHAINED_CALCULATIONS = `
	import { useState } from 'octane';
	import { project, wrap, identify, make } from './chain-probes';

	type Row = { readonly id: number; readonly n: number };

	export function Chained() @{
		const [rows, setRows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const [tick, setTick] = useState(0);
		const labels = project(rows);
		const wrapped = wrap(labels);
		const boxed = wrap(wrapped);
		<div>
			<button id="chain-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
			<button
				id="chain-add"
				onClick={() => setRows([...rows, { id: rows.length + 1, n: rows.length + 1 }])}
			>{'add'}</button>
			<span id="chain-identity">{identify(boxed) as string}</span>
			<span id="chain-values">{boxed.value.value.join(',') as string}</span>
			<span id="chain-tick-value">{String(tick)}</span>
		</div>
	}

	type Reader = { readonly read: () => readonly string[] };

	// A dependency array is evaluated at its declaration, so a calculation whose
	// callback reads a later const cannot be cached: its dependency on labels
	// would read labels before it is initialized.
	export function ForwardRead() @{
		const [rows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const reader: Reader = make(() => labels);
		const labels = project(rows);
		<span id="forward-read">{reader.read().join(',') as string}</span>
	}

	export function ChainedForwardRead() @{
		const [rows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const reader: Reader = make(() => labels);
		const labels = project(rows);
		const boxed = wrap(reader);
		<span id="chained-forward-read">{(boxed.value as Reader).read().join(',') as string}</span>
	}
`;

const RETURN_CHAINED_CALCULATIONS = `
	import { useState } from 'octane';
	import { project, wrap, identify } from './chain-probes';

	type Row = { readonly id: number; readonly n: number };

	export function ReturnChained() {
		const [rows, setRows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const [tick, setTick] = useState(0);
		const labels = project(rows);
		const wrapped = wrap(labels);
		return (
			<div>
				<button id="return-chain-tick" onClick={() => setTick(tick + 1)}>tick</button>
				<button
					id="return-chain-add"
					onClick={() => setRows([...rows, { id: rows.length + 1, n: rows.length + 1 }])}
				>
					add
				</button>
				<span id="return-chain-identity">{identify(wrapped)}</span>
				<span id="return-chain-values">{wrapped.value.join(',')}</span>
				<span id="return-chain-tick-value">{String(tick)}</span>
			</div>
		);
	}
`;

// Strong hoists `identify(wrap(labels))` into a compiler-named calculation, so
// `labels` is read only by that calculation.
const STRONG_CHAINED_CALCULATIONS = `
	'use strong';
	import { useState } from 'octane';

	type Row = { readonly id: number; readonly n: number };
	type Reader = { readonly read: () => readonly string[] };
	type Probes = {
		project: (rows: readonly Row[]) => readonly string[];
		wrap: (value: object) => { readonly value: object };
		make: (read: () => readonly string[]) => Reader;
		identify: (value: object) => string;
	};

	export function StrongChained({ project, wrap, identify }: Probes) @{
		const [rows, setRows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const [tick, setTick] = useState(0);
		const labels = project(rows);
		<div>
			<button id="strong-chain-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
			<button
				id="strong-chain-add"
				onClick={() => setRows([...rows, { id: rows.length + 1, n: rows.length + 1 }])}
			>{'add'}</button>
			<span id="strong-chain-identity">{identify(wrap(labels)) as string}</span>
			<span id="strong-chain-values">{labels.join(',') as string}</span>
			<span id="strong-chain-tick-value">{String(tick)}</span>
		</div>
	}

	// The hoisted calculation reads reader, whose callback reads a later const.
	export function StrongForwardRead({ project, make }: Probes) @{
		const [rows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const reader = make(() => labels);
		const labels = project(rows);
		<span id="strong-forward-read">{reader.read().join(',') as string}</span>
	}
`;

const STRONG_RETURN_CHAINED_CALCULATIONS = `
	'use strong';
	import { useState } from 'octane';

	type Row = { readonly id: number; readonly n: number };
	type Probes = {
		project: (rows: readonly Row[]) => readonly string[];
		wrap: (value: object) => { readonly value: object };
		identify: (value: object) => string;
	};

	export function StrongReturnChained({ project, wrap, identify }: Probes) {
		const [rows, setRows] = useState<readonly Row[]>([{ id: 1, n: 1 }]);
		const [tick, setTick] = useState(0);
		const labels = project(rows);
		return (
			<div>
				<button id="strong-return-chain-tick" onClick={() => setTick(tick + 1)}>tick</button>
				<button
					id="strong-return-chain-add"
					onClick={() => setRows([...rows, { id: rows.length + 1, n: rows.length + 1 }])}
				>
					add
				</button>
				<span id="strong-return-chain-identity">{identify(wrap(labels))}</span>
				<span id="strong-return-chain-values">{labels.join(',')}</span>
				<span id="strong-return-chain-tick-value">{String(tick)}</span>
			</div>
		);
	}
`;

describe('auto-calculation — chained calculations', () => {
	function chainProbes() {
		let next = 0;
		const ids = new WeakMap<object, number>();
		return {
			project: (rows: ReadonlyArray<{ id: number; n: number }>) =>
				rows.map((row) => `r${row.id}:${row.n}`),
			wrap: (value: object) => ({ value }),
			make: (read: () => readonly string[]) => ({ read }),
			identify: (value: object) => {
				let id = ids.get(value);
				if (id === undefined) ids.set(value, (id = ++next));
				return 'id' + id;
			},
		};
	}

	const compileOptions = { hmr: false, dev: false };
	const runtimeModules = { './chain-probes': chainProbes() };
	const chained = loadCompiledFixtureSource(CHAINED_CALCULATIONS, {
		id: 'chained-calculations.tsrx',
		mode: 'client',
		compileOptions,
		runtimeModules,
	});
	const returnChained = loadCompiledFixtureSource(RETURN_CHAINED_CALCULATIONS, {
		id: 'return-chained-calculations.tsx',
		mode: 'client',
		compileOptions,
		runtimeModules,
	});
	const strongChained = loadCompiledFixtureSource(STRONG_CHAINED_CALCULATIONS, {
		id: 'strong-chained-calculations.tsrx',
		mode: 'client',
		compileOptions,
	});
	const strongReturnChained = loadCompiledFixtureSource(STRONG_RETURN_CHAINED_CALCULATIONS, {
		id: 'strong-return-chained-calculations.tsx',
		mode: 'client',
		compileOptions,
	});

	// Each case renders a chain's last value's identity and its values. The
	// identity holds across an unrelated update, changes with the chain's
	// first input, then holds again.
	function expectChainStable(
		r: ReturnType<typeof mount>,
		prefix: string,
		values: readonly [string, string],
	) {
		const first = r.find(`#${prefix}-identity`).textContent;
		expect(r.find(`#${prefix}-values`).textContent).toBe(values[0]);

		r.click(`#${prefix}-tick`);
		expect(r.find(`#${prefix}-tick-value`).textContent).toBe('1');
		expect(r.find(`#${prefix}-identity`).textContent).toBe(first);

		r.click(`#${prefix}-add`);
		const second = r.find(`#${prefix}-identity`).textContent;
		expect(second).not.toBe(first);
		expect(r.find(`#${prefix}-values`).textContent).toBe(values[1]);

		r.click(`#${prefix}-tick`);
		expect(r.find(`#${prefix}-tick-value`).textContent).toBe('2');
		expect(r.find(`#${prefix}-identity`).textContent).toBe(second);
		expect(r.find(`#${prefix}-values`).textContent).toBe(values[1]);
	}

	it('caches every link of a const chain the template reads only at its end', () => {
		const r = mount(chained.Chained);
		expectChainStable(r, 'chain', ['r1:1', 'r1:1,r2:2']);
		r.unmount();
	});

	it('never caches a calculation whose callback reads a later const', () => {
		const direct = mount(chained.ForwardRead);
		expect(direct.find('#forward-read').textContent).toBe('r1:1');
		direct.unmount();

		// Following the chain from `boxed` must not cache `reader` either.
		const chain = mount(chained.ChainedForwardRead);
		expect(chain.find('#chained-forward-read').textContent).toBe('r1:1');
		chain.unmount();

		// Nor following it from a Strong inline calculation.
		const strong = mount(strongChained.StrongForwardRead, chainProbes());
		expect(strong.find('#strong-forward-read').textContent).toBe('r1:1');
		strong.unmount();
	});

	it('caches a const chain in a return component after an authored hook', () => {
		const r = mount(returnChained.ReturnChained);
		expectChainStable(r, 'return-chain', ['r1:1', 'r1:1,r2:2']);
		r.unmount();
	});

	it('caches a const that only a Strong inline calculation reads', () => {
		const r = mount(strongChained.StrongChained, chainProbes());
		expectChainStable(r, 'strong-chain', ['r1:1', 'r1:1,r2:2']);
		r.unmount();
	});

	it('caches a const that only a Strong returned inline calculation reads', () => {
		const r = mount(strongReturnChained.StrongReturnChained, chainProbes());
		expectChainStable(r, 'strong-return-chain', ['r1:1', 'r1:1,r2:2']);
		r.unmount();
	});
});
