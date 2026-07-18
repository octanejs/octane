import { describe, expect, it } from 'vitest';
import { act as reactAct } from 'react';
import { resolve } from 'node:path';
import { mountDifferential, type DiffMount } from './_rig.js';

const FIX = resolve(__dirname, '../_fixtures/native-change-matrix.tsrx');

// Pinned React 19.2.7 behavior source for the same-source expectations:
// - host routing/capture: https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/plugins/ChangeEventPlugin.js#L277-L342
// - wrapped setters/value transitions: https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/client/inputValueTracking.js#L54-L130

type RuntimeName = 'octane' | 'react';
type EventRecord = {
	label: string;
	type: string;
	nativeType: string;
	value: string;
	checked: boolean | null;
	cancelable: boolean;
	defaultPrevented: boolean;
};

function createLogs(): {
	logs: Record<RuntimeName, EventRecord[]>;
	record: (label: string, event: Event) => void;
} {
	const logs: Record<RuntimeName, EventRecord[]> = { octane: [], react: [] };
	return {
		logs,
		record(label, event) {
			const current = event.currentTarget as Element;
			const runtime = current.closest('[data-rt]')!.getAttribute('data-rt') as RuntimeName;
			const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
			const nativeEvent = (event as Event & { nativeEvent?: Event }).nativeEvent ?? event;
			logs[runtime].push({
				label,
				type: event.type,
				nativeType: nativeEvent.type,
				value: target.value,
				checked: 'checked' in target ? target.checked : null,
				cancelable: event.cancelable,
				defaultPrevented: event.defaultPrevented,
			});
		},
	};
}

function setNativeValue(target: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	const proto =
		target instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(target, value);
}

async function dispatchBoth(
	i: DiffMount,
	r: DiffMount,
	selector: string,
	event: () => Event,
): Promise<void> {
	i.find(selector).dispatchEvent(event());
	await reactAct(async () => {
		r.find(selector).dispatchEvent(event());
	});
}

function labels(records: EventRecord[]): string[] {
	return records.map((record) => `${record.label}:${record.nativeType}`);
}

async function assertTextEditAndCommit(
	entry: 'TextTimeline' | 'TextareaTimeline',
	selector: string,
): Promise<void> {
	const { logs, record } = createLogs();
	const d = await mountDifferential(FIX, entry, { record });

	await d.step('native-prototype edit then input', async (i, r) => {
		setNativeValue(i.find(selector) as HTMLInputElement | HTMLTextAreaElement, 'edited');
		setNativeValue(r.find(selector) as HTMLInputElement | HTMLTextAreaElement, 'edited');
		await dispatchBoth(i, r, selector, () => new InputEvent('input', { bubbles: true }));

		expect(labels(logs.octane)).toEqual(['input:capture:input', 'input:bubble:input']);
		expect(labels(logs.react)).toEqual([
			'input:capture:input',
			'input:bubble:input',
			'change:capture:input',
			'change:bubble:input',
		]);
	});

	await d.step('explicit native commit', async (i, r) => {
		await dispatchBoth(i, r, selector, () => new Event('change', { bubbles: true }));
		expect(labels(logs.octane).slice(-2)).toEqual([
			'change:capture:change',
			'change:bubble:change',
		]);
		// React already updated its value tracker at input and does not synthesize
		// a duplicate change for the later native commit.
		expect(labels(logs.react).slice(-2)).toEqual(['change:capture:input', 'change:bubble:input']);
	});

	d.unmount();
}

