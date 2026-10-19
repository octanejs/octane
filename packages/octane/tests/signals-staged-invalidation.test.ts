import { expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, startTransition } from 'octane';
import { createResource, createScope, query, type WritableSignal } from 'octane/signals';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks.js';
import {
	AsyncRedeclaredWhilePending,
	NonSuspendingPending,
	PendingStaged,
	ReadyStaged,
	RedeclaredWhilePending,
} from './_fixtures/signals-staged-invalidation.tsrx';

function holdViewTransitions() {
	const mocks = installViewTransitionMocks();
	const handles: Array<{ update: () => void | Promise<void>; finish: () => void }> = [];
	(document as any).startViewTransition = (
		input: { update: () => void | Promise<void> } | (() => void),
	) => {
		let finish!: () => void;
		const completed = new Promise<void>((resolve) => {
			finish = resolve;
		});
		handles.push({ update: typeof input === 'function' ? input : input.update, finish });
		return { ready: completed, finished: completed, skipTransition() {} };
	};
	return {
		handles,
		restore() {
			for (const handle of handles) handle.finish();
			mocks.restore();
		},
	};
}

for (const beforeAcceptance of [true, false]) {
	const when = beforeAcceptance ? 'before' : 'after';

	it(`refreshes a pending view whose dependency changes ${when} a held transition is accepted`, async () => {
		const held = holdViewTransitions();
		const scope = createScope({ scopeKey: 'staged-pending' });
		const ready$ = scope.signal$('ready', false);
		const waiting = new Promise<void>(() => {});
		const seen: string[] = [];
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const props = { ready$, waiting, capture: (status: string) => seen.push(status) };
		try {
			await act(() => root.render(PendingStaged, { ...props, version: 0 }));
			expect(container.querySelector('output')!.textContent).toBe('pending');
			await act(() => startTransition(() => root.render(PendingStaged, { ...props, version: 1 })));
			expect(held.handles).toHaveLength(1);
			expect(container.querySelector('button')!.textContent).toBe('Short');
			if (beforeAcceptance) await act(() => ready$.set(true));
			for (const handle of [...held.handles]) {
				await handle.update();
				handle.finish();
			}
			await act(() => {});
			expect(container.querySelector('button')!.textContent).toBe('Much longer content here');
			if (!beforeAcceptance) await act(() => ready$.set(true));
			flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
			expect(seen.at(-1)).toBe('ready:1');
			expect(container.querySelector('output')!.textContent).toBe('ready:1');
		} finally {
			held.restore();
			flushSync(() => root.unmount());
			scope.dispose();
			container.remove();
		}
	});

	it(`refreshes a ready view whose new dependency changes ${when} a held transition is accepted`, async () => {
		const result = await acceptReadyStaged$((next$) => {
			if (beforeAcceptance) next$.set(true);
		});
		try {
			if (!beforeAcceptance) await act(() => result.next$.set(true));
			expect(result.container.querySelector('span')!.textContent).toBe('new');
			expect(result.read()).toBe('new');
		} finally {
			result.cleanup();
		}
	});
}

it('keeps a ready view whose dependency changes back before a held transition is accepted', async () => {
	const result = await acceptReadyStaged$((next$) => {
		next$.set(true);
		next$.set(false);
	});
	try {
		expect(result.container.querySelector('span')!.textContent).toBe('old');
		expect(result.read()).toBe('old');
	} finally {
		result.cleanup();
	}
});

it.each(
	[false, true].flatMap((scalar) =>
		[['new'], ['new', 'replacement']].map((suffixes) => ({ scalar, suffixes })),
	),
)(
	'publishes the accepted declaration after urgent updates $suffixes during a pending transition (scalar=$scalar)',
	async ({ scalar, suffixes }) => {
		const scope = createScope({ scopeKey: 'redeclared-while-pending' });
		const route$ = scope.signal$('route', 'A');
		const delivery = Promise.withResolvers<string>();
		const load = vi.fn(() => delivery.promise);
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const render = (suffix: string) =>
			root.render(RedeclaredWhilePending, { route$, suffix, load, scalar });
		try {
			await act(() => render('old'));
			await act(() => startTransition(() => route$.set('B')));
			expect(load).toHaveBeenCalledWith('B');
			expect(container.querySelector('output')!.textContent).toBe('ready|A:old');
			for (const suffix of suffixes) {
				flushSync(() => render(suffix));
				expect(container.querySelector('output')!.textContent).toBe(`ready|A:${suffix}`);
			}
			await act(() => delivery.resolve('ready'));
			const suffix = suffixes.at(-1)!;
			expect(container.querySelector('i')!.textContent).toBe(suffix);
			await vi.waitFor(() =>
				expect(container.querySelector('output')!.textContent).toBe(`ready|B:${suffix}`),
			);
			expect(route$.get()).toBe('B');
		} finally {
			delivery.resolve('ready');
			root.unmount();
			scope.dispose();
			container.remove();
		}
	},
);

