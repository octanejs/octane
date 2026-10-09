import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	createPortal,
	createContext,
	hydrateRoot,
	startTransition,
	memo,
	Suspense,
	use,
	useDeferredValue,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	Activity,
	ViewTransition,
	useState,
	useTransition,
} from 'octane';
import { renderToString } from 'octane/server';
import {
	TextArm,
	gate as hydrationGate,
} from './hydration/_fixtures/suspended-arm-value-mismatch.tsrx';
import { profiler } from 'octane/profiling';
import { act, mount, nextPaint } from './_helpers';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks';
import { TypedUpdateApp } from './_fixtures/view-transition-features.tsrx';
import { DeoptList } from './_fixtures/deopt-list.tsrx';
import { RenderBoundary } from './_fixtures/try-catch.tsrx';
import { SwitchSwap } from './_fixtures/transition-swap-switch.tsrx';
import { App as ContextApp } from './_fixtures/context-bailout.tsrx';
import { WideSwitch } from './_fixtures/hookless-arms.tsrx';
import { makeStore, Reader } from './_fixtures/sync-external-store.tsrx';

function CounterLeaf(props) @{
	<span>{props.count as string}</span>
}

function StaticBadgeImpl() @{
	<i>stable</i>
}
const StaticBadge = memo(StaticBadgeImpl);

function CounterApp() @{
	const [count, setCount] = useState(0);
	<div>
		<button onClick={() => setCount(count + 1)}>increment</button>
		<CounterLeaf count={count} />
		<StaticBadge />
	</div>
}

function SuspendingChild(props) @{
	const value = use(props.promise);
	<strong>{value as string}</strong>
}

function SuspenseApp(props) @{
	<Suspense fallback={<em>pending</em>}>
		<SuspendingChild promise={props.promise} />
	</Suspense>
}

function ThrowingChild(props) {
	throw props.value;
}

function ErrorBoundaryApp(props) @{
	<>
		@try {
			<ThrowingChild value={props.value} />
		} @catch (error) {
			<em>caught</em>
		}
	</>
}

function ThrownResourceApp(props: { value: PromiseLike<unknown> }) @{
	<Suspense fallback={<em>pending</em>}>
		<ThrowingChild value={props.value} />
	</Suspense>
}

function useCounter() {
	return useState(0);
}

function CustomHookCounter() @{
	const [count, setCount] = useCounter();
	<button onClick={() => setCount(count + 1)}>{count as string}</button>
}

function DeferredLabel() @{
	const [value, setValue] = useState('before');
	const deferred = useDeferredValue(value);
	<button onClick={() => setValue('after')}>{deferred}</button>
}

function TransitionRebaseApp(props) @{
	const [value, setValue] = useState(1);
	const [isPending, start] = useTransition();
	<>
		<button
			id="stage"
			onClick={() =>
				start(async () => {
					setValue(0);
					await props.gate;
				})
			}
		>
			{isPending ? 'pending' : 'stage'}
		</button>
		<button id="urgent" onClick={() => setValue(0)}>
			{value as string}
		</button>
	</>
}

let updateMemoChild = () => {};

function MemoChildImpl() @{
	const [count, setCount] = useState(0);
	updateMemoChild = () => setCount(count + 1);
	<span>{count as string}</span>
}
const MemoChild = memo(MemoChildImpl);

function ParentAndChildUpdateApp() @{
	const [count, setCount] = useState(0);
	<>
		<button
			onClick={() => {
				setCount(count + 1);
				updateMemoChild();
			}}
		>
			{count as string}
		</button>
		<MemoChild />
	</>
}

function DirectChild() @{
	<strong>direct child</strong>
}

function DirectReturnApp() {
	return <DirectChild />;
}

function ValueChild() @{
	<b>value child</b>
}

function ComponentValueApp() @{
	<>
		{ValueChild}
		<ValueChild />
	</>
}

function NativeElementApp(props) @{
	const Tag = props.tag;
	<Tag>native element</Tag>
}

function PortalBody(props) @{
	<span>{props.label}</span>
}

function ComponentPortalApp(props) @{
	const [label, setLabel] = useState('first');
	<div>
		<button onClick={() => setLabel('second')}>update portal</button>
		{createPortal(PortalBody, props.target, { label })}
	</div>
}

function InlinePortalApp(props) @{
	<div>{createPortal(<span>inline portal</span>, props.target)}</div>
}

function KeyedPortalApp(props: { target: Element; id: string }) {
	return createPortal(<PortalBody key={props.id} label={props.id} />, props.target, 'stable');
}

function ArmA() @{
	<b>first arm</b>
}

function ArmB() @{
	<i>second arm</i>
}

