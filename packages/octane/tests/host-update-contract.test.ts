import { describe, expect, it } from 'vitest';
import { createElement, flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import {
	FormActionAndHandler,
	DefaultsInput,
	DefaultTextarea,
	DefaultSelect,
	SpreadDefaultInput,
} from './_fixtures/host-update-contract.tsrx';

describe('host prop updates', () => {
	it.each(['input', 'textarea'])(
		'hydrates %s reset defaults without replacing user edits',
		(tag) => {
			for (const shape of ['direct', 'spread', 'descriptor']) {
				const source =
					shape === 'descriptor'
						? `import {createElement} from 'octane'; export function View({dv}) { return createElement('form', {}, createElement('${tag}', {defaultValue: dv})); }`
						: `export function View({dv}) @{ <form><${tag} ${shape === 'spread' ? '{...{defaultValue: dv}}' : 'defaultValue={dv}'}/></form> }`;
				const options = {
					id: 'host-default-hydration.tsrx',
					compileOptions: {
						dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
						hmr: false as const,
					},
				};
				const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' }).View;
				const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' }).View;
				const container = document.createElement('div');
				container.innerHTML = Server.renderToString(server, { dv: 'server' }).html;
				document.body.append(container);
				const control = container.querySelector(tag) as HTMLInputElement | HTMLTextAreaElement;
				control.value = 'typed';
				const root = hydrateRoot(container, client, { dv: 'client' });
				try {
					flushSync(() => {});
					expect(container.querySelector(tag), shape).toBe(control);
					expect(control.value, shape).toBe('typed');
					expect(control.defaultValue, shape).toBe('client');
					container.querySelector('form')!.reset();
					expect(control.value, shape).toBe('client');
				} finally {
					root.unmount();
					container.remove();
				}
			}
		},
	);

	it.each(['input', 'textarea'])(
		'normalizes invalid %s values and defaults without invoking functions',
		(tag) => {
			for (const name of ['value', 'defaultValue']) {
				for (const value of [
					Symbol('invalid'),
					() => {
						throw new Error('must not invoke');
					},
				]) {
					const mounted = mount(() =>
						createElement('form', {}, createElement(tag, { [name]: value, readOnly: true })),
					);
					try {
						const element = mounted.find(tag) as HTMLInputElement | HTMLTextAreaElement;
						expect(element.value).toBe('');
						expect(element.defaultValue).toBe('');
						element.value = 'typed';
						(mounted.find('form') as HTMLFormElement).reset();
						expect(element.value).toBe('');
					} finally {
						mounted.unmount();
					}
				}
			}
		},
	);

	it('keeps an explicit empty input default distinguishable from an omitted value attribute', () => {
		const mounted = mount(() => createElement('input', { defaultValue: '' }));
		try {
			expect(mounted.find('input').getAttribute('value')).toBe('');
		} finally {
			mounted.unmount();
		}
	});
	it.each([
		['aria-label', () => 'label'],
		['aria-label', Symbol('label')],
		['rowSpan', 'invalid'],
		['start', 'invalid'],
		['innerText', 'replacement'],
		['textContent', 'replacement'],
	])('omits unsupported attribute values (%s)', (name, value) => {
		const props = { [name as string]: value };
		const mounted = mount(() => createElement('div', props, 'child'));
		const element = mounted.find('div');
		expect(element.hasAttribute(name as string)).toBe(false);
		expect(element.textContent).toBe('child');
		const { html } = Server.renderToString(() => Server.createElement('div', props, 'child'));
		const container = document.createElement('div');
		container.innerHTML = html;
		expect(container.firstElementChild?.hasAttribute(name as string)).toBe(false);
		expect(container.textContent).toBe('child');
		mounted.unmount();
	});
	it.each([DefaultsInput, DefaultTextarea, SpreadDefaultInput])(
		'keeps compiled uncontrolled defaults separate from live values (%s)',
		(View) => {
			const mounted = mount(View, { dv: 'initial', sp: {} });
			const element = mounted.find('input,textarea') as HTMLInputElement | HTMLTextAreaElement;
			mounted.update(View, { dv: 'updated', sp: {} });
			expect(element.value).toBe('initial');
			expect(element.defaultValue).toBe('updated');
			mounted.update(View, { dv: undefined, sp: {} });
			expect(element.value).toBe('initial');
			expect(element.defaultValue).toBe('');
			mounted.unmount();
		},
	);

	it('applies a compiled select default only when it mounts', () => {
		const mounted = mount(DefaultSelect, { dv: 'p' });
		const select = mounted.find('select') as HTMLSelectElement;
		mounted.update(DefaultSelect, { dv: 'q' });
		expect(select.value).toBe('p');
		mounted.unmount();
	});

	it('keeps a compiled form action independent of its submit handler', () => {
		const calls: string[] = [];
		const action = (data: FormData) => {
			calls.push(String(data.get('query')));
		};
		const onSubmit = () => {
			calls.push('submit');
		};
		const mounted = mount(FormActionAndHandler, { action, onSubmit });
		mounted.find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		expect(calls).toEqual(['submit', 'octane']);
		calls.length = 0;
		mounted.update(FormActionAndHandler, {
			action,
			onSubmit: (event: Event) => {
				onSubmit();
				event.preventDefault();
			},
		});
		mounted.find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		expect(calls).toEqual(['submit']);
		mounted.unmount();
	});
	it.each([null, undefined, false])('clears only authored style keys on removal (%s)', (style) => {
		function View(props: { style: unknown }) {
			return createElement('div', props);
		}
		const mounted = mount(View, { style: { color: 'red', cssFloat: 'left' } });
		const element = mounted.find('div') as HTMLElement;
		element.style.setProperty('--animation-progress', '0.5');
		element.style.transform = 'translateX(2px)';
		mounted.update(View, { style });
		expect(element.style.color).toBe('');
		expect(element.style.cssFloat).toBe('');
		expect(element.style.getPropertyValue('--animation-progress')).toBe('0.5');
		expect(element.style.transform).toBe('translateX(2px)');
		mounted.unmount();
	});

	it('runs submit handlers before the form action across updates and cancellation', () => {
		const calls: string[] = [];
		function View(props: { label: string; cancel?: boolean; action?: boolean }) {
			return createElement(
				'section',
				{ onSubmit: () => calls.push('ancestor') },
				createElement(
					'form',
					{
						action: props.action === false ? '/submit' : () => calls.push('action:' + props.label),
						onSubmit: (event: Event) => {
							calls.push('submit:' + props.label);
							if (props.cancel) event.preventDefault();
						},
					},
					createElement('button', { type: 'submit' }, 'submit'),
				),
			);
		}
		const mounted = mount(View, { label: 'first' });
		const submit = () =>
			mounted.find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		submit();
		expect(calls).toEqual(['submit:first', 'ancestor', 'action:first']);
		calls.length = 0;
		mounted.update(View, { label: 'second' });
		submit();
		expect(calls).toEqual(['submit:second', 'ancestor', 'action:second']);
		calls.length = 0;
		mounted.update(View, { label: 'cancelled', cancel: true });
		submit();
		expect(calls).toEqual(['submit:cancelled', 'ancestor']);
		calls.length = 0;
		mounted.update(View, { label: 'native', action: false });
		submit();
		expect(calls).toEqual(['submit:native', 'ancestor']);
		calls.length = 0;
		mounted.update(View, { label: 'restored' });
		submit();
		expect(calls).toEqual(['submit:restored', 'ancestor', 'action:restored']);
		mounted.unmount();
	});

	it.each(['input', 'textarea'])('keeps an untouched %s value when its default changes', (tag) => {
		function View(props: { defaultValue?: string }) {
			return createElement(tag, props);
		}
		const mounted = mount(View, { defaultValue: 'initial' });
		const element = mounted.find(tag) as HTMLInputElement | HTMLTextAreaElement;
		mounted.update(View, { defaultValue: 'updated' });
		expect(element.value).toBe('initial');
		expect(element.defaultValue).toBe('updated');
		mounted.update(View, {});
		expect(element.value).toBe('initial');
		expect(element.defaultValue).toBe('');
		mounted.unmount();
	});

	it('keeps an uncontrolled select choice when its default changes', () => {
		function View(props: { defaultValue?: string }) {
			return createElement(
				'select',
				props,
				['a', 'b'].map((value) => createElement('option', { key: value, value }, value)),
			);
		}
		const mounted = mount(View, { defaultValue: 'a' });
		const select = mounted.find('select') as HTMLSelectElement;
		mounted.update(View, { defaultValue: 'b' });
		expect(select.value).toBe('a');
		mounted.unmount();
	});
});
