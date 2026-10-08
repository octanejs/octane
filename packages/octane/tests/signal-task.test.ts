import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	act,
	createElement,
	createRoot,
	flushSync,
	useState,
	useTransition,
	useLayoutEffect,
	type Root,
} from '../src/index.js';
import { enableNativeReadCollection } from '../src/runtime.js';
import {
	createResource,
	createScope,
	query,
	derived$,
	runWithSignalOwner,
	type Scope,
	type SignalHandle,
} from '../src/signals/index.js';

// Exercise native invocation collection through its actual renderer ABI, as in
// signals-native-collection.abi.test.ts. No compiler scheduling behavior is mocked.
enableNativeReadCollection();
const roots: Root[] = [];
const scopes: Scope[] = [];
function scope() {
	const owner = createScope({ scopeKey: `signal-task-${scopes.length}` });
	scopes.push(owner);
	return owner;
}
function mount(body: () => ReturnType<typeof createElement>) {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	roots.push(root);
	root.render(body, {});
	return container;
}
function hostTask(): Promise<void> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			channel.port2.close();
			resolve();
		};
		channel.port2.postMessage(null);
	});
}
async function microtasks() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
}
function finished(owner: Scope, value$: SignalHandle<number>): Promise<void> {
	return new Promise((resolve) => {
		let stop = () => {};
		const check = () => {
			if (value$.snapshot().complete) {
				stop();
				resolve();
			}
		};
		runWithSignalOwner(owner, () => {
			stop = value$.subscribe(check);
			check();
		});
	});
}
function buffered(count: number, onPull = () => {}, onClose = () => {}): AsyncIterable<number> {
	return {
		[Symbol.asyncIterator]() {
			let index = 0;
			return {
				next() {
					onPull();
					return Promise.resolve(
						index < count ? { done: false, value: index++ } : { done: true, value: undefined },
					);
				},
				return() {
					onClose();
					return Promise.resolve({ done: true, value: undefined });
				},
			};
		},
	};
}
function producer(
	owner: Scope,
	kind: 'query' | 'derived',
	count: number,
	key: string = kind,
	onPull = () => {},
	onClose = () => {},
) {
	const iterable = buffered(count, onPull, onClose);
	return kind === 'derived'
		? derived$<number>(() => iterable, { key })
		: createResource(owner, key, () => query(key, () => iterable, { kind: 'stream' })(undefined));
}