it.each(['resolve', 'cancel', 'replace', 'skip', 'repeat'] as const)(
	'keeps or releases a pending query according to the accepted declaration (%s)',
	async (finish) => {
		const scope = createScope({ scopeKey: 'redeclared-pending-query' });
		const route$ = scope.signal$('route', 'A');
		const gate = Promise.withResolvers<string>();
		const delivery = Promise.withResolvers<string>();
		const requests: Array<{ route: string; signal: AbortSignal }> = [];
		const fetch = (route: string, { signal }: { signal: AbortSignal }) => {
			if (route === 'A') return Promise.resolve('A');
			requests.push({ route, signal });
			return delivery.promise;
		};
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const render = (suffix: string, selection?: string, readRequest = true) =>
			root.render(AsyncRedeclaredWhilePending, {
				route$,
				suffix,
				load: () => gate.promise,
				fetch,
				selection,
				readRequest,
			});
		try {
			await act(() => render('old'));
			expect(container.querySelector('output')!.textContent).toBe('A:old');
			await act(() => startTransition(() => route$.set('B')));
			expect(requests).toHaveLength(1);
			flushSync(() => render('new', finish === 'replace' ? 'C' : undefined, finish !== 'skip'));
			if (finish === 'repeat') flushSync(() => render('replacement'));
			await act(() => gate.resolve('ready'));
			expect(route$.get()).toBe('B');
			if (finish !== 'skip')
				expect(requests.map(({ route }) => route)).toEqual(
					finish === 'replace' ? ['B', 'C'] : ['B'],
				);
			expect(requests[0]!.signal.aborted).toBe(finish === 'replace' || finish === 'skip');
			if (finish === 'cancel') {
				root.unmount();
				expect(requests[0]!.signal.aborted).toBe(true);
			} else if (finish === 'skip') {
				expect(container.querySelector('output')!.textContent).toBe('static:new');
			} else {
				const selected = finish === 'replace' ? 'C' : 'B';
				expect(requests.at(-1)!.signal.aborted).toBe(false);
				await act(() => delivery.resolve(selected));
				expect(container.querySelector('output')!.textContent).toBe(
					`${selected}:${finish === 'repeat' ? 'replacement' : 'new'}`,
				);
			}
		} finally {
			gate.resolve('ready');
			delivery.resolve('B');
			root.unmount();
			scope.dispose();
			container.remove();
		}
	},
);

const nonSuspendingCases: Array<{
	name: string;
	read?: 'snapshot' | 'latest';
	dependency?: 'same' | 'switch' | 'drop';
	projected?: boolean;
	reentrant?: boolean;
}> = [
	{ name: 'snapshot' },
	{ name: 'latest', read: 'latest' },
	{ name: 'transitive projection', projected: true },
	{ name: 'fresh dependency', dependency: 'switch' },
	{ name: 'dropped dependency', dependency: 'drop' },
	{ name: 'committed cancellation reentry', reentrant: true },
];