function ArmApp() @{
	const [first, setFirst] = useState(true);
	const [count, setCount] = useState(0);
	<div>
		<button id="toggle" onClick={() => setFirst(!first)}>
			toggle
		</button>
		<button id="bump" onClick={() => setCount(count + 1)}>
			{String(count)}
		</button>
		@if (first) {
			<ArmA />
		} @else {
			<ArmB />
		}
	</div>
}

function UnboundedReader(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<p>{value as string}</p>
}

function renders(component) {
	return profiler.why(component).filter((event) => event.type === 'component-render');
}

/** Counter changes across `run`, which must leave its work committed. */
async function measure(run: () => unknown) {
	const before = profiler.snapshot();
	await run();
	return profiler.diff(before, profiler.snapshot()).counters;
}

function render(component, phase) {
	const event = renders(component).find((candidate) => candidate.phase === phase);
	expect(event).toBeDefined();
	return event;
}

function cause(event, type) {
	return event.causes.find((candidate) => candidate.type === type);
}

beforeEach(() => {
	profiler.clear();
	profiler.start({ bufferSize: 10_000, timeline: false });
});

afterEach(() => {
	profiler.stop();
});

describe('profile build component events', () => {
	it('keeps component identity across mount and state-driven updates', async () => {
		const mounted = mount(CounterApp);
		await act(() => mounted.click('button'));

		const appEvents = renders('CounterApp');
		expect(appEvents.map((event) => event.phase)).toEqual(['mount', 'update']);
		expect(new Set(appEvents.map((event) => event.instanceId)).size).toBe(1);
		expect(cause(appEvents[1], 'state')).toMatchObject({ hook: 'useState' });

		const leafEvents = renders('CounterLeaf');
		expect(leafEvents.map((event) => event.phase)).toEqual(['mount', 'update']);
		expect(new Set(leafEvents.map((event) => event.instanceId)).size).toBe(1);
		expect(cause(leafEvents[1], 'parent')).toBeDefined();
		for (const event of [...appEvents, ...leafEvents]) {
			expect(event.selfDuration).toBeGreaterThanOrEqual(0);
			expect(event.selfDuration).toBeLessThanOrEqual(event.duration);
		}

		mounted.unmount();
	});

	it('reports a memo bailout separately from component invocation', async () => {
		const mounted = mount(CounterApp);
		await act(() => mounted.click('button'));

		const events = profiler.why('StaticBadge');
		expect(events.filter((event) => event.type === 'component-render')).toHaveLength(1);
		expect(events.filter((event) => event.type === 'component-bailout')).toHaveLength(1);
		expect(cause(events.at(-1), 'memo-bailout')).toBeDefined();
		expect(profiler.summary().find((entry) => entry.component === 'StaticBadge')).toMatchObject({
			attempts: 1,
			bails: 1,
		});

		mounted.unmount();
	});

	it('reports use() suspension as a suspended render attempt', () => {
		const mounted = mount(SuspenseApp, { promise: new Promise<string>(() => {}) });

		expect(render('SuspendingChild', 'mount').outcome).toBe('suspended');

		mounted.unmount();
	});

	it('reports thrown errors without retaining their value', () => {
		const mounted = mount(ErrorBoundaryApp, {
			value: new Error('sensitive application detail'),
		});

		expect(render('ThrowingChild', 'mount').outcome).toBe('errored');
		expect(JSON.stringify(profiler.getEvents())).not.toContain('sensitive application detail');

		mounted.unmount();
	});

	it('reports a resource-thrown thenable as a suspended render attempt', () => {
		const mounted = mount(ThrownResourceApp, { value: new Promise<string>(() => {}) });

		expect(render('ThrowingChild', 'mount').outcome).toBe('suspended');
		expect(mounted.container.textContent).toBe('pending');

		mounted.unmount();
	});
});

