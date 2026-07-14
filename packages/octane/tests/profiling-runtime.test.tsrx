import { afterEach, describe, expect, it } from 'vitest';
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
import { makeStore, Reader } from './_fixtures/sync-external-store.tsrx';
import { App as ProfileContextApp } from './_fixtures/context-bailout.tsrx';

const PROFILE_BUILD = process.env.OCTANE_TEST_COMPILE_MODE === 'profile';

function LiteLeaf(props) @{
	<span class="leaf">
		{props.count as string}
	</span>
}

function MemoLeafImpl() @{
	<i>{'stable'}</i>
}
const MemoLeaf = memo(MemoLeafImpl);

function ProfileHost() @{
	const [count, setCount] = useState(0);
	<div>
		<button onClick={() => setCount(count + 1)}>{'update'}</button>
		<LiteLeaf count={count} />
		<MemoLeaf />
	</div>
}

function ProfileSlow(props) @{
	const value = use(props.promise);
	<strong>
		{value as string}
	</strong>
}

function ProfileSuspenseHost(props) @{
	<Suspense fallback={<em>pending</em>}>
		<ProfileSlow promise={props.promise} />
	</Suspense>
}

function ProfileThrownPromise(props) {
	throw props.promise;
}

function ProfileThrownPromiseHost(props) @{
	<>
		@try {
			<ProfileThrownPromise promise={props.promise} />
		} @catch (error) {
			<em>caught</em>
		}
	</>
}

function useProfileCounter() {
	return useState(0);
}

function ProfileCustomHookHost() @{
	const [count, setCount] = useProfileCounter();
	<button onClick={() => setCount(count + 1)}>
		{count as string}
	</button>
}

function ProfileDeferredHost() @{
	const [value, setValue] = useState('before');
	const deferred = useDeferredValue(value);
	<button onClick={() => setValue('after')}>{deferred}</button>
}

function ProfileTransitionRebaseHost(props) @{
	const [value, setValue] = useState(1);
	const [isPending, start] = useTransition();
	<>
		<button
			id="profile-stage"
			onClick={() => start(async () => {
				setValue(0);
				await props.gate;
			})}
		>
			{isPending ? 'pending' : 'stage'}
		</button>
		<button id="profile-urgent" onClick={() => setValue(0)}>
			{value as string}
		</button>
	</>
}

let scheduleProfileMemoChild = () => {};

function ProfileMemoChildImpl() @{
	const [count, setCount] = useState(0);
	scheduleProfileMemoChild = () => setCount(count + 1);
	<span>
		{count as string}
	</span>
}
const ProfileMemoChild = memo(ProfileMemoChildImpl);

function ProfileMemoCascadeHost() @{
	const [count, setCount] = useState(0);
	<>
		<button
			onClick={() => {
				setCount(count + 1);
				scheduleProfileMemoChild();
			}}
		>
			{count as string}
		</button>
		<ProfileMemoChild />
	</>
}

function ProfileReturnChild() @{
	<span>child</span>
}

function ProfileReturnHost(props) {
	if (!props.show) return null;
	return <div>
		<ProfileReturnChild />
	</div>;
}

function ProfileDirectReturnChild() @{
	<strong>direct child</strong>
}

function ProfileDirectReturnHost() {
	return <ProfileDirectReturnChild />;
}

function ProfileValueChild() @{
	<b>value child</b>
}

function ProfileValueHost() @{
	<>
		{ProfileValueChild}
		<ProfileValueChild />
	</>
}

function ProfileDynamicHost(props) @{
	const Tag = props.tag;
	<Tag>dynamic</Tag>
}

function ProfilePortalBody(props) @{
	<span>{props.label}</span>
}

function ProfilePortalHost(props) @{
	const [label, setLabel] = useState('first');
	<div>
		<button onClick={() => setLabel('second')}>{'update portal'}</button>
		{createPortal(ProfilePortalBody, props.target, { label })}
	</div>
}

function ProfileInlinePortalHost(props) @{
	<div>{createPortal(<span>inline portal</span>, props.target)}</div>
}

afterEach(() => {
	profiler.clear();
	profiler.start({ timeline: false });
});