it.each(nonSuspendingCases)(
	'reprepares a non-suspending presentation without a retry ($name)',
	async ({
		name,
		read = 'snapshot',
		dependency = 'same',
		projected = false,
		reentrant = false,
	}) => {
		const scope = createScope({ scopeKey: `redeclared-${name}` });
		const selected$ = scope.signal$('selected', 'A');
		let settle = () => {};
		const actionGate = reentrant
			? ({
					then: (resolve: () => void) => {
						settle = resolve;
					},
				} as unknown as Promise<void>)
			: new Promise<void>((resolve) => {
					settle = resolve;
				});
		const delivery = Promise.withResolvers<string>();
		const requests: Array<{ kind: 'original' | 'alternative'; signal: AbortSignal }> = [];
		const reads: string[] = [];
		let stop = () => {};
		const fetch =
			(kind: 'original' | 'alternative') =>
			(selection: string, { signal }: { signal: AbortSignal }) => {
				if (selection === 'A') return kind === 'alternative' ? 'alternative:A' : 'A';
				requests.push({ kind, signal });
				return delivery.promise.then((value) =>
					kind === 'alternative' ? `alternative:${value}` : value,
				);
			};
		const fetchOriginal = fetch('original');
		const fetchAlternative = fetch('alternative');
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const render = (suffix: string, present: boolean, accepted: 'same' | 'switch' | 'drop') =>
			root.render(NonSuspendingPending, {
				selected$,
				fetch: fetchOriginal,
				fetchAlternative,
				suffix,
				read,
				dependency: accepted,
				projected,
				present,
				gate: actionGate,
				onRead: (value: string) => reads.push(value),
			});
		try {
			await act(() => render('old', true, 'same'));
			expect(container.querySelector('output')!.textContent).toBe('A:old');
			await act(() => container.querySelectorAll('button')[0]!.click());
			expect(requests).toHaveLength(1);
			flushSync(() => render('new', false, dependency));
			expect(container.querySelector('output')!.textContent).toBe('deferred');
			flushSync(() => container.querySelectorAll('button')[1]!.click());
			expect(reads).toEqual(['A:old']);
			if (dependency === 'switch')
				stop = selected$.subscribe(() => container.querySelectorAll('button')[1]!.click());
			if (reentrant) {
				const committedReads: string[] = [];
				const cancellation = createScope({ scopeKey: 'cancellation-reentry' });
				const trigger = query('cancellation-reentry', (_key: undefined, { signal }) => {
					signal.addEventListener('abort', () => {
						committedReads.push(selected$.get());
						settle();
						flushSync(() => {});
					});
					return new Promise<string>(() => {});
				});
				try {
					createResource(cancellation, 'trigger', () => trigger(undefined));
					await act(() => cancellation.dispose());
					expect(committedReads).toEqual(['A']);
				} finally {
					cancellation.dispose();
				}
			} else await act(() => settle());
			expect(selected$.get()).toBe('B');
			expect(requests[0]!.signal.aborted).toBe(dependency !== 'same');
			if (dependency !== 'drop') {
				const retained = requests.filter(({ kind }) =>
					dependency === 'switch' ? kind === 'alternative' : kind === 'original',
				);
				expect(retained).toHaveLength(1);
				expect(retained[0]!.signal.aborted).toBe(false);
			}
			if (dependency === 'switch') expect(reads).toEqual(['A:old', 'pending']);
			await act(() => delivery.resolve('B'));
			await act(() => render('new', true, dependency));
			expect(container.querySelector('output')!.textContent).toBe(
				dependency === 'drop'
					? 'static:new'
					: dependency === 'switch'
						? 'alternative:B:new'
						: 'B:new',
			);
		} finally {
			stop();
			settle();
			delivery.resolve('B');
			root.unmount();
			scope.dispose();
			container.remove();
		}
	},
);

/** Render, redeclare the derived over `next$` in a held transition, then accept it. */
async function acceptReadyStaged$(whileHeld: (next$: WritableSignal<boolean>) => void) {
	const held = holdViewTransitions();
	const scope = createScope({ scopeKey: 'staged-ready' });
	const first$ = scope.signal$('first', false);
	const next$ = scope.signal$('next', false);
	let read: (() => string) | undefined;
	const capture = (callback: () => string) => {
		read = callback;
	};
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	const cleanup = () => {
		held.restore();
		flushSync(() => root.unmount());
		scope.dispose();
		container.remove();
	};
	try {
		await act(() => root.render(ReadyStaged, { source$: first$, version: 0, capture }));
		flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
		expect(read!()).toBe('old');
		await act(() =>
			startTransition(() => root.render(ReadyStaged, { source$: next$, version: 1, capture })),
		);
		expect(held.handles).toHaveLength(1);
		whileHeld(next$);
		await held.handles[0]!.update();
		held.handles[0]!.finish();
		await act(() => {});
		expect(container.querySelector('button')!.firstChild!.textContent).toBe(
			'Much longer content here',
		);
	} catch (error) {
		cleanup();
		throw error;
	}
	return { container, next$, read: () => read!(), cleanup };
}