describe('profile build render causes', () => {
	it('retains base-hook metadata through a custom hook', async () => {
		const mounted = mount(CustomHookCounter);
		await act(() => mounted.click('button'));

		expect(cause(render('CustomHookCounter', 'update'), 'state')).toMatchObject({
			hook: 'useState',
			source: expect.stringContaining('profiling-runtime.test.tsrx:'),
		});

		mounted.unmount();
	});

	it('identifies updates from an external store', async () => {
		const store = makeStore(0);
		const mounted = mount(Reader, { store });
		await nextPaint();
		profiler.clear();

		store.set(1);
		await nextPaint();

		expect(cause(render('Reader', 'update'), 'external-store')).toMatchObject({
			hook: 'useSyncExternalStore',
			source: expect.stringContaining('sync-external-store.tsrx:'),
		});

		mounted.unmount();
	});

	it('identifies the deferred follow-up render', async () => {
		const mounted = mount(DeferredLabel);
		await act(() => mounted.click('button'));

		const deferred = renders('DeferredLabel').find(
			(event) => cause(event, 'deferred-value') !== undefined,
		);
		expect(deferred).toBeDefined();
		expect(cause(deferred, 'deferred-value')).toMatchObject({ hook: 'useDeferredValue' });
		expect(profiler.counters()['flush.deferred']).toBeGreaterThan(0);

		mounted.unmount();
	});

	it('identifies context-driven consumer updates', () => {
		const mounted = mount(ContextApp, { value: 1 });
		profiler.clear();

		mounted.update(ContextApp, { value: 2 });

		expect(cause(render('Consumer', 'update'), 'context')).toBeDefined();

		mounted.unmount();
	});

	it('does not report a rebased state update that never renders', async () => {
		let resolveGate: () => void;
		const gate = new Promise<void>((resolve) => {
			resolveGate = resolve;
		});
		const mounted = mount(TransitionRebaseApp, { gate });
		mounted.click('#stage');
		mounted.click('#urgent');
		expect(mounted.find('#urgent').textContent).toBe('0');
		profiler.clear();

		await act(() => resolveGate());

		const causes = profiler.getEvents().flatMap((event) => event.causes);
		expect(mounted.find('#urgent').textContent).toBe('0');
		expect(causes.some((entry) => entry.type === 'state')).toBe(false);
		expect(causes.some((entry) => entry.type === 'transition-pending')).toBe(true);

		mounted.unmount();
	});

	it('reports a transition state cause when the settled value changes', async () => {
		let resolveGate!: () => void;
		const gate = new Promise<void>((resolve) => {
			resolveGate = resolve;
		});
		const mounted = mount(TransitionRebaseApp, { gate });
		mounted.click('#stage');
		expect(mounted.find('#urgent').textContent).toBe('1');
		profiler.clear();

		await act(() => resolveGate());

		expect(mounted.find('#urgent').textContent).toBe('0');
		const causes = profiler.getEvents().flatMap((event) => event.causes);
		expect(causes.some((entry) => entry.type === 'state')).toBe(true);
		mounted.unmount();
	});

	it('preserves a child state cause when its parent updates in the same event', async () => {
		const mounted = mount(ParentAndChildUpdateApp);
		profiler.clear();

		await act(() => mounted.click('button'));

		const bailout = profiler.why('MemoChild').find((event) => event.type === 'component-bailout');
		expect(bailout).toBeDefined();
		expect(cause(bailout, 'state')).toBeUndefined();
		expect(cause(bailout, 'memo-bailout')).toBeDefined();
		expect(cause(render('MemoChild', 'update'), 'state')).toMatchObject({ hook: 'useState' });

		mounted.unmount();
	});
});

describe('profile build component boundaries', () => {
	it('recognizes components rendered directly and as values', () => {
		const direct = mount(DirectReturnApp);
		expect(
			profiler
				.summary()
				.map((entry) => entry.component)
				.sort(),
		).toEqual(['DirectChild', 'DirectReturnApp']);
		direct.unmount();

		profiler.clear();
		const value = mount(ComponentValueApp);
		const children = renders('ValueChild');
		expect(children).toHaveLength(2);
		expect(new Set(children.map((event) => event.instanceId)).size).toBe(2);
		value.unmount();
	});

	it('does not report a dynamic native tag as a component', () => {
		const mounted = mount(NativeElementApp, { tag: 'section' });

		expect(profiler.summary().map((entry) => entry.component)).toEqual(['NativeElementApp']);

		mounted.unmount();
	});

	it('tracks component portals while leaving inline portal content inline', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const componentPortal = mount(ComponentPortalApp, { target });
		await act(() => componentPortal.click('button'));

		const portalEvents = renders('PortalBody');
		expect(portalEvents.map((event) => event.phase)).toEqual(['mount', 'update']);
		expect(new Set(portalEvents.map((event) => event.instanceId)).size).toBe(1);
		componentPortal.unmount();

		profiler.clear();
		const inlinePortal = mount(InlinePortalApp, { target });
		expect(profiler.summary().map((entry) => entry.component)).toEqual(['InlinePortalApp']);
		inlinePortal.unmount();
		target.remove();
	});

	it('tracks a keyed portal element as one component instance per key', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const view = mount(KeyedPortalApp, { target, id: 'a' });
		view.update(KeyedPortalApp, { target, id: 'a' });
		view.update(KeyedPortalApp, { target, id: 'b' });

		const portalEvents = renders('PortalBody');
		expect(portalEvents.map((event) => event.phase)).toEqual(['mount', 'update', 'mount']);
		expect(new Set(portalEvents.map((event) => event.instanceId)).size).toBe(2);
		view.unmount();
		target.remove();
	});
});