describe('differential: native text entry and commit events', () => {
	it('text input distinguishes per-edit input from committed change', () =>
		assertTextEditAndCommit('TextTimeline', '#matrix-text'));

	it('textarea distinguishes per-edit input from committed change', () =>
		assertTextEditAndCommit('TextareaTimeline', '#matrix-textarea'));

	it('a wrapped programmatic value write emits input but no React synthetic change', async () => {
		const { logs, record } = createLogs();
		const d = await mountDifferential(FIX, 'TextTimeline', { record });

		await d.step('tracked setter without an event', async (i, r) => {
			(i.find('input') as HTMLInputElement).value = 'programmatic';
			(r.find('input') as HTMLInputElement).value = 'programmatic';
			expect((i.find('input') as HTMLInputElement).value).toBe('programmatic');
			expect((r.find('input') as HTMLInputElement).value).toBe('programmatic');
			expect(logs.octane).toEqual([]);
			expect(logs.react).toEqual([]);
		});

		await d.step('input after tracked setter', async (i, r) => {
			await dispatchBoth(i, r, 'input', () => new InputEvent('input', { bubbles: true }));
			expect(labels(logs.octane)).toEqual(['input:capture:input', 'input:bubble:input']);
			expect(labels(logs.react)).toEqual(['input:capture:input', 'input:bubble:input']);
		});

		await d.observe('explicit native change after tracked write', async (i, r) => {
			await dispatchBoth(i, r, 'input', () => new Event('change', { bubbles: true }));
			expect(labels(logs.octane).slice(-2)).toEqual([
				'change:capture:change',
				'change:bubble:change',
			]);
			expect(labels(logs.react)).toEqual(['input:capture:input', 'input:bubble:input']);
		});

		d.unmount();
	});

	it('controlled state driven only by onChange exposes the intentional text timing split', async () => {
		const { logs, record } = createLogs();
		const d = await mountDifferential(FIX, 'TextControlledByChange', { record });

		await d.observe('edit and input', async (i, r) => {
			setNativeValue(i.find('input') as HTMLInputElement, 'edited');
			setNativeValue(r.find('input') as HTMLInputElement, 'edited');
			await dispatchBoth(i, r, 'input', () => new InputEvent('input', { bubbles: true }));

			// OCTANE DIVERGENCE: React's onChange is input-derived, while Octane
			// keeps native change semantics and restores the controlled value.
			expect((i.find('input') as HTMLInputElement).value).toBe('seed');
			expect((r.find('input') as HTMLInputElement).value).toBe('edited');
			expect(i.find('output').textContent).toBe('seed');
			expect(r.find('output').textContent).toBe('edited');
			expect(labels(logs.octane)).toEqual(['input:input']);
			expect(labels(logs.react)).toEqual(['input:input', 'change:input']);
		});

		d.unmount();
	});

	it('controlled onInput converges while onChange retains its native timing', async () => {
		const { logs, record } = createLogs();
		const d = await mountDifferential(FIX, 'TextControlledByInput', { record });

		await d.step('accept edit through input', async (i, r) => {
			setNativeValue(i.find('input') as HTMLInputElement, 'edited');
			setNativeValue(r.find('input') as HTMLInputElement, 'edited');
			await dispatchBoth(i, r, 'input', () => new InputEvent('input', { bubbles: true }));
			expect(i.find('output').textContent).toBe('edited');
			expect(r.find('output').textContent).toBe('edited');
			expect(labels(logs.octane)).toEqual(['input:input']);
			expect(labels(logs.react)).toEqual(['input:input', 'change:input']);
		});

		d.unmount();
	});

	it('select input and change converge in capture and bubble phases', async () => {
		const { logs, record } = createLogs();
		const d = await mountDifferential(FIX, 'SelectTimeline', { record });

		await d.step('pick option b', async (i, r) => {
			const iSelect = i.find('select') as HTMLSelectElement;
			const rSelect = r.find('select') as HTMLSelectElement;
			iSelect.value = 'b';
			iSelect.dispatchEvent(new InputEvent('input', { bubbles: true }));
			iSelect.dispatchEvent(new Event('change', { bubbles: true }));
			await reactAct(async () => {
				rSelect.value = 'b';
				rSelect.dispatchEvent(new InputEvent('input', { bubbles: true }));
				rSelect.dispatchEvent(new Event('change', { bubbles: true }));
			});
			expect(i.find('output').textContent).toBe('b');
			expect(r.find('output').textContent).toBe('b');
			expect(labels(logs.octane)).toEqual([
				'input:capture:input',
				'input:bubble:input',
				'change:capture:change',
				'change:bubble:change',
			]);
			expect(labels(logs.react)).toEqual(labels(logs.octane));
		});

		d.unmount();
	});
});

describe('differential: native composition protocol', () => {
	it('records constructed composition/input boundaries without claiming OS IME coverage', async () => {
		const { logs, record } = createLogs();
		const d = await mountDifferential(FIX, 'CompositionTimeline', { record });

		await d.step('composition session', async (i, r) => {
			const run = (mount: DiffMount) => {
				const input = mount.find('input') as HTMLInputElement;
				input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
				setNativeValue(input, '候');
				input.dispatchEvent(
					new InputEvent('input', {
						bubbles: true,
						data: '候',
						inputType: 'insertCompositionText',
						isComposing: true,
					}),
				);
				input.dispatchEvent(
					new CompositionEvent('compositionupdate', { bubbles: true, data: '候' }),
				);
				input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '候' }));
				input.dispatchEvent(
					new InputEvent('input', {
						bubbles: true,
						data: '候',
						inputType: 'insertText',
					}),
				);
			};

			run(i);
			await reactAct(async () => run(r));
			expect((i.find('input') as HTMLInputElement).value).toBe('候');
			expect((r.find('input') as HTMLInputElement).value).toBe('候');
			expect(labels(logs.octane)).toEqual([
				'compositionstart:compositionstart',
				'input:input',
				'compositionupdate:compositionupdate',
				'compositionend:compositionend',
				'input:input',
			]);
			expect(labels(logs.react).filter((label) => !label.startsWith('change:'))).toEqual(
				labels(logs.octane),
			);
			expect(labels(logs.react).filter((label) => label.startsWith('change:'))).toEqual([
				'change:input',
			]);
		});

		d.unmount();
	});
});
