import { describe, it, expect, vi } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { flushSync, startTransition, requestFormReset, useDebugValue } from '../src/index.js';
import { ActionForm } from './_fixtures/actions.tsrx';
import { ControlledForm } from './conformance/_fixtures/controlled-forms.tsrx';

// React DOM's requestFormReset(form) — reset the form's uncontrolled fields
// when the enclosing transition/action settles. Plus the trivial React-parity
// addition useDebugValue.

function deferred<T = void>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function tick() {
	await Promise.resolve();
	await Promise.resolve();
	flushSync(() => {});
	flushEffects();
}

async function settle() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
	flushSync(() => {});
	flushEffects();
}

function submit(container: HTMLElement) {
	const form = container.querySelector('form') as HTMLFormElement;
	flushSync(() => {
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
	});
	return form;
}

describe('requestFormReset', () => {
	it('defers the reset to the end of a useActionState action (which never auto-resets)', async () => {
		const d = deferred();
		let form!: HTMLFormElement;
		const action = async (_prev: string, fd: FormData) => {
			requestFormReset(form);
			await d.promise;
			return 'done:' + fd.get('name');
		};
		const r = mount(ActionForm, { action, initial: 'init' });
		form = r.find('form') as HTMLFormElement;
		(r.find('#field') as HTMLInputElement).value = 'alice';
		submit(r.container);
		await tick();
		// Still pending — the typed value must survive until the action settles.
		expect((r.find('#field') as HTMLInputElement).value).toBe('alice');

		d.resolve();
		await settle();
		expect(r.find('#state').textContent).toBe('done:alice');
		// The requested reset fired on settle (default value: empty).
		expect((r.find('#field') as HTMLInputElement).value).toBe('');
		r.unmount();
	});

	it('defers the reset requested inside a manual async startTransition', async () => {
		const form = document.createElement('form');
		const input = document.createElement('input');
		input.setAttribute('value', 'default');
		form.appendChild(input);
		document.body.appendChild(form);
		input.value = 'typed';

		const d = deferred();
		startTransition(async () => {
			requestFormReset(form);
			await d.promise;
		});
		await tick();
		expect(input.value).toBe('typed'); // not yet — action still in flight

		d.resolve();
		await settle();
		expect(input.value).toBe('default'); // form.reset() restored defaultValue
		form.remove();
	});

	// Controlled components (2026-07-08): form.reset() restores DEFAULTS — for a
	// controlled checkbox that's the INITIAL state (the checked attribute never
	// updates) — so an octane-driven reset must reassert the rendered state
	// afterwards, like React applying queued resets.
	it('reasserts controlled fields after the deferred reset', async () => {
		const r = mount(ControlledForm, { on: false, onClick: () => {} });
		const form = r.find('form') as HTMLFormElement;
		const input = r.find('#cf') as HTMLInputElement;
		r.update(ControlledForm, { on: true, onClick: () => {} });
		expect(input.checked).toBe(true);
		expect(input.defaultChecked).toBe(false); // the reset target diverges

		const d = deferred();
		startTransition(async () => {
			requestFormReset(form);
			await d.promise;
		});
		await tick();
		d.resolve();
		await settle();
		// The native reset restored the initial (unchecked) state; the
		// controlled reassert snapped the rendered state back.
		expect(input.checked).toBe(true);
		r.unmount();
	});

	it('warns and resets immediately when called outside a transition or action', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const form = document.createElement('form');
		const input = document.createElement('input');
		input.setAttribute('value', 'default');
		form.appendChild(input);
		document.body.appendChild(form);
		input.value = 'typed';

		requestFormReset(form);
		expect(input.value).toBe('default');
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('outside a transition or action'));
		spy.mockRestore();
		form.remove();
	});
});

describe('useDebugValue', () => {
	it('useDebugValue is a no-op (callable anywhere, any args)', () => {
		expect(() => useDebugValue('label')).not.toThrow();
		expect(() => useDebugValue({ x: 1 }, (v: any) => v.x)).not.toThrow();
		expect(useDebugValue('label')).toBeUndefined();
	});
});