describe('profile build engine counters', () => {
	it('records every engine counter for the DOM renderer', () => {
		const snapshot = profiler.snapshot();

		expect(snapshot.renderers).toContain('dom');
		expect(Object.keys(snapshot.counters).sort()).toEqual(
			[
				'arm.keep',
				'arm.swap',
				'block.create',
				'block.unmount',
				'boundary.catch',
				'boundary.fallback',
				'commit.root',
				'component.bailout',
				'component.render',
				'component.renderErrored',
				'component.renderSuspended',
				'rollback.capture',
				'component.renderPhaseReplay',
				'block.lite.mount',
				'block.lite.fallback',
				'block.deopt',
				'block.cacheHit',
				'arm.swapOffscreen',
				'for.skip',
				'for.empty.mount',
				'for.empty.unmount',
				'list.reconcile',
				'list.insert',
				'list.remove',
				'list.update',
				'list.move',
				'list.lis',
				'boundary.suspend',
				'boundary.hold',
				'boundary.reveal',
				'boundary.retry',
				'boundary.reset',
				'activity.hide',
				'activity.show',
				'viewTransition.flush',
				'rollback.journal',
				'rollback.transitionDiscarded',
				'rollback.renderInvalidated',
				'rollback.hydration',
				'row.park',
				'flush.sync',
				'flush.transition',
				'flush.deferred',
				'commit.effects',
				'task.post',
				'suspend.throw',
				'use.stratum',
				'cascade.layout',
				'cascade.layoutDepth',
				'effect.run.insertion',
				'effect.run.layout',
				'effect.run.passive',
				'effect.cleanup.insertion',
				'effect.cleanup.layout',
				'effect.cleanup.passive',
				'ref.attach',
				'ref.detach',

				'rollback.journalEntries',
				'rollback.root',
				'scheduler.drain',
			].sort(),
		);
	});

	it('distinguishes a kept arm from a replaced one', async () => {
		const mounted = mount(ArmApp);

		const kept = await measure(() => act(() => mounted.click('#bump')));
		expect(kept).toMatchObject({ 'arm.keep': 1, 'arm.swap': 0, 'commit.root': 1 });

		const swapped = await measure(() => act(() => mounted.click('#toggle')));
		expect(mounted.container.textContent).toContain('second arm');
		expect(swapped).toMatchObject({ 'arm.keep': 0, 'arm.swap': 1, 'commit.root': 1 });
		expect(swapped['block.create']).toBeGreaterThan(0);

		// The first arm is hookless and was mounted with the root, so it was not a
		// Block. The arm the swap mounted is one, and swapping back tears it down.
		const restored = await measure(() => act(() => mounted.click('#toggle')));
		expect(mounted.container.textContent).toContain('first arm');
		expect(restored).toMatchObject({ 'arm.keep': 0, 'arm.swap': 1, 'commit.root': 1 });
		expect(restored['block.unmount']).toBeGreaterThan(0);

		mounted.unmount();
	});

	it('mounts a hooked @switch case past case 31 as a Block', async () => {
		const mountOn = (which: number) =>
			measure(() => mount(WideSwitch, { which, log() {} }).unmount());
		// Case 0 is hookless, so case 32 mounts exactly one more Block.
		const hookless = await mountOn(0);
		const hooked = await mountOn(32);
		expect(hooked['block.create']).toBe(hookless['block.create']! + 1);
	});

	it('counts a skipped memo body as a bailout, not a render', async () => {
		const mounted = mount(CounterApp);

		const update = await measure(() => act(() => mounted.click('button')));

		// CounterApp and CounterLeaf render; the memoized StaticBadge bails out.
		expect(update).toMatchObject({
			'component.render': 2,
			'component.bailout': 1,
			'rollback.root': 0,
		});
		expect(update['scheduler.drain']).toBeGreaterThan(0);
		expect(update['flush.sync']).toBeGreaterThan(0);
		mounted.unmount();
	});

	it('counts a Suspense fallback and an error catch at their boundaries', async () => {
		let suspended!: ReturnType<typeof mount>;
		const pending = await measure(() => {
			suspended = mount(SuspenseApp, { promise: new Promise<string>(() => {}) });
		});
		expect(suspended.container.textContent).toBe('pending');
		expect(pending).toMatchObject({
			'boundary.fallback': 1,
			'boundary.catch': 0,
			'component.renderSuspended': 1,
			'commit.root': 1,
			'rollback.root': 0,
		});
		suspended.unmount();

		let failed!: ReturnType<typeof mount>;
		const caught = await measure(() => {
			failed = mount(ErrorBoundaryApp, { value: new Error('boom') });
		});
		expect(failed.container.textContent).toBe('caught');
		expect(caught).toMatchObject({
			'boundary.catch': 1,
			'boundary.fallback': 0,
			'component.renderErrored': 1,
		});
		failed.unmount();
	});

	it('counts a root render discarded by suspension outside any boundary', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		let mounted!: ReturnType<typeof mount>;

		const held = await measure(() => {
			mounted = mount(UnboundedReader, { promise });
		});
		expect(mounted.container.textContent).toBe('');
		expect(held).toMatchObject({
			'rollback.root': 1,
			'commit.root': 0,
			'component.renderSuspended': 1,
		});
		expect(profiler.getCommits().commits).toEqual([]);
		expect(held['rollback.capture']).toBeGreaterThan(0);
		expect(held['rollback.journalEntries']).toBeGreaterThan(0);
		expect(held['rollback.journal']).toBeGreaterThan(0);

		const retried = await measure(() =>
			act(async () => {
				resolve('ready');
				await promise;
			}),
		);
		expect(mounted.container.textContent).toBe('ready');
		expect(retried).toMatchObject({ 'rollback.root': 0, 'commit.root': 1 });
		expect(profiler.getCommits().commits[0].attemptId).toBeGreaterThan(1);

		mounted.unmount();
	});
});

