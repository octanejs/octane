import { describe, expect, it } from 'vitest';
import { act, createRoot, hydrateRoot, startTransition, type Root } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import { IntegrationScreen, PendingOwner } from './_fixtures/imperative-integration.tsrx';
import { StateProbe } from './_fixtures/transition-flush-task.tsrx';

function makeContainer(): HTMLDivElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	return container;
}

describe('committed binding state', () => {
	for (const mode of ['render', 'hydrate'] as const) {
		it(`publishes an integration cue before an external callback after ${mode} without admitting waiting transition work`, async () => {
			const container = makeContainer();
			const deferredContainer = makeContainer();
			const deferredRoot = createRoot(deferredContainer);
			let root: Root | undefined;
			let setDeferred!: (value: number) => void;
			const layout: boolean[] = [];
			const observed: unknown[] = [];
			const props = {
				onLayout: (value: boolean) => layout.push(value),
				afterCommit: () =>
					observed.push([
						container.querySelector('section')?.getAttribute('data-open'),
						container.querySelector('.commit')?.textContent,
						layout.at(-1),
						deferredContainer.textContent,
					]),
			};
			try {
				deferredRoot.render(StateProbe, {
					expose: (setter: (value: number) => void) => (setDeferred = setter),
					onCommit: () => {},
				});
				if (mode === 'hydrate') {
					const server = loadServerFixture(
						'packages/octane/tests/_fixtures/imperative-integration.tsrx',
					);
					container.innerHTML = ServerRuntime.renderToString(server.IntegrationScreen, props).html;
					const original = container.querySelector('.commit');
					root = hydrateRoot(container, IntegrationScreen, props);
					expect(container.querySelector('.commit')).toBe(original);
				} else {
					root = createRoot(container);
					root.render(IntegrationScreen, props);
				}
				await Promise.resolve();
				startTransition(() => setDeferred(1));
				(container.querySelector('.commit') as HTMLButtonElement).click();
				expect(observed).toEqual([['false', 'true', true, '0']]);
				await act(() => {});
				expect(deferredContainer.textContent).toBe('1');
			} finally {
				root?.unmount();
				deferredRoot.unmount();
				container.remove();
				deferredContainer.remove();
			}
		});
	}

	it('keeps the ordinary integration setter microtask batched', async () => {
		const view = mount(IntegrationScreen, { afterCommit: () => {}, onLayout: () => {} });
		try {
			await Promise.resolve();
			(view.find('.commit') as HTMLButtonElement).click();
			expect(view.find('.commit').textContent).toBe('true');
			(view.find('.ordinary') as HTMLButtonElement).click();
			expect(view.find('.commit').textContent).toBe('true');
			await Promise.resolve();
			expect(view.find('.commit').textContent).toBe('false');
		} finally {
			view.unmount();
		}
	});

	it('publishes a committed cue when its owner already waits in a transition task', async () => {
		const seen: string[] = [];
		const view = mount(PendingOwner, {
			afterCommit: () => seen.push(view.find('button').textContent ?? ''),
		});
		try {
			await Promise.resolve();
			(view.find('button') as HTMLButtonElement).click();
			expect(seen).toEqual(['true:1']);
		} finally {
			view.unmount();
		}
	});
});