afterEach(async () => {
	for (const root of roots.splice(0)) root.unmount();
	for (const owner of scopes.splice(0)) owner.dispose();
	await hostTask();
	await act(() => {});
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('signal producer task admission', () => {
	it('keeps the pending cue separate when transitions follow native readers', async () => {
		const count$ = scope().signal$('count', 0);
		const reader = mount(() => createElement('output', null, String(count$.get())));
		count$.set(1);
		await microtasks();
		expect(reader.textContent).toBe('1');

		let begin!: () => void;
		const container = mount(() => {
			const [value, setValue] = useState(0, Symbol.for('signal-task.transition-value'));
			const [pending, start] = useTransition(Symbol.for('signal-task.transition-pending'));
			begin = () => start(() => setValue(1));
			return createElement(
				'output',
				null,
				`${count$.get()}:${value}:${pending ? 'pending' : 'idle'}`,
			);
		});
		begin();
		await microtasks();
		expect(container.textContent).toBe('1:0:pending');
		await act(() => {});
		expect(container.textContent).toBe('1:1:idle');
	});

	it.each(['query', 'derived'] as const)(
		'keeps %s publications synchronous while rendering at a host boundary',
		async (kind) => {
			const owner = scope();
			const value$ = producer(owner, kind, 100);
			const values: number[] = [];
			runWithSignalOwner(owner, () =>
				value$.subscribe(() => {
					const snapshot = value$.snapshot();
					if (snapshot.status === 'ready' && !snapshot.complete) values.push(snapshot.value);
				}),
			);
			const container = mount(() =>
				runWithSignalOwner(owner, () => createElement('output', null, String(value$.latest(-1)))),
			);
			const marker = hostTask();
			const complete = finished(owner, value$);
			await marker;
			// The first derived value can also wake an initially pending read.
			expect(['-1', '0']).toContain(container.textContent);
			await complete;
			await act(() => {});
			expect(values).toEqual(Array.from({ length: 100 }, (_, i) => i));
			expect(container.textContent).toBe('99');
		},
	);

	it('keeps ordinary signal writes in the urgent microtask batch', async () => {
		const count$ = scope().signal$('count', 0);
		const container = mount(() => createElement('output', null, String(count$.get())));
		count$.set(1);
		await microtasks();
		expect(container.textContent).toBe('1');
	});

	it('lets flushSync publish a result waiting for its task', async () => {
		const owner = scope();
		const value$ = producer(owner, 'query', 1);
		const container = mount(() =>
			runWithSignalOwner(owner, () => createElement('output', null, String(value$.latest(-1)))),
		);
		await finished(owner, value$);
		flushSync(() => {});
		expect(container.textContent).toBe('0');
		await act(() => {});
		expect(container.textContent).toBe('0');
	});

	it('lets an imperative hook update upgrade a queued producer render', async () => {
		const owner = scope();
		const value$ = producer(owner, 'query', 1);
		let update!: (value: number) => void;
		const container = mount(() => {
			const [count, setCount] = useState(0, Symbol.for('signal-task.urgent'));
			update = setCount;
			return createElement('output', null, `${value$.latest(-1)}:${count}`);
		});
		await finished(owner, value$);
		update(1);
		await microtasks();
		expect(container.textContent).toBe('0:1');
	});

	it('keeps controlled input writes urgent inside a producer subscriber', async () => {
		const owner = scope();
		const text$ = owner.signal$('text', '');
		const value$ = producer(owner, 'query', 1);
		const container = mount(() =>
			createElement(
				'section',
				null,
				createElement('input', {
					value: text$.get(),
					onInput: (event: Event) => text$.set((event.target as HTMLInputElement).value),
				}),
				createElement('output', null, text$.get()),
			),
		);
		const input = container.querySelector('input')!;
		let check!: () => void;
		const inputChecked = new Promise<void>((resolve) => {
			check = resolve;
		});
		value$.subscribe(() => {
			if (value$.snapshot().status !== 'ready') return;
			input.value = 'typed';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			void microtasks().then(check);
		});
		await inputChecked;
		expect(input.value).toBe('typed');
		expect(container.querySelector('output')!.textContent).toBe('typed');
		text$.set('imperative');
		await microtasks();
		expect(input.value).toBe('imperative');
	});

	it('does not publish a queued producer render after unmount', async () => {
		const owner = scope();
		const value$ = producer(owner, 'query', 1);
		const publications: number[] = [];
		const container = mount(() => {
			const value = value$.latest(-1);
			useLayoutEffect(
				() => {
					publications.push(value);
				},
				null,
				Symbol.for('signal-task.unmount'),
			);
			return createElement('output', null, String(value));
		});
		await finished(owner, value$);
		roots.at(-1)!.unmount();
		await act(() => {});
		expect(container.textContent).toBe('');
		expect(publications).toEqual([-1]);
	});

	it.each(['query', 'derived'] as const)(
		'revalidates a replaced %s after waiting for the host budget',
		async (kind) => {
			let elapsed = 0;
			let oldPulls = 0;
			let oldCloses = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
			const owner = scope();
			const selected$ = owner.signal$('selected', 'old');
			const old = buffered(
				100,
				() => oldPulls++,
				() => oldCloses++,
			);
			const next = buffered(1);
			const load = query('selection', (key: string) => (key === 'old' ? old : next), {
				kind: 'stream',
			});
			const value$ =
				kind === 'query'
					? createResource(owner, 'selection', () => load(selected$.get()))
					: derived$<number>(() => (selected$.get() === 'old' ? old : next), { key: 'selection' });
			const seen: number[] = [];
			runWithSignalOwner(owner, () =>
				value$.subscribe(() => {
					const snapshot = value$.snapshot();
					if (snapshot.status === 'ready' && !snapshot.complete) {
						seen.push(snapshot.value);
						elapsed += 3;
					}
				}),
			);
			await hostTask();
			expect(seen.length).toBeLessThan(100);
			selected$.set('new');
			const pullsAtReplacement = oldPulls;
			await finished(owner, value$);
			await hostTask();
			expect(oldPulls).toBe(pullsAtReplacement);
			expect(oldCloses).toBe(1);
			expect(runWithSignalOwner(owner, () => value$.get())).toBe(0);
		},
	);

	it('shares elapsed work across concurrently ready query and derived streams', async () => {
		let elapsed = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
		const owner = scope();
		const observed: number[][] = [];
		const completions: Promise<void>[] = [];
		for (let i = 0; i < 12; i++) {
			const value$ = producer(owner, i % 2 ? 'query' : 'derived', 4, `shared-${i}`);
			const values: number[] = [];
			observed.push(values);
			runWithSignalOwner(owner, () =>
				value$.subscribe(() => {
					const snapshot = value$.snapshot();
					if (snapshot.status === 'ready' && !snapshot.complete) {
						values.push(snapshot.value);
						elapsed += 2;
					}
				}),
			);
			completions.push(finished(owner, value$));
		}
		await hostTask();
		// Even one ready result per producer would exhaust a separate-per-producer
		// policy before this marker; the shared budget must stop that aggregate burst.
		expect(observed.reduce((n, values) => n + values.length, 0)).toBeLessThan(12);
		await Promise.all(completions);
		expect(observed).toEqual(Array.from({ length: 12 }, () => [0, 1, 2, 3]));
	});

	it.each(['query', 'derived'] as const)(
		'allows disposal to cancel a paced %s before its next pull',
		async (kind) => {
			let elapsed = 0;
			let pulls = 0;
			let closes = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
			const owner = scope();
			const value$ = producer(
				owner,
				kind,
				100,
				kind,
				() => pulls++,
				() => closes++,
			);
			const values: number[] = [];
			runWithSignalOwner(owner, () =>
				value$.subscribe(() => {
					const snapshot = value$.snapshot();
					if (snapshot.status === 'ready' && !snapshot.complete) {
						values.push(snapshot.value);
						elapsed += 3;
					}
				}),
			);
			await hostTask();
			expect(values.length).toBeLessThan(100);
			owner.dispose();
			const pulledAtDispose = pulls;
			const publishedAtDispose = values.slice();
			await hostTask();
			await microtasks();
			expect(pulls).toBe(pulledAtDispose);
			expect(values).toEqual(publishedAtDispose);
			expect(closes).toBe(1);
		},
	);
});