function EffectCounter(props: {
	label: string;
	log: string[];
	cascade?: boolean;
	capture?: (update: (value: number) => void) => void;
}) @{
	const [value, setValue] = useState(0);
	useInsertionEffect(() => {
		props.log.push('insertion:' + props.label);
		return () => {
			props.log.push('insertion cleanup:' + props.label);
		};
	}, [props.label]);
	useLayoutEffect(() => {
		props.log.push('layout:' + props.label);
		props.capture?.(setValue);
		if (props.cascade && value === 0) setValue(1);
		return () => {
			props.log.push('layout cleanup:' + props.label);
		};
	}, [props.label, props.cascade, value]);
	useEffect(() => {
		props.log.push('passive:' + props.label);
		return () => {
			props.log.push('passive cleanup:' + props.label);
		};
	}, [props.label]);
	<button onClick={() => setValue(value + 1)}>{props.label + ':' + value}</button>
}

function ProfileList(props: { items: number[] }) @{
	<ul>
		@for (const item of props.items; key item) {
			<li>{String(item)}</li>
		} @empty {
			<li>empty</li>
		}
	</ul>
}

function ProfileActivity(props: { mode: 'visible' | 'hidden'; log: string[] }) @{
	<Activity mode={props.mode}>
		<EffectCounter label="activity" log={props.log} />
	</Activity>
}

