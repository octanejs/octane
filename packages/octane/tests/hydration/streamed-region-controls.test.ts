import { describe, expect, it, onTestFinished } from 'vitest';
import { createStreamedRegionReceiver } from '../../src/hydration/index.js';
import type { StreamFrameIdentity } from '../../src/streamed-signals-protocol.js';

function dormantForm() {
	const identity: StreamFrameIdentity = {
		protocol: 1,
		buildId: 'build',
		documentId: 'document',
		ownerKey: 'owner',
		instanceKey: 'region',
		nodeKey: 'form',
		selectionKey: 'current',
		selectionGeneration: 0,
		attempt: 0,
	};
	const receiver = createStreamedRegionReceiver(identity);
	receiver.registerSelection(identity);
	const form = document.createElement('form');
	const start = document.createComment('[');
	const end = document.createComment(']');
	form.append(start, end);
	document.body.append(form);
	onTestFinished(() => {
		receiver.dispose();
		form.remove();
	});
	receiver.registerRegion({
		identity,
		start,
		end,
		contentRevision: 0,
		isActive: () => false,
		loadStyles() {},
		adoptHistoricalFrame: () => ({ release() {} }),
	});
	const place = (sequence: number, html: string) =>
		receiver.receive({
			identity,
			sequence,
			channel: 'placement',
			kind: 'html',
			contentRevision: sequence + 1,
			mode: 'full',
			html: '<!--[-->' + html + '<!--]-->',
			historicalFrame: { version: 1, scopeKey: identity.ownerKey, entries: [] },
			styles: [],
		});
	return { form, place };
}

function choices(defaultValue: string, values = ['a', 'b'], multiple = false) {
	return (
		`<select name="choice" data-octane-input="choice"${multiple ? ' multiple' : ''}>` +
		values
			.map(
				(value) =>
					`<option value="${value}"${value === defaultValue ? ' selected' : ''}>${value}</option>`,
			)
			.join('') +
		'</select>'
	);
}

