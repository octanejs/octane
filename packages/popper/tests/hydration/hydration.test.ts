import { describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { ServerPopperHarness } from '../runtime/_fixtures/Harness.tsrx';

const SERVER_HTML =
	'<!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><button id="reference">reference</button><!--]--><!--]--><!--[--><!--[--><div id="popper" style="position:absolute;left:0;top:0;" data-placement="top"><div id="arrow" style="position:absolute;"></div></div><!--]--><!--]--><!--]--><!--]--><!--]--><!--]-->';

describe('@octanejs/popper hydration', () => {
	// @parity-case adapted:popper-hydration
	it('adopts server nodes and activates Popper/ref wiring after hydration', async () => {
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.appendChild(container);
		const reference = container.querySelector('#reference');
		const popper = container.querySelector('#popper');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, ServerPopperHarness);
		drainPassiveEffects();
		flushSync(() => {});
		await Promise.resolve();
		expect(container.querySelector('#reference')).toBe(reference);
		expect(container.querySelector('#popper')).toBe(popper);
		expect(error).not.toHaveBeenCalled();
		expect((popper as HTMLElement).style.position).toBe('absolute');
		root.unmount();
		container.remove();
	});
});
