import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_HYDRATION_PROMISE, act, flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { Controls, SuspendingControls } from './_fixtures/form-control-value-mismatch.tsrx';

// A form control's value or checked state that differs between the server and
// the client is not a hydration mismatch: the server nodes are adopted with no
// fallback, warning or recoverable error. The client value becomes the
// control's reset baseline (the `value` attribute, the textarea's content, the
// `checked` attribute), and the live value follows it unless the user changed
// the control before hydration. The expectations of every mismatching case are
// React 19.2.7's outcome in development and production (hydration oracle),
// except the one marked OCTANE DIVERGENCE.

const server = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/form-control-value-mismatch.tsrx',
) as { Controls: unknown; SuspendingControls: unknown };

const SERVER_PROPS = { side: 'server', on: true };
const CLIENT_PROPS = { side: 'client', on: false };

type Fields = {
	input: HTMLInputElement;
	textarea: HTMLTextAreaElement;
	checkbox: HTMLInputElement;
	defaultCheckbox: HTMLInputElement;
};

let container: HTMLElement;
let root: ReturnType<typeof hydrateRoot> | null;
let recoverable: unknown[];
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = null;
	recoverable = [];
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	root?.unmount();
	container.remove();
	errSpy.mockRestore();
});

function fields(): Fields {
	return {
		input: container.querySelector('#input') as HTMLInputElement,
		textarea: container.querySelector('#textarea') as HTMLTextAreaElement,
		checkbox: container.querySelector('#checkbox') as HTMLInputElement,
		defaultCheckbox: container.querySelector('#default-checkbox') as HTMLInputElement,
	};
}

function serverRender(): Fields {
	const { html } = Server.renderToString(server.Controls as never, SERVER_PROPS as never);
	container.innerHTML = html;
	return fields();
}

// Server-render, let `edit` act as the user before the client loads, then
// hydrate with the client props and check that every server node was adopted.
function hydrate(edit: (served: Fields) => void = () => {}): Fields {
	const served = serverRender();
	expect(served.input.value).toBe('server');
	expect(served.textarea.value).toBe('server');
	expect(served.checkbox.checked).toBe(true);
	expect(served.defaultCheckbox.checked).toBe(true);
	edit(served);

	root = hydrateRoot(container, Controls, CLIENT_PROPS, {
		onRecoverableError: (error: unknown) => recoverable.push(error),
	});
	flushSync(() => {});

	const hydrated = fields();
	for (const key of Object.keys(served) as Array<keyof Fields>)
		expect(hydrated[key]).toBe(served[key]);
	expect(recoverable).toEqual([]);
	expect(errSpy).not.toHaveBeenCalled();
	return served;
}

describe('hydrating a form control value the client renders differently', () => {
	it('projects the client value onto an input the user has not edited', () => {
		const { input } = hydrate();
		expect(input.value).toBe('client');
		expect(input.getAttribute('value')).toBe('client');
	});

	it("keeps an input's pre-hydration edit and moves only its value attribute", () => {
		const { input } = hydrate(({ input }) => {
			input.value = 'typed';
		});
		expect(input.value).toBe('typed');
		expect(input.getAttribute('value')).toBe('client');
	});

	it('projects the client value onto a textarea the user has not edited', () => {
		const { textarea } = hydrate();
		expect(textarea.value).toBe('client');
		expect(textarea.textContent).toBe('client');
	});

	it("keeps a textarea's pre-hydration edit and moves only its content", () => {
		const { textarea } = hydrate(({ textarea }) => {
			textarea.value = 'typed';
		});
		// OCTANE DIVERGENCE: React 19.2.7's initTextarea copies the new content into
		// the live value, discarding the edit. Octane keeps pre-hydration input in a
		// textarea as it does in an input, until the first commit or discrete event.
		expect(textarea.value).toBe('typed');
		expect(textarea.textContent).toBe('client');
	});

	it('moves the checked attribute of an unedited checkbox but keeps its live state', () => {
		const { checkbox } = hydrate();
		expect(checkbox.hasAttribute('checked')).toBe(false);
		expect(checkbox.checked).toBe(true);
	});

	it("keeps a checkbox's pre-hydration change and moves its checked attribute", () => {
		const { checkbox } = hydrate(({ checkbox }) => {
			checkbox.checked = false;
		});
		expect(checkbox.hasAttribute('checked')).toBe(false);
		expect(checkbox.checked).toBe(false);
	});

	it('moves the checked attribute of an uncontrolled checkbox but keeps its live state', () => {
		const { defaultCheckbox } = hydrate();
		expect(defaultCheckbox.hasAttribute('checked')).toBe(false);
		expect(defaultCheckbox.checked).toBe(true);
	});

	it('reasserts the controlled client values over pre-hydration edits at the first commit', () => {
		const { input, textarea, checkbox } = hydrate((served) => {
			served.input.value = 'typed';
			served.textarea.value = 'typed';
		});
		flushSync(() => root!.render(Controls, CLIENT_PROPS));
		expect(input.value).toBe('client');
		expect(textarea.value).toBe('client');
		expect(checkbox.checked).toBe(false);
	});

	it('projects the client value after a suspended hydration attempt retries', async () => {
		// An external thenable carries no server seed, so the attempt suspends after
		// adopting the controls, rolls back, and adopts them again on its retry.
		const ready = (value: PromiseLike<string>) =>
			Object.assign(value, { [EXTERNAL_HYDRATION_PROMISE]: true as const });
		const { html } = Server.renderToString(
			server.SuspendingControls as never,
			{
				...SERVER_PROPS,
				ready: Object.assign(ready(Promise.resolve('ready')), {
					status: 'fulfilled',
					value: 'ready',
				}),
			} as never,
		);
		container.innerHTML = html;
		const served = fields();
		let resolve!: (value: string) => void;
		const pending = ready(new Promise<string>((next) => (resolve = next)));

		root = hydrateRoot(
			container,
			SuspendingControls,
			{ ...CLIENT_PROPS, ready: pending },
			{ onRecoverableError: (error: unknown) => recoverable.push(error) },
		);
		flushSync(() => {});
		await act(async () => resolve('ready'));

		const { input, textarea, checkbox, defaultCheckbox } = fields();
		expect(input).toBe(served.input);
		expect(textarea).toBe(served.textarea);
		expect(container.querySelector('#ready')!.textContent).toBe('ready');
		expect(recoverable).toEqual([]);
		expect(input.value).toBe('client');
		expect(input.getAttribute('value')).toBe('client');
		expect(textarea.value).toBe('client');
		expect(textarea.textContent).toBe('client');
		expect(checkbox.hasAttribute('checked')).toBe(false);
		expect(checkbox.checked).toBe(true);
		expect(defaultCheckbox.hasAttribute('checked')).toBe(false);
		expect(defaultCheckbox.checked).toBe(true);
	});

	it('writes nothing to the DOM when the client renders the server values', () => {
		const served = serverRender();
		const writes = new MutationObserver(() => {});
		writes.observe(container, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true,
		});

		root = hydrateRoot(container, Controls, SERVER_PROPS);
		flushSync(() => {});

		expect(writes.takeRecords()).toEqual([]);
		writes.disconnect();
		expect(served.input.value).toBe('server');
		expect(served.textarea.value).toBe('server');
		expect(served.checkbox.checked).toBe(true);
		expect(served.defaultCheckbox.checked).toBe(true);
	});
});
