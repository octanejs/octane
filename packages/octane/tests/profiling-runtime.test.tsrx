import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	createPortal,
	memo,
	Suspense,
	use,
	useDeferredValue,
	useState,
	useTransition,
} from 'octane';
import { profiler } from 'octane/profiling';
import { act, mount, nextPaint } from './_helpers';
import { App as ContextApp } from './_fixtures/context-bailout.tsrx';
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
	profiler.start({ timeline: false });
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
		expect(held['rollback.capture']).toBeGreaterThan(0);
		expect(held['rollback.journalEntries']).toBeGreaterThan(0);

		const retried = await measure(() =>
			act(async () => {
				resolve('ready');
				await promise;
			}),
		);
		expect(mounted.container.textContent).toBe('ready');
		expect(retried).toMatchObject({ 'rollback.root': 0, 'commit.root': 1 });

		mounted.unmount();
	});
});
