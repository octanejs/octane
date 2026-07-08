/**
 * `@testing-library/user-event` compatibility — the library is framework-
 * agnostic (it dispatches REAL native events and never imports React), which
 * fits octane's native-event model directly: no compatibility layer needed.
 * This slice pins the contract so a user-event or octane upgrade that breaks
 * the pairing is caught here. Mirrors react-testing-library@be9d81d
 * src/__tests__/events.js interaction shapes via userEvent instead.
 */
import { describe, it, expect, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, cleanup, fireEvent, screen } from '@octanejs/testing-library';
import {
	Counter,
	InputEcho,
	ControlledInputIgnoring,
	ControlledInputAccepting,
} from './_fixtures/counter.tsrx';

afterEach(cleanup);

describe('@testing-library/user-event compatibility', () => {
	it('click drives onClick state updates, committed before assertions', async () => {
		const user = userEvent.setup();
		render(Counter);
		const button = screen.getByRole('button');
		expect(button.textContent).toBe('Count: 0');
		await user.click(button);
		expect(button.textContent).toBe('Count: 1');
		await user.dblClick(button);
		expect(button.textContent).toBe('Count: 3');
	});

	it('type() fires native input events that onInput observes per keystroke', async () => {
		const user = userEvent.setup();
		render(InputEcho);
		const input = screen.getByRole('textbox') as HTMLInputElement;
		await user.type(input, 'abc');
		// This fixture's input is UNCONTROLLED (no `value` prop), so the typed
		// value sticks because nothing controls it; the onInput-driven echo
		// committed after each keystroke.
		expect(input.value).toBe('abc');
		expect(screen.getByTestId('echo').textContent).toBe('abc');
	});

	it('a controlled input whose handler ignores the event snaps back (React + RTL parity)', async () => {
		const user = userEvent.setup();
		render(ControlledInputIgnoring);
		const input = screen.getByRole('textbox') as HTMLInputElement;
		expect(input.value).toBe('locked');
		// `value={state}` is live controlled and onInput never updates the state,
		// so the runtime reasserts the rendered value after every discrete-event
		// flush — each keystroke's edit snaps back, exactly like React + RTL.
		await user.type(input, 'abc');
		expect(input.value).toBe('locked');
		// fireEvent.change (set `.value`, then dispatch) snaps back the same way.
		fireEvent.change(input, { target: { value: 'mutated' } });
		expect(input.value).toBe('locked');
	});

	it('a controlled input whose handler updates state accepts typing', async () => {
		const user = userEvent.setup();
		render(ControlledInputAccepting);
		const input = screen.getByRole('textbox') as HTMLInputElement;
		await user.type(input, 'abc');
		// onInput feeds the controlling state, so the committed value matches the
		// DOM and the reassert pass is a no-op: the typed value sticks.
		expect(input.value).toBe('abc');
		expect(screen.getByTestId('echo').textContent).toBe('abc');
	});

	it('keyboard() reaches native onKeyDown handlers', async () => {
		const user = userEvent.setup();
		render(InputEcho);
		const input = screen.getByRole('textbox') as HTMLInputElement;
		input.focus();
		await user.keyboard('x');
		expect(input.value).toBe('x');
		expect(screen.getByTestId('echo').textContent).toBe('x');
	});
});