describe('profile commit and work attribution', () => {
	it('keeps synchronous mounts and delayed effects on their own root commits', async () => {
		const log: string[] = [];
		const first = mount(EffectCounter, { label: 'first', log });
		const second = mount(EffectCounter, { label: 'second', log });
		const before = profiler.getCommits().commits;
		expect(before).toHaveLength(2);
		expect(new Set(before.map((commit) => commit.id)).size).toBe(2);
		expect(new Set(before.map((commit) => commit.rootId)).size).toBe(2);
		await nextPaint();
		const after = profiler.getCommits().commits;
		expect(after.map((commit) => commit.id)).toEqual(before.map((commit) => commit.id));
		for (const commit of after) {
			expect(commit.counters).toMatchObject({
				'commit.root': 1,
				'effect.run.insertion': 1,
				'effect.run.layout': 1,
				'effect.run.passive': 1,
			});
		}
		expect(log).toContain('passive:first');
		expect(log).toContain('passive:second');
		expect(profiler.counters()['commit.effects']).toBeGreaterThan(0);
		first.unmount();
		second.unmount();
	});

	it('separates roots sharing a drain and keeps layout cascades as distinct acceptances', async () => {
		const log: string[] = [];
		const updates: Array<(value: number) => void> = [];
		const capture = (update: (value: number) => void) => updates.push(update);
		const first = mount(EffectCounter, { label: 'first', log, capture });
		const second = mount(EffectCounter, { label: 'second', log, capture });
		await nextPaint();
		profiler.clear();
		await act(() => {
			updates[0](1);
			updates[1](1);
		});
		const commits = profiler.getCommits().commits;
		expect(commits).toHaveLength(2);
		expect(commits[0].drainId).toBe(commits[1].drainId);
		expect(commits[0].id).not.toBe(commits[1].id);
		expect(commits[0].attemptId).not.toBe(commits[1].attemptId);
		expect(first.container.textContent).toBe('first:1');
		expect(second.container.textContent).toBe('second:1');
		first.unmount();
		second.unmount();
		profiler.clear();
		const cascading = mount(EffectCounter, { label: 'cascade', log, cascade: true });
		expect(cascading.container.textContent).toBe('cascade:1');
		expect(profiler.getCommits().commits.length).toBeGreaterThan(1);
		expect(profiler.counters()['cascade.layout']).toBeGreaterThan(0);
		expect(profiler.counters()['cascade.layoutDepth']).toBeGreaterThan(0);
		cascading.unmount();
	});

	it('bounds commit history without shrinking session totals and returns detached records', () => {
		profiler.start({ bufferSize: 1 });
		const view = mount(CounterApp);
		view.update(CounterApp);
		const history = profiler.getCommits();
		expect(history.commits).toHaveLength(1);
		expect(history.dropped).toBeGreaterThan(0);
		expect(profiler.counters()['commit.root']).toBeGreaterThan(1);
		history.commits[0].counters['commit.root'] = 900;
		expect(profiler.getCommits().commits[0].counters['commit.root']).toBe(1);
		profiler.clear();
		expect(profiler.getCommits()).toEqual({ commits: [], dropped: 0 });
		view.unmount();
	});

	it('reports list work and per-component counters alongside the visible result', () => {
		const view = mount(ProfileList, { items: [1, 2, 3, 4, 5] });
		view.update(ProfileList, { items: [5, 3, 1, 6, 4] });
		expect(view.container.textContent).toBe('53164');
		for (const name of [
			'list.insert',
			'list.remove',
			'list.update',
			'list.move',
			'list.lis',
			'list.reconcile',
		] as const)
			expect(profiler.counters()[name]).toBeGreaterThan(0);
		view.update(ProfileList, { items: [] });
		expect(view.container.textContent).toBe('empty');
		view.update(ProfileList, { items: [7] });
		expect(view.container.textContent).toBe('7');
		expect(profiler.counters()['for.empty.mount']).toBeGreaterThan(0);
		expect(profiler.counters()['for.empty.unmount']).toBeGreaterThan(0);
		expect(profiler.counters()['row.park']).toBeGreaterThan(0);
		expect(
			profiler.summary().find((entry) => entry.component === 'ProfileList')?.counters[
				'list.insert'
			],
		).toBeGreaterThan(0);
		view.unmount();
	});

	it('counts effect teardown on Activity hide and unmount', async () => {
		const log: string[] = [];
		const view = mount(ProfileActivity, { mode: 'visible', log });
		await nextPaint();
		view.update(ProfileActivity, { mode: 'hidden', log });
		await nextPaint();
		expect(log).toContain('layout cleanup:activity');
		expect(profiler.counters()['activity.hide']).toBeGreaterThan(0);
		view.update(ProfileActivity, { mode: 'visible', log });
		await nextPaint();
		expect(profiler.counters()['activity.show']).toBeGreaterThan(0);
		view.unmount();
		await nextPaint();
		for (const phase of ['insertion', 'layout', 'passive'] as const)
			expect(profiler.counters()[`effect.cleanup.${phase}`]).toBeGreaterThan(0);
	});
});

function ReplayCounter() @{
	const [value, setValue] = useState(0);
	if (value === 0) setValue(1);
	<span>{String(value)}</span>
}

function RefCounter(props: { ref: (node: HTMLElement | null) => void }) @{
	<div ref={props.ref}>ref</div>
}

function BatchedReader(props: { first: Promise<string>; second: Promise<string> }) @{
	const first = use(props.first);
	const second = use(props.second);
	<strong>{first + second}</strong>
}

function BatchedBoundary(props: { first: Promise<string>; second: Promise<string> }) @{
	<Suspense fallback={<em>waiting</em>}>
		<BatchedReader first={props.first} second={props.second} />
	</Suspense>
}