describe('profile-specialized runtime', () => {
	it(
		'records full and lite component spans, causes, stable instances, and memo bails',
		async () => {
			profiler.clear();
			profiler.start({ timeline: false });
			const mounted = mount(ProfileHost);
			await act(() => mounted.click('button'));

			const events = profiler.getEvents();
			if (!PROFILE_BUILD) {
				expect(events).toEqual([]);
				mounted.unmount();
				return;
			}

			const host = events.filter(
				(event) => event.type === 'component-render' && event.component === 'ProfileHost',
			);
			expect(host).toHaveLength(2);
			expect(host.map((event) => event.phase)).toEqual(['mount', 'update']);
			expect(new Set(host.map((event) => event.instanceId)).size).toBe(1);
			expect(host[1].causes).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: 'state', hook: 'useState' }),
				]),
			);

			const lite = events.filter(
				(event) => event.type === 'component-render' && event.component === 'LiteLeaf',
			);
			expect(lite).toHaveLength(2);
			expect(new Set(lite.map((event) => event.instanceId)).size).toBe(1);
			expect(lite[1].causes).toContainEqual({ type: 'parent' });
			for (const event of events) {
				expect(event.selfDuration).toBeGreaterThanOrEqual(0);
				expect(event.selfDuration).toBeLessThanOrEqual(event.duration);
			}

			expect(
				events.some(
					(event) =>
						event.type === 'component-bailout' && event.component === 'MemoLeaf' &&
							event.causes.some((cause) => cause.type === 'memo-bailout'),
				),
			).toBe(true);
			expect(globalThis.__OCTANE_PROFILER__).toBe(profiler);
			mounted.unmount();
		},
	);

	it('classifies a real use() suspension as suspended rather than errored', () => {
		profiler.clear();
		profiler.start({ timeline: false });
		const promise = new Promise<string>(() => {});
		const mounted = mount(ProfileSuspenseHost, { promise });

		if (!PROFILE_BUILD) {
			expect(profiler.getEvents()).toEqual([]);
			mounted.unmount();
			return;
		}

		const attempts = profiler.getEvents().filter(
			(event) => event.type === 'component-render' && event.component === 'ProfileSlow',
		);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({ outcome: 'suspended', phase: 'mount' });
		mounted.unmount();
	});

	it('classifies a directly thrown Promise as an error, not a suspension', () => {
		profiler.clear();
		profiler.start({ timeline: false });
		const mounted = mount(ProfileThrownPromiseHost, { promise: Promise.resolve('value') });

		if (!PROFILE_BUILD) {
			expect(profiler.getEvents()).toEqual([]);
			mounted.unmount();
			return;
		}

		const attempt = profiler.getEvents().find(
			(event) => event.component === 'ProfileThrownPromise',
		);
		expect(attempt).toMatchObject({ outcome: 'errored', phase: 'mount' });
		mounted.unmount();
	});

	it('preserves base hook metadata through a custom-hook slot path', async () => {
		profiler.clear();
		profiler.start({ timeline: false });
		const mounted = mount(ProfileCustomHookHost);
		await act(() => mounted.click('button'));

		if (!PROFILE_BUILD) {
			expect(profiler.getEvents()).toEqual([]);
			mounted.unmount();
			return;
		}

		const update = profiler.getEvents().find(
			(event) =>
				event.type === 'component-render' && event.component === 'ProfileCustomHookHost' &&
					event.phase === 'update',
		);
		expect(update?.causes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'state',
					hook: 'useState',
					source: expect.stringContaining('profiling-runtime.test.tsrx:'),
				}),
			]),
		);
		mounted.unmount();
	});

	it('attributes external-store and deferred hook schedules', async () => {
		profiler.clear();
		profiler.start({ timeline: false });
		const store = makeStore(0);
		const reader = mount(Reader, { store });
		await nextPaint();
		profiler.clear();
		store.set(1);
		await nextPaint();

		if (!PROFILE_BUILD) {
			expect(profiler.getEvents()).toEqual([]);
			reader.unmount();
			return;
		}

		const readerUpdate = profiler.getEvents().find(
			(event) => event.type === 'component-render' && event.component === 'Reader' &&
				event.phase === 'update',
		);
		expect(readerUpdate?.causes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'external-store',
					hook: 'useSyncExternalStore',
					source: expect.stringContaining('sync-external-store.tsrx:'),
				}),
			]),
		);
		reader.unmount();

		profiler.clear();
		const deferred = mount(ProfileDeferredHost);
		await act(() => deferred.click('button'));
		const deferredUpdate = profiler.getEvents().find(
			(event) => event.causes.some((cause) => cause.type === 'deferred-value'),
		);
		expect(deferredUpdate?.causes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'deferred-value',
					hook: 'useDeferredValue',
				}),
			]),
		);
		deferred.unmount();
	});

	it(
		'attributes context refreshes and only records transition state after a real commit',
		async () => {
			profiler.clear();
			profiler.start({ timeline: false });
			const context = mount(ProfileContextApp, { value: 1 });
			profiler.clear();
			context.update(ProfileContextApp, { value: 2 });

			if (!PROFILE_BUILD) {
				expect(profiler.getEvents()).toEqual([]);
				context.unmount();
				return;
			}

			const consumer = profiler.getEvents().find(
				(event) => event.component === 'Consumer' && event.phase === 'update',
			);
			expect(consumer?.causes).toContainEqual({ type: 'context' });
			context.unmount();

			let resolveGate: () => void;
			const gate = new Promise<void>((resolve) => {
				resolveGate = resolve;
			});
			profiler.clear();
			const transition = mount(ProfileTransitionRebaseHost, { gate });
			transition.click('#profile-stage');
			transition.click('#profile-urgent');
			profiler.clear();
			await act(() => resolveGate());
			const causes = profiler.getEvents().flatMap((event) => event.causes);
			expect(causes.some((cause) => cause.type === 'state')).toBe(false);
			expect(causes.some((cause) => cause.type === 'transition-pending')).toBe(true);
			transition.unmount();
		},
	);

	it('does not consume a memo child state cause during an ancestor-first bailout', async () => {
		profiler.clear();
		profiler.start({ timeline: false });
		const mounted = mount(ProfileMemoCascadeHost);
		profiler.clear();
		await act(() => mounted.click('button'));

		if (!PROFILE_BUILD) {
			expect(profiler.getEvents()).toEqual([]);
			mounted.unmount();
			return;
		}

		const events = profiler.why('ProfileMemoChild');
		const bail = events.find((event) => event.type === 'component-bailout');
		const update = events.find(
			(event) => event.type === 'component-render' && event.phase === 'update',
		);
		expect(bail?.causes).toEqual(
			expect.arrayContaining([{ type: 'memo-bailout' }, { type: 'parent' }]),
		);
		expect(bail?.causes.some((cause) => cause.type === 'state')).toBe(false);
		expect(update?.causes).toEqual(
			expect.arrayContaining([expect.objectContaining({ type: 'state', hook: 'useState' })]),
		);
		mounted.unmount();
	});

	it('omits internal renderers while retaining every real component boundary', async () => {
		profiler.clear();
		profiler.start({ timeline: false });
		const returned = mount(ProfileReturnHost, { show: true });

		if (!PROFILE_BUILD) {
			expect(profiler.getEvents()).toEqual([]);
			returned.unmount();
			return;
		}

		expect(
			Array.from(new Set(profiler.getEvents().map((event) => event.component))).sort(),
		).toEqual(['ProfileReturnChild', 'ProfileReturnHost']);
		expect(profiler.getEvents().every((event) => event.file !== '<runtime>')).toBe(true);
		returned.unmount();

		profiler.clear();
		const dynamic = mount(ProfileDynamicHost, { tag: 'section' });
		expect(Array.from(new Set(profiler.getEvents().map((event) => event.component)))).toEqual([
			'ProfileDynamicHost',
		]);
		dynamic.unmount();

		profiler.clear();
		const direct = mount(ProfileDirectReturnHost);
		expect(
			Array.from(new Set(profiler.getEvents().map((event) => event.component))).sort(),
		).toEqual(['ProfileDirectReturnChild', 'ProfileDirectReturnHost']);
		direct.unmount();

		profiler.clear();
		const value = mount(ProfileValueHost);
		const valueChildren = profiler.getEvents().filter(
			(event) => event.component === 'ProfileValueChild',
		);
		expect(valueChildren).toHaveLength(2);
		expect(new Set(valueChildren.map((event) => event.instanceId)).size).toBe(2);
		value.unmount();

		profiler.clear();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const portalled = mount(ProfilePortalHost, { target });
		await act(() => portalled.click('button'));
		const portalEvents = profiler.getEvents().filter(
			(event) => event.component === 'ProfilePortalBody',
		);
		expect(portalEvents).toHaveLength(2);
		expect(new Set(portalEvents.map((event) => event.instanceId)).size).toBe(1);
		portalled.unmount();

		profiler.clear();
		const inlinePortal = mount(ProfileInlinePortalHost, { target });
		expect(Array.from(new Set(profiler.getEvents().map((event) => event.component)))).toEqual([
			'ProfileInlinePortalHost',
		]);
		expect(profiler.getEvents().every((event) => event.file !== '<runtime>')).toBe(true);
		inlinePortal.unmount();
		target.remove();
	});
});
