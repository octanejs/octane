import { expect, it } from 'vitest';
import { atom, createStore } from 'jotai/vanilla';
import { flushSync, hydrateRoot } from 'octane';
import { nextPaint } from '../_helpers';
import { renderToString } from 'octane/server';
import { HydrationApp } from '../_fixtures/hydration.tsrx';
// @ts-expect-error the shared fixture plugin compiles this module for the server
import { HydrationApp as ServerApp } from '../_fixtures/hydration.tsrx?octane-ssr';

// @parity-case conformance:jotai-hydration
it('renders both raw hooks without subscribing on the server and hydrates live store state', async () => {
	const count = atom(4);
	const store = createStore();
	let mounted = 0;
	let disposed = 0;
	count.onMount = () => {
		mounted++;
		return () => {
			disposed++;
		};
	};
	const props = { count, store };
	const { html } = renderToString(ServerApp, props);
	expect(mounted).toBe(0);
	expect(html).toContain('raw=4 sync=4');
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	const button = container.querySelector<HTMLButtonElement>('#snapshot')!;
	const root = hydrateRoot(container, HydrationApp, props);
	try {
		await nextPaint();
		flushSync(() => {});
		expect(container.querySelector('#snapshot')).toBe(button);
		expect(mounted).toBe(1);
		flushSync(() => button.click());
		expect(button.textContent).toBe('raw=5 sync=5');
		expect(store.get(count)).toBe(5);
		flushSync(() => store.set(count, 9));
		expect(button.textContent).toBe('raw=9 sync=9');
	} finally {
		root.unmount();
		container.remove();
	}
	expect(disposed).toBe(1);
});