describe('profile work lifecycle', () => {
	it('counts real ref writes and render-phase replays', () => {
		const nodes: Array<HTMLElement | null> = [];
		const view = mount(RefCounter, { ref: (node) => nodes.push(node) });
		expect(nodes[0]?.textContent).toBe('ref');
		expect(profiler.counters()['ref.attach']).toBeGreaterThan(0);
		view.unmount();
		expect(nodes.at(-1)).toBeNull();
		expect(profiler.counters()['ref.detach']).toBeGreaterThan(0);
		const replay = mount(ReplayCounter);
		expect(replay.container.textContent).toBe('1');
		expect(profiler.counters()['component.renderPhaseReplay']).toBeGreaterThan(0);
		replay.unmount();
	});

	it('counts strata, suspension, retry and reveal without accepting discarded attempts', async () => {
		let first!: (value: string) => void;
		let second!: (value: string) => void;
		const a = new Promise<string>((resolve) => (first = resolve));
		const b = new Promise<string>((resolve) => (second = resolve));
		const view = mount(BatchedBoundary, { first: a, second: b });
		expect(view.container.textContent).toBe('waiting');
		expect(profiler.counters()['use.stratum']).toBeGreaterThan(0);
		expect(profiler.counters()['suspend.throw']).toBeGreaterThan(0);
		expect(profiler.counters()['boundary.suspend']).toBeGreaterThan(0);
		await act(async () => {
			first('a');
			second('b');
			await Promise.all([a, b]);
		});
		expect(view.container.textContent).toBe('ab');
		expect(profiler.counters()['boundary.retry']).toBeGreaterThan(0);
		expect(profiler.counters()['boundary.reveal']).toBeGreaterThan(0);
		view.unmount();
	});

	it('counts offscreen arm replacements and held transitions', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const view = mount(SwitchSwap, { promise });
		await act(() => view.click('#go'));
		expect(view.find('#content').textContent).toBe('A');
		expect(profiler.counters()['arm.swapOffscreen']).toBeGreaterThan(0);
		expect(profiler.counters()['boundary.hold']).toBeGreaterThan(0);
		expect(profiler.counters()['rollback.renderInvalidated']).toBeGreaterThan(0);
		expect(profiler.counters()['flush.transition']).toBeGreaterThan(0);
		expect(profiler.counters()['task.post']).toBeGreaterThan(0);
		await act(async () => {
			resolve('ready');
			await promise;
		});
		expect(view.find('#content').textContent).toBe('B-ready');
		view.unmount();
	});

	it('retains component counters when detailed events are evicted', () => {
		profiler.start({ bufferSize: 2 });
		const first = mount(RefCounter, { ref() {} });
		const second = mount(ReplayCounter);
		second.update(ReplayCounter);
		const summary = profiler.summary().find((entry) => entry.component === 'RefCounter');
		expect(summary?.counters['component.render']).toBeGreaterThan(0);
		expect(summary?.truncated).toBe(true);
		first.unmount();
		second.unmount();
	});

	it('ignores old queued attribution after clear or stop and preserves session totals on stop', async () => {
		const log: string[] = [];
		const view = mount(EffectCounter, { label: 'first', log });
		profiler.stop();
		const stopped = profiler.counters();
		await nextPaint();
		expect(log).toContain('passive:first');
		expect(profiler.counters()).toEqual(stopped);
		profiler.clear();
		profiler.start({ timeline: false });
		view.update(EffectCounter, { label: 'second', log });
		await nextPaint();
		const commits = profiler.getCommits().commits;
		expect(commits).toHaveLength(1);
		expect(commits[0].counters['effect.run.passive']).toBe(1);
		expect(log).toContain('passive:second');
		view.unmount();
	});
});

describe('profile boundary and fallback probes', () => {
	it('records an error reset and descriptor reconciliation', async () => {
		const view = mount(RenderBoundary, { bang: true });
		view.update(RenderBoundary, { bang: false });
		await act(() => view.click('button'));
		expect(view.container.textContent).toBe('rendered');
		expect(profiler.counters()['boundary.reset']).toBeGreaterThan(0);
		view.unmount();
		const deopt = mount(DeoptList, { items: [{ id: 1, label: 'first' }] });
		deopt.update(DeoptList, { items: [{ id: 1, label: 'second' }] });
		expect(deopt.container.textContent).toBe('second');
		expect(profiler.counters()['block.deopt']).toBeGreaterThan(0);
		deopt.unmount();
	});

	it('records a View Transition flush while publishing the new screen', async () => {
		const vt = installViewTransitionMocks();
		const view = mount(TypedUpdateApp, { text: 'before' });
		try {
			await act(() =>
				startTransition(() => view.root.render(TypedUpdateApp, { text: 'after longer' })),
			);
			expect(view.container.textContent).toBe('after longer');
			expect(vt.calls.length).toBeGreaterThan(0);
			expect(profiler.counters()['viewTransition.flush']).toBeGreaterThan(0);
		} finally {
			view.unmount();
			vt.restore();
		}
	});

	it('records discarding a root transition without accepting the suspended attempt', async () => {
		const ready = Object.assign(Promise.resolve('ready'), { status: 'fulfilled', value: 'ready' });
		const view = mount(UnboundedTransition, { first: ready, next: new Promise<string>(() => {}) });
		await act(() => view.click('button'));
		expect(view.find('p').textContent).toBe('ready');
		const accepted = profiler.getCommits().commits.length;
		view.unmount();
		expect(profiler.counters()['rollback.transitionDiscarded']).toBeGreaterThan(0);
		expect(profiler.getCommits().commits).toHaveLength(accepted);
	});

	it('records a suspended hydration rollback and retains the server nodes', async () => {
		const { loadServerFixture } = await import('./_server-fixture');
		const server = loadServerFixture(
			'packages/octane/tests/hydration/_fixtures/suspended-arm-value-mismatch.tsrx',
		);
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server.TextArm, { label: 'same' }).html;
		const span = container.querySelector('span');
		let resolve!: () => void;
		hydrationGate.promise = new Promise<void>((done) => (resolve = done));
		const root = hydrateRoot(container, TextArm, { label: 'same' });
		try {
			await act(() => {});
			expect(container.querySelector('span')).toBe(span);
			expect(profiler.counters()['rollback.hydration']).toBeGreaterThan(0);
			await act(() => {
				hydrationGate.promise = undefined;
				resolve();
			});
			expect(container.textContent).toBe('sameok');
			expect(container.querySelector('span')).toBe(span);
		} finally {
			hydrationGate.promise = undefined;
			root.unmount();
			container.remove();
		}
	});
});

