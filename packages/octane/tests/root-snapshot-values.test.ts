import { describe, expect, it } from 'vitest';
import { bagOf, clone, setText, template, type Scope } from '../src/index.js';
import { act, mount } from './_helpers.js';

function pending() {
	let resolve!: () => void;
	const promise = new Promise<void>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

describe('root snapshot values', () => {
	it('restores symbol-backed event values and removes speculative symbol values after a hold', async () => {
		const value = Symbol('value');
		const removed = Symbol('removed');
		const added = Symbol('added');
		const hidden = Symbol('hidden');
		const constant = Symbol('constant');
		const source = template('<section><p> </p><button>inspect</button><output></output></section>');
		const gate = pending();
		let held = true;
		// Binding integrations can use the compiler ABI directly. Observe the
		// accepted values through a native event, without inspecting its bag.
		function App(props: { label: string; suspend?: boolean }, scope: Scope) {
			let bindings = scope.slots[0];
			if (bindings === undefined) {
				const host = clone(source) as HTMLElement;
				const output = host.querySelector('output')!;
				bindings = {
					text: host.querySelector('p')!.firstChild,
					[value]: 'initial',
					[removed]: 'kept',
				};
				Object.defineProperty(bindings, hidden, { value: 'outside', writable: true });
				Object.defineProperty(bindings, constant, { value: NaN, enumerable: true });
				host.querySelector('button')!.addEventListener('click', () => {
					output.textContent = [
						bindings[value],
						bindings[removed],
						bindings[added] ?? 'absent',
						bindings[hidden],
						bindings[constant],
					].join(':');
				});
				bagOf(scope, host, bindings);
			}
			setText(bindings.text, props.label);
			bindings[value] = props.label;
			if (props.suspend) {
				delete bindings[removed];
				bindings[added] = 'candidate';
				bindings[hidden] = 'outside-edited';
				if (held) throw gate.promise;
			}
		}
		const root = mount(App, { label: 'initial' });
		try {
			const paragraph = root.find('p');
			root.update(App, { label: 'candidate', suspend: true });
			expect(root.find('p')).toBe(paragraph);
			expect(paragraph.textContent).toBe('initial');
			root.click('button');
			expect(root.find('output').textContent).toBe('initial:kept:absent:outside-edited:NaN');
			root.update(App, { label: 'replacement', suspend: true });
			root.click('button');
			expect(root.find('output').textContent).toBe('initial:kept:absent:outside-edited:NaN');
			held = false;
			await act(() => gate.resolve());
			expect(root.find('p')).toBe(paragraph);
			expect(paragraph.textContent).toBe('replacement');
			root.click('button');
			expect(root.find('output').textContent).toBe('replacement::candidate:outside-edited:NaN');
		} finally {
			root.unmount();
		}
	});
	it.each(['string', 'symbol'])(
		'restores %s accessor values while leaving non-enumerable and inherited state outside the snapshot',
		async (kind) => {
			const field = kind === 'symbol' ? Symbol('value') : 'value';
			const source = template(
				'<section><p> </p><button>inspect</button><output></output></section>',
			);
			const gate = pending();
			let held = true;
			function App(props: { label: string; suspend?: boolean }, scope: Scope) {
				let bindings = scope.slots[0];
				if (bindings === undefined) {
					const host = clone(source) as HTMLElement;
					const output = host.querySelector('output')!;
					let value = 'initial';
					bindings = Object.create({ inherited: 'outside' });
					bindings.text = host.querySelector('p')!.firstChild;
					bindings.removed = 'kept';
					Object.defineProperty(bindings, field, {
						enumerable: true,
						get: () => value,
						set: (next) => {
							value = next;
						},
					});
					Object.defineProperty(bindings, 'hidden', { value: 'outside', writable: true });
					host.querySelector('button')!.addEventListener('click', () => {
						output.textContent = [
							bindings[field],
							bindings.removed,
							bindings.added ?? 'absent',
							bindings.hidden,
							bindings.inherited,
						].join(':');
					});
					bagOf(scope, host, bindings);
				}
				setText(bindings.text, props.label);
				bindings[field] = props.label;
				if (props.suspend) {
					delete bindings.removed;
					bindings.added = 'candidate';
					bindings.hidden = 'outside-edited';
					bindings.inherited = 'shadow';
					if (held) throw gate.promise;
				}
			}
			const root = mount(App, { label: 'initial' });
			try {
				root.update(App, { label: 'candidate', suspend: true });
				root.click('button');
				expect(root.find('output').textContent).toBe('initial:kept:absent:outside-edited:outside');
				held = false;
				await act(() => gate.resolve());
				root.click('button');
				expect(root.find('output').textContent).toBe('candidate::candidate:outside-edited:shadow');
			} finally {
				root.unmount();
			}
		},
	);

	it('restores the accepted contents and length of array-backed binding integrations', async () => {
		const source = template('<section><p> </p><button>inspect</button><output></output></section>');
		const gate = pending();
		let held = true;
		function App(props: { label: string; suspend?: boolean }, scope: Scope) {
			let bindings = scope.slots[0];
			if (bindings === undefined) {
				const host = clone(source) as HTMLElement;
				const output = host.querySelector('output')!;
				bindings = ['initial', 'kept'];
				bindings.text = host.querySelector('p')!.firstChild;
				host.querySelector('button')!.addEventListener('click', () => {
					output.textContent = bindings.join(':');
				});
				bagOf(scope, host, bindings);
			}
			setText(bindings.text, props.label);
			bindings[0] = props.label;
			if (props.suspend) {
				bindings.length = 1;
				bindings[3] = 'candidate';
				if (held) throw gate.promise;
			}
		}
		const root = mount(App, { label: 'initial' });
		try {
			root.update(App, { label: 'candidate', suspend: true });
			root.click('button');
			expect(root.find('output').textContent).toBe('initial:kept');
			held = false;
			await act(() => gate.resolve());
			root.click('button');
			expect(root.find('output').textContent).toBe('candidate:::candidate');
		} finally {
			root.unmount();
		}
	});
});
