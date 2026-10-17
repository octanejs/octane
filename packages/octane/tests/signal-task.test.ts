import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	act,
	createElement,
	createRoot,
	flushSync,
	startTransition,
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
function finished(owner: Scope, value$: SignalHandle<unknown>): Promise<void> {
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

	// The subscriber runs while the graph is still delivering the stream's
	// result, so the event's own batch cannot flush. Its controlled restore must
	// still see the edit rendered, or the field flashes back to its last value.
	it.each([
		{ edit: 'none', derived: false, capture: false },
		{ edit: 'queued', derived: false, capture: false },
		{ edit: 'none', derived: true, capture: false },
		{ edit: 'queued', derived: true, capture: false },
		{ edit: 'transition', derived: false, capture: false },
		{ edit: 'transition', derived: true, capture: false },
		{ edit: 'none', derived: false, capture: true },
		{ edit: 'queued', derived: true, capture: true },
		{ edit: 'transition', derived: true, capture: true },
	] as const)(
		'renders a controlled edit before its restore while a stream stays open ($edit edit, derived: $derived, stopped capture: $capture)',
		async ({ edit, derived, capture }) => {
			const owner = scope();
			const text$ = owner.signal$('text', '');
			const display$ = derived ? owner.derived$('display', () => text$.get()) : text$;
			let complete!: () => void;
			const completion = new Promise<void>((resolve) => {
				complete = resolve;
			});
			const request = query(
				'open-controlled-subscriber',
				async function* () {
					yield 0;
					await completion;
				},
				{ kind: 'stream' },
			);
			const value$ = createResource(owner, 'open', () => request(undefined));
			const container = mount(() =>
				createElement(
					'section',
					null,
					createElement('input', {
						value: display$.get(),
						[capture ? 'onInputCapture' : 'onInput']: (event: Event) => {
							text$.set((event.target as HTMLInputElement).value);
							if (capture) event.stopPropagation();
						},
					}),
					createElement('output', null, display$.get()),
				),
			);
			const input = container.querySelector('input')!;
			const output = container.querySelector('output')!;
			let restored: [string, string | null, boolean] | undefined;
			let dispatched!: () => void;
			const edited = new Promise<void>((resolve) => {
				dispatched = resolve;
			});
			const stop = value$.subscribe(() => {
				const snapshot = value$.snapshot();
				if (snapshot.status !== 'ready' || snapshot.complete || restored) return;
				if (edit === 'queued') text$.set('intermediate');
				if (edit === 'transition') startTransition(() => text$.set('intermediate'));
				input.value = 'typed';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				restored = [input.value, output.textContent, value$.snapshot().complete];
				dispatched();
			});
			try {
				await edited;
				// The restore compares the field with what the edit rendered.
				expect(restored).toEqual(['typed', 'typed', false]);
				await microtasks();
				expect(input.value).toBe('typed');
				expect(output.textContent).toBe('typed');
				await act(() => {});
				expect([input.value, output.textContent, text$.get()]).toEqual(['typed', 'typed', 'typed']);
			} finally {
				stop();
				complete();
			}
		},
	);

	it('keeps a producer render at task priority across an unrelated subscriber click', async () => {
		const owner = scope();
		let complete!: () => void;
		const completion = new Promise<void>((resolve) => {
			complete = resolve;
		});
		const request = query(
			'separate-controlled-subscriber',
			async function* () {
				yield 0;
				await completion;
			},
			{ kind: 'stream' },
		);
		const value$ = createResource(owner, 'open', () => request(undefined));
		const editor = mount(() =>
			createElement('section', null, createElement('button', { onClick: () => {} }, 'no change')),
		);
		const button = editor.querySelector('button')!;
		let clicked!: () => void;
		const edited = new Promise<void>((resolve) => {
			clicked = resolve;
		});
		// Subscribed first, so the stream's publication has also queued the
		// background reader when this subscriber dispatches its click.
		const stop = value$.subscribe(() => {
			const snapshot = value$.snapshot();
			if (snapshot.status !== 'ready' || snapshot.complete) return;
			button.click();
			clicked();
		});
		const background = mount(() => createElement('output', null, String(value$.latest(-1))));
		try {
			expect(background.textContent).toBe('-1');
			await edited;
			await microtasks();
			expect(editor.textContent).toBe('no change');
			expect(background.textContent).toBe('-1');
			await hostTask();
			await act(() => {});
			expect(background.textContent).toBe('0');
		} finally {
			stop();
			complete();
		}
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

	it.each(['finish', 'replace', 'dispose'] as const)(
		'paces ready query results and preserves %s after the wait',
		async (operation) => {
			let elapsed = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
			const owner = scope();
			const selected$ = owner.signal$('selected', 'old');
			const seen: string[] = [];
			const resources = Array.from({ length: 12 }, (_, index) => {
				const request = query(`promise-${index}`, (selected: string) =>
					Promise.resolve(`${selected}:${index}`),
				);
				const value$ = createResource(owner, `promise-${index}`, () => request(selected$.get()));
				runWithSignalOwner(owner, () =>
					value$.subscribe(() => {
						const snapshot = value$.snapshot();
						if (snapshot.status === 'ready') {
							seen.push(snapshot.value);
							elapsed += 2;
						}
					}),
				);
				return value$;
			});
			await hostTask();
			expect(seen.length).toBeGreaterThan(0);
			expect(seen.length).toBeLessThan(resources.length);
			const atBoundary = seen.slice();
			if (operation === 'dispose') owner.dispose();
			else if (operation === 'replace') selected$.set('new');
			if (operation !== 'dispose')
				await Promise.all(resources.map((value$) => finished(owner, value$)));
			await hostTask();
			if (operation === 'dispose') expect(seen).toEqual(atBoundary);
			else if (operation === 'replace') {
				expect(seen.slice(atBoundary.length)).toEqual(resources.map((_, index) => `new:${index}`));
				expect(resources.map((value$) => runWithSignalOwner(owner, () => value$.get()))).toEqual(
					resources.map((_, index) => `new:${index}`),
				);
			} else expect(seen).toEqual(resources.map((_, index) => `old:${index}`));
		},
	);

	for (const callback of ['sync', 'async'] as const) {
		it.each(['promise', 'query', 'derived'] as const)(
			`awaited act with a ${callback} callback drains paced %s publications and their UI`,
			async (kind) => {
				let elapsed = 0;
				vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
				const owner = scope();
				const seen: number[] = [];
				let publish!: () => void;
				const container = mount(() => {
					const [count, setCount] = useState(0, Symbol.for('signal-task.act-count'));
					publish = () => setCount((value) => value + 1);
					return createElement('output', null, String(count));
				});
				const start = () => {
					const values =
						kind === 'promise'
							? Array.from({ length: 12 }, (_, index) =>
									createResource(owner, `act-${index}`, () =>
										query(`act-${index}`, () => Promise.resolve(index))(undefined),
									),
								)
							: [producer(owner, kind, 12)];
					for (const value$ of values) {
						runWithSignalOwner(owner, () =>
							value$.subscribe(() => {
								const snapshot = value$.snapshot();
								if (snapshot.status === 'ready' && (kind === 'promise' || !snapshot.complete)) {
									seen.push(snapshot.value);
									elapsed += 2;
									publish();
								}
							}),
						);
					}
				};
				await act(callback === 'async' ? async () => start() : start);
				expect(seen).toEqual(Array.from({ length: 12 }, (_, index) => index));
				expect(container.textContent).toBe('12');
			},
		);
	}

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
