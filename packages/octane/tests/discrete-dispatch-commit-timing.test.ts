// When does a delegated discrete event COMMIT the state its handlers scheduled,
// as seen from outside the Octane root? React's `batchedUpdates`
// (react-dom-bindings ReactDOMUpdateBatching.js) flushes synchronously at the
// end of the outermost event handler only when a controlled form control has a
// pending state restore; every other discrete update lands in the sync-lane
// microtask. Native listeners registered by other code, and the script that
// dispatched the event, therefore observe the pre-commit DOM until the
// dispatching script yields. Octane follows the same policy; the React 19
// oracle at the bottom runs the identical scenario through react-dom so the two
// cannot drift apart unnoticed.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { act, mount } from './_helpers';
import {
	Counter,
	FunctionalCounter,
	SyncCounter,
	NestedSubmit,
	ControlledInput,
	RejectedInput,
	ResetForm,
} from './_fixtures/dispatch-commit-timing.tsrx';

const nativeListeners: Array<() => void> = [];
function listen(type: string, fn: (e: Event) => void, capture = false): void {
	document.addEventListener(type, fn, capture);
	nativeListeners.push(() => document.removeEventListener(type, fn, capture));
}
afterEach(() => {
	for (const off of nativeListeners.splice(0)) off();
});

function setNativeValue(input: HTMLInputElement, value: string): void {
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
}

