import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { HydrationForm } from '../_fixtures/hydration.tsrx';

const SERVER_HTML =
	'<form><input id="name" name="[&quot;name&quot;]" value="Ada"/><output id="name-output">Ada</output></form>';

let container: HTMLDivElement;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	container = document.createElement('div');
	container.innerHTML = SERVER_HTML;
	document.body.appendChild(container);
	error = vi.spyOn(console, 'error');
});

afterEach(() => {
	expect(error.mock.calls).toEqual([]);
	error.mockRestore();
	container.remove();
});

describe('@octanejs/formisch hydration', () => {
	it('adopts the server input and activates native input updates once', () => {
		const input = container.querySelector('#name');
		const output = container.querySelector('#name-output');
		const root = hydrateRoot(container, HydrationForm, { initial: 'Ada' });

		flushSync(() => {});
		drainPassiveEffects();
		flushSync(() => {});
		expect(container.querySelector('#name')).toBe(input);
		expect(container.querySelector('#name-output')).toBe(output);

		(input as HTMLInputElement).value = 'Grace';
		flushSync(() => {
			input?.dispatchEvent(new InputEvent('input', { bubbles: true }));
		});
		expect(output?.textContent).toBe('Grace');
		root.unmount();
	});
});
