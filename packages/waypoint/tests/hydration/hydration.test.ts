import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { ServerWaypoint } from '../ssr/_fixtures/server.tsrx';

const SERVER_HTML =
	'<main><!--[--><!--[--><span style="font-size:0;"></span><!--]--><!--]--><!--[--><!--[--><div id="custom">Marker</div><!--]--><!--]--></main>';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('@octanejs/waypoint hydration', () => {
	// @parity-case hydration:marker-identity
	it('adopts default and custom server marker nodes', () => {
		vi.useFakeTimers();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.append(container);
		const marker = container.querySelector('span');
		const custom = container.querySelector('#custom');

		const root = hydrateRoot(container, ServerWaypoint);
		flushSync(() => {});
		drainPassiveEffects();

		expect(container.querySelector('span')).toBe(marker);
		expect(container.querySelector('#custom')).toBe(custom);
		expect(error).not.toHaveBeenCalled();
		root.unmount();
		vi.useRealTimers();
	});
});
