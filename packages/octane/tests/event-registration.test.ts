import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
	resolve(import.meta.dirname, '_fixtures/event-registration.tsrx'),
	'utf8',
);

describe('native event registration across module and root lifetimes', () => {
	it.each(['static', 'dynamic'] as const)(
		'preserves nonbubbling phases when %s handlers register first',
		async (first) => {
			// This module must register after the first root exists, with a fresh
			// runtime so a previous test cannot pre-register the native event types.
			vi.resetModules();
			const { createElement, createRoot, flushSync } = await import('../src/index.js');
			const { loadCompiledFixtureSource } = await import('./_server-fixture.js');
			const containers = [document.createElement('div'), document.createElement('div')];
			for (const container of containers) document.body.appendChild(container);
			const calls: string[] = [];
			const record = (event: Event) => {
				calls.push(`${event.type}:${(event.currentTarget as Element).id}:${event.eventPhase}`);
			};
			const dynamic = () =>
				createElement(
					'section',
					{
						id: 'parent',
						onLoad: record,
						onLoadCapture: record,
						onScroll: record,
						onScrollCapture: record,
					},
					createElement('div', {
						id: 'child',
						onLoad: record,
						onLoadCapture: record,
						onScroll: record,
						onScrollCapture: record,
					}),
				);
			const subscriptions: Array<{ type: string; listener: unknown; capture: boolean }> = [];
			const capture = (options?: boolean | AddEventListenerOptions | EventListenerOptions) =>
				typeof options === 'boolean' ? options : options?.capture === true;
			const add = containers[0].addEventListener.bind(containers[0]);
			const remove = containers[0].removeEventListener.bind(containers[0]);
			const addSpy = vi
				.spyOn(containers[0], 'addEventListener')
				.mockImplementation((type, listener, options) => {
					if (
						['load', 'scroll'].includes(type) &&
						!subscriptions.some(
							(entry) =>
								entry.type === type &&
								entry.listener === listener &&
								entry.capture === capture(options),
						)
					)
						subscriptions.push({ type, listener, capture: capture(options) });
					add(type, listener, options);
				});
			const removeSpy = vi
				.spyOn(containers[0], 'removeEventListener')
				.mockImplementation((type, listener, options) => {
					const index = subscriptions.findIndex(
						(entry) =>
							entry.type === type &&
							entry.listener === listener &&
							entry.capture === capture(options),
					);
					if (index !== -1) subscriptions.splice(index, 1);
					remove(type, listener, options);
				});
			const unrelated = vi.fn();
			containers[0].addEventListener('load', unrelated);
			const original = [...subscriptions];
			const earlyRoot = createRoot(containers[0]);
			let lateRoot: ReturnType<typeof createRoot> | undefined;
			let earlyUnmounted = false;
			try {
				earlyRoot.render(first === 'dynamic' ? dynamic : () => null);
				const { EventSurface } = loadCompiledFixtureSource(source, {
					id: 'event-registration.tsrx',
					mode: 'client',
					compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false },
				});
				flushSync(() => earlyRoot.render(EventSurface, { record }));
				lateRoot = createRoot(containers[1]);
				lateRoot.render(dynamic);
				const observe = (container: HTMLElement) => {
					const child = container.querySelector('#child')!;
					calls.length = 0;
					child.dispatchEvent(new Event('load', { bubbles: false }));
					expect(calls).toEqual(['load:parent:1', 'load:child:1', 'load:child:1', 'load:parent:1']);
					calls.length = 0;
					child.dispatchEvent(new Event('scroll', { bubbles: false }));
					expect(calls).toEqual(['scroll:parent:1', 'scroll:child:1', 'scroll:child:1']);
				};
				observe(containers[0]);
				observe(containers[1]);
				earlyRoot.unmount();
				earlyUnmounted = true;
				expect(containers[0].innerHTML).toBe('');
				expect(subscriptions).toEqual(original);
				observe(containers[1]);
				containers[0].dispatchEvent(new Event('load'));
				expect(unrelated).toHaveBeenCalledOnce();
			} finally {
				if (!earlyUnmounted) earlyRoot.unmount();
				lateRoot?.unmount();
				containers[0].removeEventListener('load', unrelated);
				addSpy.mockRestore();
				removeSpy.mockRestore();
				for (const container of containers) container.remove();
			}
		},
	);
});