function UnboundedTransition(props: { first: Promise<string>; next: Promise<string> }) @{
	const [resource, setResource] = useState(props.first);
	<div>
		<button onClick={() => startTransition(() => setResource(props.next))}>next</button>
		<UnboundedReader promise={resource} />
	</div>
}

const ProfileContext = createContext(0);
function ProfileSharedBody() @{
	<div>
		<CounterLeaf count={0} />
		<ProfileContext value={1}>
			<CounterLeaf count={1} />
		</ProfileContext>
	</div>
}
it('counts lite component mounts and the identity-aware fallback in a shared children body', () => {
	const view = mount(ProfileSharedBody);
	expect(view.container.textContent).toBe('01');
	expect(profiler.counters()['block.lite.mount']).toBeGreaterThan(0);
	expect(profiler.counters()['block.lite.fallback']).toBeGreaterThan(0);
	view.unmount();
});

function HeldEffects(props: { first: Promise<string>; next: Promise<string>; log: string[] }) @{
	const [resource, setResource] = useState(props.first);
	<div>
		<button onClick={() => startTransition(() => setResource(props.next))}>next</button>
		@try {
			<>
				<EffectCounter label={resource === props.first ? 'first' : 'next'} log={props.log} />
				<UnboundedReader promise={resource} />
			</>
		} @pending {
			<i>pending</i>
		}
	</div>
}
it('attributes retained offscreen effects to their publishing commit', async () => {
	const log: string[] = [];
	const first = Object.assign(Promise.resolve('first'), { status: 'fulfilled', value: 'first' });
	let resolve!: (value: string) => void;
	const next = new Promise<string>((done) => (resolve = done));
	const view = mount(HeldEffects, { first, next, log });
	await nextPaint();
	await act(() => view.click('button'));
	expect(view.find('p').textContent).toBe('first');
	expect(log).not.toContain('passive:next');
	const before = profiler.getCommits().commits;
	await act(async () => {
		resolve('next');
		await next;
	});
	expect(view.find('p').textContent).toBe('next');
	expect(log).toContain('passive:next');
	const commits = profiler.getCommits().commits;
	const publishing = commits.filter((commit) => !before.some((old) => old.id === commit.id));
	expect(publishing.some((commit) => commit.counters['effect.run.passive']! > 0)).toBe(true);
	expect(commits.reduce((total, commit) => total + commit.counters['effect.run.passive']!, 0)).toBe(
		log.filter((entry) => entry.startsWith('passive:')).length,
	);
	view.unmount();
});

function ProfileForDeps(props: { items: string[]; suffix: string }) @{
	const suffix = props.suffix;
	<ol>
		@for (const row of props.items; key row) {
			<li>{(row + suffix) as string}</li>
		} @empty {
			<i>empty</i>
		}
	</ol>
}
it('counts a list dependency-cache hit while updating its items', () => {
	const view = mount(ProfileForDeps, { items: ['a'], suffix: '!' });
	view.update(ProfileForDeps, { items: ['a', 'b'], suffix: '!' });
	expect(view.container.textContent).toBe('a!b!');
	expect(profiler.counters()['for.skip']).toBeGreaterThan(0);
	view.unmount();
});

function TransitionActivity(props: { mode: 'visible' | 'hidden'; log: string[] }) @{
	<ViewTransition>
		<ProfileActivity mode={props.mode} log={props.log} />
	</ViewTransition>
}
it('keeps staged Activity cleanups on the commit that hid the subtree', async () => {
	const vt = installViewTransitionMocks();
	const log: string[] = [];
	const view = mount(TransitionActivity, { mode: 'visible', log });
	try {
		await nextPaint();
		profiler.clear();
		await act(() =>
			startTransition(() => view.root.render(TransitionActivity, { mode: 'hidden', log })),
		);
		expect(log).toContain('layout cleanup:activity');
		expect(
			profiler.getCommits().commits.some((commit) => commit.counters['effect.cleanup.layout']! > 0),
		).toBe(true);
	} finally {
		view.unmount();
		vt.restore();
	}
});