describe('discrete dispatch commit timing (React batchedUpdates parity)', () => {
	it('a script-dispatched click commits in the microtask, not before dispatchEvent returns', async () => {
		const r = mount(Counter);
		const btn = r.find('#counter') as HTMLButtonElement;
		const seenByOutsideListener: string[] = [];
		// An outside event system further along the propagation path.
		listen('click', () => seenByOutsideListener.push(btn.textContent!));

		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(seenByOutsideListener).toEqual(['0']);
		expect(btn.textContent).toBe('0');

		await act(async () => {});
		expect(btn.textContent).toBe('1');
		r.unmount();
	});

	it('back-to-back script dispatches batch into one commit after the script yields', async () => {
		const r = mount(FunctionalCounter);
		const btn = r.find('#fcounter') as HTMLButtonElement;
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('0');
		await act(async () => {});
		expect(btn.textContent).toBe('3');
		r.unmount();
	});

	it('a submit dispatched from inside a click handler sees the click update still pending', async () => {
		const r = mount(NestedSubmit);
		const status = r.find('#status') as HTMLOutputElement;
		const observed: string[] = [];
		// Outside form machinery (capture and bubble) reading the DOM at submit time.
		listen('submit', () => observed.push('capture:' + status.textContent), true);
		listen('submit', () => observed.push('bubble:' + status.textContent));

		(r.find('#nested-btn') as HTMLButtonElement).dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(observed).toEqual(['capture:idle', 'bubble:idle']);
		expect(status.textContent).toBe('idle');
		await act(async () => {});
		expect(status.textContent).toBe('submitting');
		r.unmount();
	});

	it('flushSync inside a handler still commits before the dispatch returns', () => {
		const r = mount(SyncCounter);
		const btn = r.find('#sync') as HTMLButtonElement;
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('1');
		r.unmount();
	});

	it('the mount helper click (flushSync-wrapped) observes the commit synchronously', () => {
		const r = mount(Counter);
		r.click('#counter');
		expect(r.find('#counter').textContent).toBe('1');
		r.unmount();
	});

	it('an accepted controlled edit commits at the dispatch boundary', () => {
		const r = mount(ControlledInput);
		const input = r.find('#accepted') as HTMLInputElement;
		const mirror = r.find('#mirror') as HTMLOutputElement;
		setNativeValue(input, 'ab');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		// A controlled restore was armed, so the boundary committed synchronously:
		// the DOM keeps the accepted edit and the mirror text already reflects it.
		expect(input.value).toBe('ab');
		expect(mirror.textContent).toBe('ab');
		r.unmount();
	});

	it('an unheard controlled edit snaps back at the dispatch boundary', () => {
		const r = mount(RejectedInput);
		const input = r.find('#rejected') as HTMLInputElement;
		setNativeValue(input, 'fixed!');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(input.value).toBe('fixed');
		r.unmount();
	});

	it('a reset-button click that also clears controlled state leaves the control dirty, like React', async () => {
		const r = mount(ResetForm);
		const input = r.find('#reset-input') as HTMLInputElement;
		const reset = r.find('#reset-btn') as HTMLButtonElement;
		setNativeValue(input, 'test');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(input.value).toBe('test');
		expect(input.getAttribute('value')).toBe('test');
		// The handler's update is queued; the click's default action then resets the
		// form, so the control follows its still-mirrored attribute until the commit.
		reset.click();
		expect(input.value).toBe('test');
		await act(() => {});
		expect(input.value).toBe('');
		expect(input.getAttribute('value')).toBe('');
		// The commit wrote the property before syncing the attribute, so the control
		// is dirty again: a later attribute change must not drag the live value.
		input.setAttribute('value', 'drift');
		expect(input.value).toBe('');
		r.unmount();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// React 19 oracle — the same observations through react-dom, so a change in
// either renderer's boundary policy shows up as a mismatch here.
// ─────────────────────────────────────────────────────────────────────────────

async function mountReact(
	element: React.ReactElement,
): Promise<{ host: HTMLElement; unmount(): void }> {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const root = createReactRoot(host);
	// Outside act(): this oracle observes React's ordinary microtask scheduling.
	root.render(element);
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	return {
		host,
		unmount() {
			root.unmount();
			host.remove();
		},
	};
}

function ReactCounter() {
	const [n, setN] = React.useState(0);
	return React.createElement('button', { id: 'rc', onClick: () => setN((v) => v + 1) }, String(n));
}

function ReactControlled() {
	const [value, setValue] = React.useState('a');
	return React.createElement(
		'div',
		null,
		React.createElement('input', {
			id: 'ri',
			value,
			onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
		}),
		React.createElement('output', { id: 'rm' }, value),
	);
}

function ReactResetForm() {
	const [value, setValue] = React.useState('');
	return React.createElement(
		'form',
		{ id: 'rrf', onSubmit: (e: React.FormEvent) => e.preventDefault() },
		React.createElement('input', {
			id: 'rri',
			value,
			onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
		}),
		React.createElement(
			'button',
			{ id: 'rrb', type: 'reset', onClick: () => setValue('') },
			'reset',
		),
	);
}

describe('React 19 oracle for the same observations', () => {
	it('a script-dispatched click commits after the dispatching script yields', async () => {
		const m = await mountReact(React.createElement(ReactCounter));
		const btn = m.host.querySelector('#rc') as HTMLButtonElement;
		const seenByOutsideListener: string[] = [];
		listen('click', () => seenByOutsideListener.push(btn.textContent!));
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(seenByOutsideListener).toEqual(['0', '0']);
		expect(btn.textContent).toBe('0');
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(btn.textContent).toBe('2');
		m.unmount();
	});

	it('an accepted controlled edit commits at the dispatch boundary', async () => {
		const m = await mountReact(React.createElement(ReactControlled));
		const input = m.host.querySelector('#ri') as HTMLInputElement;
		setNativeValue(input, 'ab');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(input.value).toBe('ab');
		expect(m.host.querySelector('#rm')!.textContent).toBe('ab');
		m.unmount();
	});

	it('a reset-button click that also clears controlled state leaves the control dirty', async () => {
		const m = await mountReact(React.createElement(ReactResetForm));
		const input = m.host.querySelector('#rri') as HTMLInputElement;
		const reset = m.host.querySelector('#rrb') as HTMLButtonElement;
		setNativeValue(input, 'test');
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(input.value).toBe('test');
		expect(input.getAttribute('value')).toBe('test');
		reset.click();
		expect(input.value).toBe('test');
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(input.value).toBe('');
		expect(input.getAttribute('value')).toBe('');
		input.setAttribute('value', 'drift');
		expect(input.value).toBe('');
		m.unmount();
	});
});
