import { createElement, createRoot, flushSync, hydrateRoot, type Root } from 'octane';
import { RadioMoves, RadioSwap, Values, type InputProps } from './Inputs.tsrx';
import { SignalInputs, SignalRadio } from './SignalInputs.tsrx';
import { initializeHydrationEventCapture } from 'octane/hydration';
import { createScope } from 'octane/signals';

function DescriptorValues({ next, read }: InputProps) {
	return createElement(
		'form',
		{ id: 'values' },
		createElement('input', {
			name: 'max',
			type: 'range',
			get value() {
				return read('value', next ? 150 : 50);
			},
			get max() {
				return read('max', next ? 200 : 100);
			},
			readOnly: true,
		}),
		createElement('input', {
			name: 'label',
			value: next ? 'hello' : '12',
			type: next ? 'text' : 'number',
			readOnly: true,
		}),
	);
}

const components = { Values, DescriptorValues, RadioSwap, RadioMoves };
const host = document.querySelector('#app')!;

function snapshot() {
	return {
		forms: Object.fromEntries(
			Array.from(document.forms, (form) => [form.id, Object.fromEntries(new FormData(form))]),
		),
		checked: Array.from(host.querySelectorAll('input[type=radio]'), (input) => ({
			id: input.id,
			checked: (input as HTMLInputElement).checked,
		})),
	};
}

function runInputUpdate(component: keyof typeof components, markup?: string) {
	const Body = components[component];
	const reads: string[] = [];
	const read: InputProps['read'] = (prop, value) => {
		reads.push(prop);
		return value;
	};
	const initial = { next: false, read };
	let root: Root;
	let original: HTMLInputElement[];
	if (markup === undefined) {
		root = createRoot(host);
		flushSync(() => root.render(Body, initial));
		original = Array.from(host.querySelectorAll('input'));
	} else {
		host.innerHTML = markup;
		original = Array.from(host.querySelectorAll('input'));
		const label = host.querySelector<HTMLInputElement>('[name="label"]');
		if (label !== null) label.value = '7';
		else original[0].checked = false;
		root = hydrateRoot(host, Body, initial);
	}
	const before = snapshot();
	const initialReads = reads.splice(0);
	flushSync(() => root.render(Body, { next: true, read }));
	const after = snapshot();
	const values = host.querySelector<HTMLFormElement>('#values');
	values?.reset();
	const resetValues = values === null ? null : Object.fromEntries(new FormData(values));
	const updated = Array.from(host.querySelectorAll('input'));
	const keptInputs =
		updated.length === original.length &&
		updated.every((input, index) => input === original[index]);
	root.unmount();
	return { before, after, resetValues, keptInputs, initialReads, reads };
}

function runSignalUpdate(markup?: string) {
	class SignalRange extends HTMLInputElement {}
	customElements.define('ordered-signal-range', SignalRange, { extends: 'input' });
	const scope = createScope({ scopeKey: 'ordered-inputs' });
	const value$ = scope.signal$('value', '150');
	const limit$ = scope.signal$('limit', 100);
	const props = { value$, limit$, max: 100 };
	const submitted = () => snapshot().forms['signals'];
	let root: Root;
	let adopted: HTMLInputElement | null = null;
	if (markup !== undefined) {
		host.innerHTML = markup;
		adopted = host.querySelector('input');
		root = hydrateRoot(host, SignalInputs, props);
	} else {
		root = createRoot(host);
		flushSync(() => root.render(SignalInputs, props));
	}
	const upgraded = host.querySelector('[name="model"]') instanceof SignalRange;
	const before = submitted();
	flushSync(() => root.render(SignalInputs, { ...props, max: 200 }));
	const changedMax = submitted();
	flushSync(() => limit$.set(200));
	const changedLimit = submitted();
	flushSync(() =>
		root.render(SignalInputs, {
			...props,
			primary$: scope.signal$('replacement', '275'),
			max: 300,
		}),
	);
	const changedModelAndMax = submitted();
	const keptInput =
		markup === undefined || (adopted !== null && host.querySelector('input') === adopted);
	root.unmount();
	scope.dispose();
	return { before, changedMax, changedLimit, changedModelAndMax, keptInput, upgraded };
}

function moveRadioBeforeEditAdoption(markup: string) {
	initializeHydrationEventCapture(document);
	host.innerHTML = markup;
	const form = host.querySelector('form')!;
	const moving = form.querySelector('input')!;
	moving.click();
	const before = [...new FormData(form)];
	const scope = createScope({ scopeKey: 'ordered-inputs' });
	const props = { name: 'source', value$: scope.signal$('radio', 'moving') };
	const root = hydrateRoot(host, SignalRadio, props);
	flushSync(() => root.render(SignalRadio, { ...props, name: 'destination' }));
	const after = [...new FormData(form)];
	const name = moving.name;
	root.unmount();
	scope.dispose();
	return { before, after, name };
}

window.moveRadioBeforeEditAdoption = moveRadioBeforeEditAdoption;
window.runInputUpdate = runInputUpdate;
window.runSignalUpdate = runSignalUpdate;

declare global {
	interface Window {
		moveRadioBeforeEditAdoption: typeof moveRadioBeforeEditAdoption;
		runInputUpdate: typeof runInputUpdate;
		runSignalUpdate: typeof runSignalUpdate;
	}
}