describe('form controls in dormant streamed regions', () => {
	it.each([false, true])(
		'refreshes native form reset defaults and options with edited controls=%s',
		async (edited) => {
			const { form, place } = dormantForm();
			expect(
				await place(
					0,
					'<input name="text" data-octane-input="text" value="old" disabled required>' +
						'<textarea name="message" data-octane-input="message">old</textarea>' +
						'<input name="flag" data-octane-input="flag" type="checkbox">' +
						'<select name="single" data-octane-input="single">' +
						'<optgroup disabled><option value="unavailable">Unavailable</option></optgroup>' +
						'<option value="old">Old</option><option value="removed">Removed</option></select>' +
						'<select name="multi" data-octane-input="multi" multiple>' +
						'<option value="old" selected>Old</option><option value="retained">Retained</option>' +
						'<option value="removed">Removed</option></select>',
				),
			).toBe('accepted');
			const text = form.querySelector<HTMLInputElement>('input[name="text"]')!;
			const message = form.querySelector('textarea')!;
			const flag = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
			const [single, multi] = form.querySelectorAll('select');
			if (edited) {
				text.value = '';
				message.value = 'typed';
				flag.checked = false;
				single.value = 'removed';
				multi.options[0]!.selected = false;
				multi.options[1]!.selected = true;
				multi.options[2]!.selected = true;
				for (const control of [single, multi])
					control.dispatchEvent(new Event('input', { bubbles: true }));
			}

			expect(
				await place(
					1,
					'<input name="text" data-octane-input="text" value="new">' +
						'<textarea name="message" data-octane-input="message">new</textarea>' +
						'<input name="flag" data-octane-input="flag" type="checkbox" checked>' +
						'<select name="single" data-octane-input="single">' +
						'<option value="new">New</option><option value="old">Old</option></select>' +
						'<select name="multi" data-octane-input="multi" multiple>' +
						'<option value="retained">Renamed</option><option value="new" selected>New</option></select>',
				),
			).toBe('accepted');
			expect([...form.querySelectorAll('input,textarea,select')]).toEqual([
				text,
				message,
				flag,
				single,
				multi,
			]);
			expect(text).toMatchObject({
				value: edited ? '' : 'new',
				defaultValue: 'new',
				disabled: false,
				required: false,
			});
			expect(message).toMatchObject({ value: edited ? 'typed' : 'new', defaultValue: 'new' });
			expect(flag).toMatchObject({ checked: !edited, defaultChecked: true });
			expect(single.value).toBe('new');
			expect(Array.from(multi.options, (option) => option.text)).toEqual(['Renamed', 'New']);
			expect(new FormData(form).getAll('multi')).toEqual([edited ? 'retained' : 'new']);

			form.reset();
			expect([...new FormData(form)]).toEqual([
				['text', 'new'],
				['message', 'new'],
				['flag', 'on'],
				['single', 'new'],
				['multi', 'new'],
			]);
		},
	);

	it('updates pristine range values against the new constraints and keeps a dirty value', async () => {
		const { form, place } = dormantForm();
		expect(
			await place(
				0,
				'<input name="explicit" data-octane-input="explicit" type="range" value="50" max="100">' +
					'<input name="implicit" data-octane-input="implicit" type="range" max="50">' +
					'<input name="edited" data-octane-input="edited" type="range" value="50" max="100">',
			),
		).toBe('accepted');
		const edited = form.querySelector<HTMLInputElement>('[name="edited"]')!;
		edited.value = '75';
		edited.dispatchEvent(new Event('input', { bubbles: true }));

		expect(
			await place(
				1,
				'<input name="explicit" data-octane-input="explicit" type="range" value="150" max="200">' +
					'<input name="implicit" data-octane-input="implicit" type="range" max="100">' +
					'<input name="edited" data-octane-input="edited" type="range" value="150" max="200">',
			),
		).toBe('accepted');
		expect([...new FormData(form)]).toEqual([
			['explicit', '150'],
			['implicit', '50'],
			['edited', '75'],
		]);
		expect(form.querySelector('[name="edited"]')).toBe(edited);
		form.reset();
		expect(edited.value).toBe('150');
	});

	it.each([false, true])(
		'preserves the selected occurrence of duplicate option values with multiple=%s',
		async (multiple) => {
			const { form, place } = dormantForm();
			const select = (options: string) =>
				`<select name="choice" data-octane-input="choice"${multiple ? ' multiple' : ''}>${options}</select>`;
			expect(
				await place(0, select('<option value="x">First</option><option value="x">Second</option>')),
			).toBe('accepted');
			const choice = form.querySelector('select')!;
			choice.options[1]!.selected = true;
			choice.dispatchEvent(new Event('input', { bubbles: true }));
			expect(
				await place(
					1,
					select(
						'<option value="x">Renamed</option><option value="x">Second</option>' +
							'<option value="x">Added</option>',
					),
				),
			).toBe('accepted');
			expect(form.querySelector('select')).toBe(choice);
			expect(Array.from(choice.options, (option) => option.selected)).toEqual([false, true, false]);
			expect(new FormData(form).getAll('choice')).toEqual(['x']);
		},
	);

	it.each(['keep', 'reset', 'cancel reset', 'remove option'])(
		'remembers an eventless selection when a streamed default catches up (%s)',
		async (action) => {
			const { form, place } = dormantForm();
			await place(0, choices('a'));
			const choice = form.querySelector('select')!;
			choice.value = 'b';
			await place(1, choices('b'));
			expect(choice.value).toBe('b');

			if (action === 'cancel reset') {
				form.addEventListener('reset', (event) => event.preventDefault(), { once: true });
			}
			if (action === 'reset' || action === 'cancel reset') form.reset();
			if (action === 'remove option') {
				await place(2, choices('c', ['a', 'c']));
				expect(choice.value).toBe('c');
			}
			await place(action === 'remove option' ? 3 : 2, choices('a', ['a', 'b', 'c']));
			expect(form.querySelector('select')).toBe(choice);
			expect(new FormData(form).get('choice')).toBe(
				action === 'keep' || action === 'cancel reset' ? 'b' : 'a',
			);
		},
	);

	it('preserves a later edit back to the default after a streamed selection fallback', async () => {
		const { form, place } = dormantForm();
		expect(await place(0, choices('a'))).toBe('accepted');
		const choice = form.querySelector('select')!;
		choice.value = 'b';
		choice.dispatchEvent(new Event('input', { bubbles: true }));
		expect(await place(1, choices('c', ['c', 'd']))).toBe('accepted');
		expect(choice.value).toBe('c');
		for (const value of ['d', 'c']) {
			choice.value = value;
			choice.dispatchEvent(new Event('input', { bubbles: true }));
		}

		expect(await place(2, choices('d', ['c', 'd']))).toBe('accepted');
		expect(new FormData(form).get('choice')).toBe('c');
	});

	it('preserves surviving edited selections across successive streamed defaults', async () => {
		const { form, place } = dormantForm();
		expect(await place(0, choices('a', ['a', 'b', 'c'], true))).toBe('accepted');
		const choice = form.querySelector('select')!;
		choice.options[0]!.selected = false;
		choice.options[1]!.selected = true;
		choice.options[2]!.selected = true;
		choice.dispatchEvent(new Event('input', { bubbles: true }));
		expect(await place(1, choices('b', ['b', 'd'], true))).toBe('accepted');
		expect(new FormData(form).getAll('choice')).toEqual(['b']);

		expect(await place(2, choices('d', ['b', 'd'], true))).toBe('accepted');
		expect(new FormData(form).getAll('choice')).toEqual(['b']);
	});

	it('uses incoming select defaults after a committed reset followed by a canceled reset', async () => {
		const { form, place } = dormantForm();
		expect(await place(0, choices('a'))).toBe('accepted');
		const choice = form.querySelector('select')!;
		choice.value = 'b';
		choice.dispatchEvent(new Event('input', { bubbles: true }));
		form.reset();
		expect(choice.value).toBe('a');
		form.addEventListener('reset', (event) => event.preventDefault(), { once: true });
		form.reset();

		expect(await place(1, choices('b'))).toBe('accepted');
		expect(form.querySelector('select')).toBe(choice);
		expect(new FormData(form).get('choice')).toBe('b');
	});

	it('uses incoming defaults when an outer form reset succeeds after a nested reset is canceled', async () => {
		const { form, place } = dormantForm();
		const other = document.createElement('form');
		form.id = 'outer-reset';
		other.id = 'inner-reset';
		document.body.append(other);
		onTestFinished(() => other.remove());
		expect(await place(0, choices('a'))).toBe('accepted');
		const choice = form.querySelector('select')!;
		choice.value = 'b';
		choice.dispatchEvent(new Event('input', { bubbles: true }));
		other.addEventListener('reset', (event) => event.preventDefault(), { once: true });
		form.addEventListener(
			'reset',
			(event) => {
				event.stopPropagation();
				choice.setAttribute('form', other.id);
				other.reset();
				choice.removeAttribute('form');
			},
			{ once: true },
		);
		form.reset();
		expect(new FormData(form).get('choice')).toBe('a');

		expect(await place(1, choices('b'))).toBe('accepted');
		expect(new FormData(form).get('choice')).toBe('b');
	});

	it.each(['canceled reset', 'synthetic reset', 'clear after reset', 'eventless change'] as const)(
		'keeps the live select state for %s',
		async (state) => {
			const { form, place } = dormantForm();
			expect(await place(0, choices('a'))).toBe('accepted');
			const choice = form.querySelector('select')!;
			choice.value = 'b';
			if (state !== 'eventless change') {
				choice.dispatchEvent(new Event('input', { bubbles: true }));
				if (state === 'clear after reset') {
					form.reset();
					choice.selectedIndex = -1;
				} else {
					choice.value = 'a';
				}
				choice.dispatchEvent(new Event('input', { bubbles: true }));
				if (state === 'canceled reset') {
					form.addEventListener('reset', (event) => event.preventDefault(), { once: true });
					form.reset();
				} else if (state === 'synthetic reset') {
					form.dispatchEvent(new Event('reset', { bubbles: true, cancelable: true }));
				}
			}

			expect(await place(1, choices(state === 'eventless change' ? 'a' : 'b'))).toBe('accepted');
			expect(form.querySelector('select')).toBe(choice);
			const expected =
				state === 'eventless change' ? 'b' : state === 'clear after reset' ? null : 'a';
			expect(new FormData(form).get('choice')).toBe(expected);
		},
	);

	it('keeps the external checked radio when the streamed group adopts an unchecked edit', async () => {
		const { form, place } = dormantForm();
		const outside = document.createElement('input');
		outside.type = 'radio';
		outside.name = 'destination';
		outside.checked = true;
		form.prepend(outside);
		expect(
			await place(0, '<input data-octane-input="choice" type="radio" name="previous" checked>'),
		).toBe('accepted');
		const choice = form.querySelector<HTMLInputElement>('[name="previous"]')!;
		choice.checked = false;
		choice.dispatchEvent(new Event('input', { bubbles: true }));

		expect(
			await place(1, '<input data-octane-input="choice" type="radio" name="destination" checked>'),
		).toBe('accepted');
		expect(form.lastElementChild).toBe(choice);
		expect(choice).toMatchObject({ name: 'destination', checked: false, defaultChecked: true });
		expect(outside.checked).toBe(true);
	});

	it('waits for composition and leaves the current form intact when an edited control changes type', async () => {
		const { form, place } = dormantForm();
		expect(await place(0, '<input data-octane-input="draft" placeholder="Before">')).toBe(
			'accepted',
		);
		const input = form.querySelector('input')!;
		input.focus();
		input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
		input.value = 'composing';
		input.dispatchEvent(new Event('input', { bubbles: true }));

		const pending = place(1, '<input data-octane-input="draft" placeholder="After">');
		await Promise.resolve();
		expect(input.placeholder).toBe('Before');
		input.dispatchEvent(new Event('compositionend', { bubbles: true }));
		expect(await pending).toBe('accepted');
		expect(form.querySelector('input')).toBe(input);
		expect(input).toMatchObject({ placeholder: 'After', value: 'composing' });
		expect(document.activeElement).toBe(input);

		await expect(
			place(2, '<label>Incoming</label><input data-octane-input="draft" type="checkbox">'),
		).rejects.toMatchObject({ code: 'placement' });
		expect(form.querySelector('label')).toBeNull();
		expect(form.querySelector('input')).toBe(input);
		expect(input).toMatchObject({ type: 'text', placeholder: 'After', value: 'composing' });
	});
});
