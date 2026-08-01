/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, flushSync } from 'octane';
import createHydrator from '../src/client.js';

function Label(props: { text: string }) {
	return createElement('p', { id: 'label' }, props.text);
}

describe('client:only hydrator', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('replaces Astro fallback markup on the first client:only mount', () => {
		const island = document.createElement('div');
		island.setAttribute('ssr', '');
		island.innerHTML = '<span id="fallback">loading</span>';
		document.body.append(island);

		createHydrator(island)(Label, { text: 'hello' }, {}, { client: 'only' });

		expect(island.querySelector('#fallback')).toBeNull();
		expect(island.querySelector('#label')?.textContent).toBe('hello');
	});

	it('reuses the live root on re-invoke without wiping owned DOM first', () => {
		const island = document.createElement('div');
		island.setAttribute('ssr', '');
		island.innerHTML = '<span id="fallback">loading</span>';
		document.body.append(island);

		const hydrate = createHydrator(island);
		hydrate(Label, { text: 'one' }, {}, { client: 'only' });

		const label = island.querySelector('#label');
		expect(label?.textContent).toBe('one');

		// Astro re-invokes with fresh props while `ssr` is still set (e.g. before
		// the island drops the attribute, or a persisted island refresh). Clearing
		// innerHTML before reuse would destroy this node mid-update.
		hydrate(Label, { text: 'two' }, {}, { client: 'only' });
		flushSync(() => {});

		expect(island.querySelector('#label')).toBe(label);
		expect(label?.isConnected).toBe(true);
		expect(label?.textContent).toBe('two');
	});

	it('creates a fresh root after astro:unmount instead of reusing a dead one', () => {
		const island = document.createElement('div');
		island.setAttribute('ssr', '');
		document.body.append(island);

		const hydrate = createHydrator(island);
		hydrate(Label, { text: 'first' }, {}, { client: 'only' });
		expect(island.querySelector('#label')?.textContent).toBe('first');

		island.dispatchEvent(new Event('astro:unmount'));

		// Astro may remount the same element after view transitions / teardown.
		island.setAttribute('ssr', '');
		expect(() => {
			hydrate(Label, { text: 'remounted' }, {}, { client: 'only' });
		}).not.toThrow();
		expect(island.querySelector('#label')?.textContent).toBe('remounted');
	});
});
