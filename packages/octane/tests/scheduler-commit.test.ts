import { describe, expect, it, vi } from 'vitest';
import { createRoot, hydrateRoot, type Root } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { flushEffects, mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import { ConnectedRef } from './_fixtures/ref-timing.tsrx';
import { ManyPassiveEffects, PhaseOrder } from './_fixtures/effect-timing.tsrx';
import { BatchChild } from './conformance/_fixtures/event-listener.tsrx';

function makeContainer(): HTMLDivElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	return container;
}

describe('scheduled commits after synchronous DOM work', () => {
	it('attaches a first-render ref when no component update is queued', async () => {
		await Promise.resolve();
		const container = makeContainer();
		const root = createRoot(container);
		const seen: Array<HTMLElement | null> = [];
		try {
			root.render(ConnectedRef, {
				observe: (element: HTMLElement | null) => {
					seen.push(element);
				},
			});
			const host = container.querySelector<HTMLElement>('#host');
			expect(host?.textContent).toBe('x');
			expect(seen).toEqual([]);

			await Promise.resolve();

			expect(seen).toEqual([host]);
			expect(host?.isConnected).toBe(true);
			root.unmount();
			expect(seen).toEqual([host, null]);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('commits a hydration ref to the adopted element without another render', async () => {
		await Promise.resolve();
		const server = loadServerFixture('packages/octane/tests/_fixtures/ref-timing.tsrx');
		const container = makeContainer();
		const seen: Array<HTMLElement | null> = [];
		let root: Root | undefined;
		try {
			container.innerHTML = ServerRuntime.renderToString(server.ConnectedRef, {
				observe: () => {},
			}).html;
			const host = container.querySelector<HTMLElement>('#host');
			root = hydrateRoot(container, ConnectedRef, {
				observe: (element: HTMLElement | null) => {
					seen.push(element);
				},
			});
			expect(container.querySelector('#host')).toBe(host);
			expect(seen).toEqual([]);

			await Promise.resolve();

			expect(seen).toEqual([host]);
			expect(host?.isConnected).toBe(true);
			root.unmount();
			expect(seen).toEqual([host, null]);
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	for (const mode of ['render', 'hydrate'] as const) {
		it(`commits ${mode} effects in order while keeping passive work deferred`, async () => {
			await Promise.resolve();
			const container = makeContainer();
			const log: string[] = [];
			let root: Root | undefined;
			try {
				const props = { tick: 0, log };
				if (mode === 'hydrate') {
					const server = loadServerFixture('packages/octane/tests/_fixtures/effect-timing.tsrx');
					container.innerHTML = ServerRuntime.renderToString(server.PhaseOrder, props).html;
					root = hydrateRoot(container, PhaseOrder, props);
				} else {
					root = createRoot(container);
					root.render(PhaseOrder, props);
				}
				expect(container.textContent).toBe('x');
				expect(log).toEqual([]);

				await Promise.resolve();

				expect(log).toEqual(['ins:body', 'lay:body']);
				flushEffects();
				expect(log).toEqual(['ins:body', 'lay:body', 'eff:body']);
			} finally {
				root?.unmount();
				container.remove();
				flushEffects();
			}
		});

		it(`schedules passive-only ${mode} effects without an additional update`, async () => {
			await Promise.resolve();
			vi.useFakeTimers();
			vi.stubGlobal('requestAnimationFrame', () => 0);
			const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
			const container = makeContainer();
			const log: string[] = [];
			let root: Root | undefined;
			try {
				if (mode === 'hydrate') {
					const server = loadServerFixture('packages/octane/tests/_fixtures/effect-timing.tsrx');
					container.innerHTML = ServerRuntime.renderToString(server.ManyPassiveEffects, {
						log,
					}).html;
					root = hydrateRoot(container, ManyPassiveEffects, { log });
				} else {
					root = createRoot(container);
					root.render(ManyPassiveEffects, { log });
				}
				expect(container.textContent).toBe('multi');
				expect(log).toEqual([]);

				await Promise.resolve();
				expect(log).toEqual([]);
				await vi.advanceTimersByTimeAsync(1_000);

				expect(log).toEqual(['A:body', 'B:body', 'C:body']);
				root.unmount();
				expect(log).toEqual(['A:body', 'B:body', 'C:body', 'A:cleanup', 'B:cleanup', 'C:cleanup']);
				flushEffects();
				expect(log).toEqual(['A:body', 'B:body', 'C:body', 'A:cleanup', 'B:cleanup', 'C:cleanup']);
			} finally {
				root?.unmount();
				container.remove();
				flushEffects();
				visibility.mockRestore();
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});
	}

	it('keeps an already-armed batch ahead of a later user microtask after a click', async () => {
		let setValue!: (value: string) => void;
		const observed: string[] = [];
		const rendered = mount(BatchChild, {
			register: (setter: (value: string) => void) => {
				setValue = setter;
			},
			onEvent: () => {
				setValue('clicked');
				observed.push(rendered.find('.child-span').textContent ?? '');
			},
		});
		try {
			// Settle the mount's own scheduled commit before dispatching a native
			// click. The mount helper's click() would wrap it in flushSync.
			await Promise.resolve();
			const span = rendered.find('.child-span') as HTMLElement;
			span.click();
			expect(observed).toEqual(['Child']);
			// The click's update armed the batch; it commits when the script yields.
			expect(span.textContent).toBe('Child');

			queueMicrotask(() => observed.push(span.textContent ?? ''));
			setValue('queued');
			expect(span.textContent).toBe('Child');
			await Promise.resolve();

			expect(observed).toEqual(['Child', 'queued']);
			expect(span.textContent).toBe('queued');
			setValue('later');
			expect(span.textContent).toBe('queued');
			await Promise.resolve();
			expect(span.textContent).toBe('later');
		} finally {
			rendered.unmount();
		}
	});

	it('starts a later non-event batch after a click and its queued commit have settled', async () => {
		let setValue!: (value: string) => void;
		const observed: string[] = [];
		const rendered = mount(BatchChild, {
			register: (setter: (value: string) => void) => {
				setValue = setter;
			},
			onEvent: () => setValue('clicked'),
		});
		try {
			await Promise.resolve();
			const span = rendered.find('.child-span') as HTMLElement;
			span.click();
			expect(span.textContent).toBe('Child');
			await Promise.resolve();
			expect(span.textContent).toBe('clicked');

			queueMicrotask(() => observed.push(span.textContent ?? ''));
			setValue('later');
			expect(span.textContent).toBe('clicked');
			await Promise.resolve();

			expect(observed).toEqual(['clicked']);
			expect(span.textContent).toBe('later');
		} finally {
			rendered.unmount();
		}
	});
});
