import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createElement,
	flushSync,
	hostComponent,
	hydrateRoot,
	setFormControlSources,
	type ComponentBody,
} from '../src/index.js';
import { act, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { renderToString } from 'octane/server';
import { Controls } from './_fixtures/descriptor-form-controls.tsrx';

const options = [
	{ id: 'a', label: 'Alpha', disabled: true },
	{ id: 'b', label: 'Beta' },
	{ id: 'c', label: 'Gamma' },
];
const noop = () => {};
const selected = (select: HTMLSelectElement) =>
	Array.from(select.options)
		.filter((option) => option.selected)
		.map((option) => option.value);
const initialProps = () => ({
	input: { value: 'accepted' },
	textarea: { value: 'accepted' },
	checkbox: { checked: true },
	select: { value: ['b', 'c'], multiple: true },
	options,
	onInput: noop,
	onChange: noop,
});
afterEach(() => vi.restoreAllMocks());

describe('form control sources and option projection', () => {
	it.each(['input', 'textarea', 'select'] as const)(
		'keeps own-enumerable source precedence for the %s helper',
		(tag) => {
			const reads: string[] = [];
			const inherited = {
				get value() {
					throw new Error('inherited value');
				},
				get checked() {
					throw new Error('inherited checked');
				},
			};
			const spread = Object.create(inherited);
			Object.defineProperty(spread, 'value', {
				enumerable: true,
				get() {
					reads.push('value');
					return undefined;
				},
			});
			Object.defineProperty(spread, 'defaultValue', {
				enumerable: false,
				get() {
					throw new Error('hidden defaultValue');
				},
			});
			const ignoredSource = [false, 'ignored', undefined] as const;
			Object.defineProperty(ignoredSource, 2, {
				get() {
					reads.push('ignored');
					return undefined;
				},
			});
			const Body: ComponentBody = (_props, scope) => {
				const element = hostComponent(
					scope,
					0,
					tag,
					{ onInput: noop },
					tag === 'select'
						? [
								createElement('option', { value: 'first', key: 'first' }, 'First'),
								createElement('option', { value: 'fallback', key: 'fallback' }, 'Fallback'),
							]
						: null,
				);
				setFormControlSources(element, [
					ignoredSource,
					[false, 'value', 'first'],
					[true, spread],
					[false, 'defaultValue', 'fallback'],
				]);
			};
			const view = mount(Body);
			try {
				const control = view.find(tag) as
					HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
				expect(control.value).toBe('fallback');
				expect(reads).toEqual(['ignored', 'value']);
				view.update(Body);
				expect(control.value).toBe('fallback');
				expect(reads).toEqual(['ignored', 'value', 'ignored', 'value']);
			} finally {
				view.unmount();
			}
		},
	);

	it('applies final form values after evaluating each spread and coercing the input default first', () => {
		const log: string[] = [];
		const input = {
			get value() {
				log.push('read value');
				return {
					toString() {
						log.push('coerce value');
						return 'controlled';
					},
				};
			},
			get defaultValue() {
				log.push('read default');
				return {
					toString() {
						log.push('coerce default');
						return 'baseline';
					},
				};
			},
		};
		Object.defineProperty(input, Symbol('observed'), {
			enumerable: true,
			get() {
				log.push('read symbol');
				return null;
			},
		});
		vi.spyOn(console, 'error').mockImplementation(noop);
		const props = { ...initialProps(), input };
		const view = mount(Controls, props);
		try {
			expect((view.find('#text') as HTMLInputElement).value).toBe('controlled');
			expect(log).toEqual([
				'read value',
				'read default',
				'read symbol',
				'coerce default',
				'coerce value',
			]);
			expect(selected(view.find('#select') as HTMLSelectElement)).toEqual(['b', 'c']);
			log.length = 0;
			view.update(Controls, {
				...props,
				input: { value: undefined, defaultValue: 'new baseline' },
			});
			expect((view.find('#text') as HTMLInputElement).value).toBe('controlled');
			expect((view.find('#text') as HTMLInputElement).defaultValue).toBe('new baseline');
		} finally {
			view.unmount();
		}
	});

	it('keeps recognized form writers distinct from differently cased DOM attributes', () => {
		vi.spyOn(console, 'error').mockImplementation(noop);
		const props = { ...initialProps(), input: { value: 'accepted', VALUE: 'attribute' } };
		const view = mount(Controls, props);
		try {
			const input = view.find('#text') as HTMLInputElement;
			expect(input.value).toBe('accepted');
			view.update(Controls, { ...props, input: { value: 'updated', VALUE: 'other attribute' } });
			expect(input.value).toBe('updated');
		} finally {
			view.unmount();
		}
	});

	it('projects newly built options and restores a rejected native selection', () => {
		const props = { ...initialProps(), select: { value: 'later', multiple: false } };
		const view = mount(Controls, props);
		try {
			const select = view.find('#select') as HTMLSelectElement;
			const beta = select.options[1];
			expect(select.value).toBe('b');
			view.update(Controls, { ...props, options: [...options, { id: 'later', label: 'Later' }] });
			expect(select.options[1]).toBe(beta);
			expect(select.value).toBe('later');
			select.value = 'b';
			select.dispatchEvent(new Event('change', { bubbles: true }));
			expect(select.value).toBe('later');
			view.update(Controls, {
				...props,
				select: { value: 'c', multiple: false },
				options: [options[2], options[1], options[0]],
			});
			expect(select.value).toBe('c');
			expect(select.options[1]).toBe(beta);
		} finally {
			view.unmount();
		}
	});

	it.each([false, true])(
		'holds accepted form state before retrying selection (multiple=%s)',
		async (multiple) => {
			let ready = false,
				resolve!: () => void;
			const promise = new Promise<void>((done) => {
				resolve = done;
			});
			const props = initialProps();
			const view = mount(Controls, props);
			try {
				const input = view.find('#text') as HTMLInputElement;
				const textarea = view.find('#textarea') as HTMLTextAreaElement;
				const checkbox = view.find('#checked') as HTMLInputElement;
				const select = view.find('#select') as HTMLSelectElement;
				const original = Array.from(select.options);
				const next = {
					...props,
					input: { value: 'candidate' },
					textarea: { value: 'candidate' },
					checkbox: { checked: false },
					select: { value: multiple ? ['a'] : 'a', multiple },
					options: [options[2], options[1], { ...options[0], disabled: false }],
					read() {
						if (!ready) throw promise;
						return 'resolved';
					},
				};
				view.update(Controls, next);
				expect(input.value).toBe('accepted');
				expect(textarea.value).toBe('accepted');
				expect(checkbox.checked).toBe(true);
				expect(select.multiple).toBe(true);
				expect(selected(select)).toEqual(['b', 'c']);
				expect(Array.from(select.options)).toEqual(original);
				ready = true;
				await act(async () => {
					resolve();
					await promise;
				});
				expect(view.find('#text')).toBe(input);
				expect(input.value).toBe('candidate');
				expect(textarea.value).toBe('candidate');
				expect(checkbox.checked).toBe(false);
				expect(view.find('#select')).toBe(select);
				expect(select.multiple).toBe(multiple);
				expect(selected(select)).toEqual(['a']);
				expect(Array.from(select.options)).toEqual([original[2], original[1], original[0]]);
				expect(view.find('output').textContent).toBe('resolved');
			} finally {
				ready = true;
				resolve();
				view.unmount();
			}
		},
	);

	it('projects uncontrolled defaults for native form reset and selection mode changes', () => {
		const props = { ...initialProps(), select: { defaultValue: ['b', 'c'], multiple: true } };
		const view = mount(Controls, props);
		try {
			const select = view.find('#select') as HTMLSelectElement;
			expect(selected(select)).toEqual(['b', 'c']);
			select.options[0].selected = true;
			select.options[1].selected = false;
			(view.find('form') as HTMLFormElement).reset();
			expect(selected(select)).toEqual(['b', 'c']);
			view.update(Controls, { ...props, select: { defaultValue: 'c', multiple: false } });
			expect(select.multiple).toBe(false);
			expect(select.value).toBe('c');
		} finally {
			view.unmount();
		}
	});

	it('adopts edited server controls and applies the next controlled update', () => {
		const server = loadServerFixture(
			'packages/octane/tests/_fixtures/descriptor-form-controls.tsrx',
		);
		const props = initialProps();
		const container = document.createElement('main');
		container.innerHTML = renderToString(server.Controls, props).html;
		document.body.append(container);
		const input = container.querySelector<HTMLInputElement>('#text')!;
		const checkbox = container.querySelector<HTMLInputElement>('#checked')!;
		const select = container.querySelector<HTMLSelectElement>('#select')!;
		input.value = 'typed before hydration';
		checkbox.checked = false;
		select.value = 'a';
		const root = hydrateRoot(container, Controls, props);
		try {
			expect(container.querySelector('#text')).toBe(input);
			expect(input.value).toBe('typed before hydration');
			expect(checkbox.checked).toBe(false);
			expect(select.value).toBe('a');
			flushSync(() =>
				root.render(Controls, {
					...props,
					input: { value: 'after hydration' },
					select: { value: ['c'], multiple: true },
				}),
			);
			expect(container.querySelector('#select')).toBe(select);
			expect(input.value).toBe('after hydration');
			expect(checkbox.checked).toBe(true);
			expect(selected(select)).toEqual(['c']);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
