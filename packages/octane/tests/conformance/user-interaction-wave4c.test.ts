import { describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/user-interaction-wave4c.tsrx';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/user-interaction-wave4c.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);

function connectedContainer(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	return container;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	const prototype =
		element instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
}

function setNativeSelectValue(element: HTMLSelectElement, value: string): void {
	Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(element, value);
}

describe('conformance: controlled fields use native edit events', () => {
	type ControlledField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
	type ClientMode = 'client' | 'hydrate-match' | 'hydrate-mismatch';

	function exercisesAllClientModes(
		component: keyof typeof client,
		selector: string,
		assertInitial: (field: ControlledField) => void,
		driveEdit: (field: ControlledField) => void,
		assertChanged: (field: ControlledField) => void,
	): void {
		for (const mode of ['client', 'hydrate-match', 'hydrate-mismatch'] as const) {
			const container = connectedContainer();
			const onEvent = vi.fn();
			const props = { onEvent };
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof createRoot> | undefined;
			let serverField: Element | null = null;
			try {
				if (mode === 'client') {
					root = createRoot(container);
					root.render(client[component], props);
				} else {
					container.innerHTML =
						mode === 'hydrate-match'
							? renderToString(server[component], props).html
							: '<div id="bad-server-field">wrong</div>';
					serverField = container.firstElementChild;
					root = hydrateRoot(container, client[component], props);
				}
				flushSync(() => {});

				const field = container.querySelector(selector) as ControlledField;
				expect(field).not.toBeNull();
				if (mode === 'hydrate-match') expect(field).toBe(serverField);
				if (mode === 'hydrate-mismatch') {
					expect(container.querySelector('#bad-server-field')).toBeNull();
				}
				assertInitial(field);

				flushSync(() => driveEdit(field));

				expect(onEvent).toHaveBeenCalledTimes(1);
				assertChanged(field);
				const mismatches = error.mock.calls.filter((call) =>
					String(call[0]).includes('hydration mismatch'),
				);
				if (mode === 'hydrate-mismatch' && process.env.OCTANE_TEST_COMPILE_MODE !== 'prod') {
					expect(mismatches.length).toBeGreaterThan(0);
				} else {
					expect(mismatches).toEqual([]);
				}
			} finally {
				root?.unmount();
				error.mockRestore();
				container.remove();
			}
		}
	}

	// React uses its synthetic onChange normalization. Octane's adaptation uses the
	// platform input event for per-keystroke text edits in all three client modes.
	// Per ReactDOMServerIntegrationUserInteraction-test.js:159.
	it('a controlled text input', () => {
		exercisesAllClientModes(
			'ControlledTextInput',
			'#controlled-text-input',
			(field) => expect((field as HTMLInputElement).value).toBe('Hello'),
			(field) => {
				setNativeValue(field as HTMLInputElement, 'Goodbye');
				field.dispatchEvent(new Event('input', { bubbles: true }));
			},
			(field) => expect((field as HTMLInputElement).value).toBe('Goodbye'),
		);
	});

	// Per ReactDOMServerIntegrationUserInteraction-test.js:187.
	it('a controlled textarea', () => {
		exercisesAllClientModes(
			'ControlledTextarea',
			'#controlled-textarea',
			(field) => expect((field as HTMLTextAreaElement).value).toBe('Hello'),
			(field) => {
				setNativeValue(field as HTMLTextAreaElement, 'Goodbye');
				field.dispatchEvent(new Event('input', { bubbles: true }));
			},
			(field) => expect((field as HTMLTextAreaElement).value).toBe('Goodbye'),
		);
	});

	// Per ReactDOMServerIntegrationUserInteraction-test.js:215.
	it('a controlled checkbox', () => {
		exercisesAllClientModes(
			'ControlledCheckbox',
			'#controlled-checkbox',
			(field) => expect((field as HTMLInputElement).checked).toBe(true),
			(field) => (field as HTMLInputElement).click(),
			(field) => expect((field as HTMLInputElement).checked).toBe(false),
		);
	});

	// `change` is the select element's native commit event; no synthetic layer is involved.
	// Per ReactDOMServerIntegrationUserInteraction-test.js:237.
	it('a controlled select', () => {
		exercisesAllClientModes(
			'ControlledSelect',
			'#controlled-select',
			(field) => expect((field as HTMLSelectElement).value).toBe('Hello'),
			(field) => {
				setNativeSelectValue(field as HTMLSelectElement, 'Goodbye');
				field.dispatchEvent(new Event('change', { bubbles: true }));
			},
			(field) => expect((field as HTMLSelectElement).value).toBe('Goodbye'),
		);
	});
});

type FieldKey = 'value' | 'checked';

function preservesPreHydrationState(
	component: keyof typeof client,
	selector: string,
	key: FieldKey,
	initial: string | boolean,
	changed: string | boolean,
	props: Record<string, unknown> = {},
): void {
	const onEvent = vi.fn();
	const renderProps = { ...props, onEvent };
	const container = connectedContainer();
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	let root: ReturnType<typeof hydrateRoot> | undefined;
	try {
		container.innerHTML = renderToString(server[component], renderProps).html;
		const field = container.querySelector(selector) as
			| HTMLInputElement
			| HTMLTextAreaElement
			| HTMLSelectElement;
		expect(field[key]).toBe(initial);

		if (key === 'value' && field instanceof HTMLSelectElement) {
			setNativeSelectValue(field, changed as string);
		} else if (key === 'value') {
			setNativeValue(field as HTMLInputElement | HTMLTextAreaElement, changed as string);
		} else {
			(field as HTMLInputElement).checked = changed as boolean;
		}

		root = hydrateRoot(container, client[component], renderProps);
		flushSync(() => {});

		const adopted = container.querySelector(selector) as typeof field;
		expect(adopted).toBe(field);
		expect(adopted[key]).toBe(changed);
		expect(onEvent).not.toHaveBeenCalled();
		expect(
			error.mock.calls.filter((call) => String(call[0]).includes('hydration mismatch')),
		).toEqual([]);
	} finally {
		root?.unmount();
		error.mockRestore();
		container.remove();
	}
}

describe('conformance: hydration preserves pre-hydration controlled field state', () => {
	// OCTANE DIVERGENCE: Octane never synthesizes a change event during hydration.
	// The public React-compatible outcome is node adoption plus preservation; native
	// handlers remain idle until the user dispatches a real platform event.
	// Per ReactDOMServerIntegrationUserInteraction-test.js:341.
	it('should not blow away user-entered text on successful reconnect to a controlled checkbox', () => {
		preservesPreHydrationState(
			'ControlledCheckbox',
			'#controlled-checkbox',
			'checked',
			true,
			false,
		);
	});

	// Per ReactDOMServerIntegrationUserInteraction-test.js:379.
	it('should not blow away user-selected value on successful reconnect to an controlled select', () => {
		preservesPreHydrationState(
			'ControlledSelect',
			'#controlled-select',
			'value',
			'Hello',
			'Goodbye',
		);
	});

	// Per ReactDOMServerIntegrationUserInteraction-test.js:300.
	it('should not blow away user-entered text on successful reconnect to a controlled input', () => {
		preservesPreHydrationState(
			'ControlledTextInput',
			'#controlled-text-input',
			'value',
			'Hello',
			'Goodbye',
		);
	});

	// Per ReactDOMServerIntegrationUserInteraction-test.js:317.
	it('should not blow away user-interaction on successful reconnect to a controlled range input', () => {
		preservesPreHydrationState(
			'ControlledTextInput',
			'#controlled-text-input',
			'value',
			'0.25',
			'1',
			{ type: 'range', initialValue: '0.25' },
		);
	});

	// Per ReactDOMServerIntegrationUserInteraction-test.js:359.
	it('should not blow away user-entered text on successful reconnect to a controlled textarea', () => {
		preservesPreHydrationState(
			'ControlledTextarea',
			'#controlled-textarea',
			'value',
			'Hello',
			'Goodbye',
		);
	});
});
