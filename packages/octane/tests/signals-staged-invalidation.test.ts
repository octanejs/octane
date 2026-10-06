import { expect, it } from 'vitest';
import { act, createRoot, flushSync, startTransition } from 'octane';
import { createScope, type WritableSignal } from 'octane/signals';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks.js';
import { PendingStaged, ReadyStaged } from './_fixtures/signals-staged-invalidation.tsrx';

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
