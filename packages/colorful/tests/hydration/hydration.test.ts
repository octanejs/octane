import { describe, expect, it, vi } from 'vitest';
import { delegateEvents, drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { HydrationHex } from './_fixtures/HydrationHarness.tsrx';

delegateEvents([
	'mousedown',
	'mouseup',
	'mousemove',
	'touchstart',
	'touchmove',
	'touchend',
	'keydown',
	'keyup',
]);

const SERVER_HTML =
	'<!--[--><!--[--><!--[--><div data-testid="hex" class="react-colorful"><!--[--><!--[-->' +
	'<div class="react-colorful__saturation" style="background-color:hsl(0, 100%, 50%);">' +
	'<!--[--><!--[--><div aria-label="Color" aria-valuetext="Saturation 100%, Brightness 100%" ' +
	'class="react-colorful__interactive" tabindex="0" role="slider"><!--[--><!--[-->' +
	'<div class="react-colorful__pointer react-colorful__saturation-pointer" style="top:0%;left:100%;">' +
	'<div class="react-colorful__pointer-fill" style="background-color:hsl(0, 100%, 50%);"></div>' +
	'</div><!--]--><!--]--></div><!--]--><!--]--></div><!--]--><!--]--><!--[--><!--[-->' +
	'<div class="react-colorful__hue react-colorful__last-control"><!--[--><!--[-->' +
	'<div aria-label="Hue" aria-valuenow="0" aria-valuemax="360" aria-valuemin="0" ' +
	'class="react-colorful__interactive" tabindex="0" role="slider"><!--[--><!--[-->' +
	'<div class="react-colorful__pointer react-colorful__hue-pointer" style="top:50%;left:0%;">' +
	'<div class="react-colorful__pointer-fill" style="background-color:hsl(0, 100%, 50%);"></div>' +
	'</div><!--]--><!--]--></div><!--]--><!--]--></div><!--]--><!--]--></div><!--]--><!--]-->' +
	'<!--]-->';

function settle() {
	// Commit the render a dispatched event left queued, then run its passive effects.
	flushSync(() => {});
	drainPassiveEffects();
}

describe('@octanejs/colorful — hydration', () => {
	// @parity-case adapted:react-colorful-hydration
	it('adopts server nodes, injects styles after mount, and becomes interactive', () => {
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.appendChild(container);
		const serverPicker = container.firstElementChild;
		const serverHue = container.querySelector('[aria-label="Hue"]');
		const onChange = vi.fn();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, HydrationHex, { onChange });
		settle();
		expect(container.firstElementChild).toBe(serverPicker);
		expect(container.querySelector('[aria-label="Hue"]')).toBe(serverHue);
		expect(error).not.toHaveBeenCalled();
		expect(
			[...document.head.querySelectorAll('style')].some((style) =>
				style.textContent?.includes('.react-colorful'),
			),
		).toBe(true);

		serverHue?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 39 }),
		);
		settle();
		expect(onChange).toHaveBeenLastCalledWith('#ff4d00');

		root.unmount();
		error.mockRestore();
		container.remove();
	});
});
