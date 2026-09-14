import { describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, startTransition } from '../src/index.js';
import { act } from './_helpers';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks';
import { HostStateApp } from './_fixtures/view-transition-host-state.tsrx';
import { DOMStage } from '../src/dom-stage.js';

describe('prepared host state', () => {
	it('keeps selectors, form owners and collections on original hosts through changes', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<form id="choice"><input name="pick" type="radio" value="a" checked><input name="pick" type="radio" value="b"></form><input form="choice" name="pick" type="radio" value="c">';
		document.body.append(container);
		try {
			const stage = new DOMStage();
			const form = container.querySelector('form')!;
			const inputs = [...container.querySelectorAll('input')];
			const second = stage.view(inputs[1]!);
			expect(second.form).toBe(form);
			expect([...stage.view(form).elements]).toEqual(inputs);
			second.checked = true;
			expect(stage.view(container).querySelector(':checked')).toBe(inputs[1]);
			expect(stage.view(inputs[0]!).checked).toBe(false);
			expect(inputs[0]!.checked).toBe(true);
			stage.view(form).id = 'renamed';
			expect(stage.view(inputs[2]!).form).toBe(null);
			expect([...stage.view(form).elements]).toEqual(inputs.slice(0, 2));
			second.classList.add('chosen');
			expect(second.matches('.chosen:checked')).toBe(true);
			expect(second.closest('form#renamed')).toBe(form);
			stage.view(form).style.setProperty('color', 'red');
			expect(stage.view(form).getAttribute('style')).toContain('color: red');
			expect(form.id).toBe('choice');
			expect(form.style.color).toBe('');
			stage.commit();
			expect(form.id).toBe('renamed');
			expect(form.style.color).toBe('red');
			expect(inputs.map((input) => input.checked)).toEqual([false, true, false]);
			expect(inputs[1]!.classList.contains('chosen')).toBe(true);
			expect(inputs[2]!.form).toBe(null);
		} finally {
			container.remove();
		}
	});

	it('keeps a previously obtained class list current after radio state changes', () => {
		const form = document.createElement('form');
		form.innerHTML =
			'<input type="radio" name="pick" class="before"><input type="radio" name="pick" checked>';
		const first = form.firstElementChild as HTMLInputElement;
		const stage = new DOMStage();
		const prepared = stage.view(first);
		const classes = prepared.classList;
		prepared.checked = true;
		classes.add('chosen');
		expect(prepared.className).toBe('before chosen');
		expect(prepared.matches('.chosen:checked')).toBe(true);
		expect(first.className).toBe('before');
		stage.commit();
		expect(first.className).toBe('before chosen');
		expect(first.checked).toBe(true);
	});

	it('reflects repeated content changes and moves without publishing them early', () => {
		const host = document.createElement('div');
		host.innerHTML =
			'<aside>old</aside><section><span>retained</span></section><footer>end</footer>';
		const stage = new DOMStage();
		const view = stage.view(host);
		const aside = host.firstElementChild!;
		const section = host.children[1]!;
		const retained = section.firstElementChild!;
		const footer = host.lastElementChild!;
		expect(view.querySelector('section span')).toBe(retained);
		stage.view(section).innerHTML = '<b class="new">new</b><template><i>inert</i></template>';
		const inserted = stage.view(section).querySelector('b')!;
		expect(inserted.textContent).toBe('new');
		expect(stage.view(section).querySelector('span')).toBe(null);
		view.insertBefore(footer, aside);
		view.removeChild(aside);
		expect(view.firstChild).toBe(footer);
		expect(stage.view(footer).nextSibling).toBe(section);
		expect(stage.view(section).previousSibling).toBe(footer);
		expect(host.firstElementChild).toBe(aside);
		expect(section.firstElementChild).toBe(retained);
		stage.commit();
		expect([...host.children]).toEqual([footer, section]);
		expect(section.firstElementChild).toBe(inserted);
		expect(section.querySelector('template')!.content.firstElementChild!.textContent).toBe('inert');
	});

	it('orders a fresh wrapper clear after an earlier retained-host insertion', () => {
		const source = document.createElement('div');
		source.innerHTML = '<span>retained</span>';
		const retained = source.firstChild!;
		const stage = new DOMStage();
		const wrapper = stage.created(document.createElement('section'));
		stage.view(wrapper).appendChild(retained);
		stage.view(wrapper).textContent = '';
		expect(stage.view(wrapper).firstChild).toBe(null);
		expect(source.firstChild).toBe(retained);
		stage.commit();
		expect(wrapper.firstChild).toBe(null);
		expect(source.firstChild).toBe(null);
		expect(retained.parentNode).toBe(null);
	});

	it('clears a shared range once without changing its anchors or neighboring hosts', () => {
		const parent = document.createElement('div');
		parent.innerHTML =
			'<header>before</header><!--start--><b>one</b><i>two</i><!--end--><footer>after</footer>';
		const [before, start, one, two, end, after] = [...parent.childNodes];
		const stage = new DOMStage();
		expect(() => stage.clearBetween(end!, start!)).toThrow();
		expect([...stage.view(parent).childNodes]).toEqual([before, start, one, two, end, after]);
		stage.clearBetween(start!, end!);
		expect([...stage.view(parent).childNodes]).toEqual([before, start, end, after]);
		expect(stage.view(start!).nextSibling).toBe(end);
		expect(stage.view(end!).previousSibling).toBe(start);
		expect([...parent.childNodes]).toEqual([before, start, one, two, end, after]);
		stage.commit();
		expect([...parent.childNodes]).toEqual([before, start, end, after]);
		expect(one!.parentNode).toBe(null);
		expect(two!.parentNode).toBe(null);
	});
});

describe('animated host updates', () => {
	it('publishes controlled form state, keyed identity and raw content together', async () => {
		const mocks = installViewTransitionMocks();
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		let update: (() => void | Promise<void>) | undefined;
		let ready!: () => void;
		let finish!: () => void;
		const readyPromise = new Promise<void>((resolve) => {
			ready = resolve;
		});
		const finishedPromise = new Promise<void>((resolve) => {
			finish = resolve;
		});
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value(input: { update: () => void | Promise<void> }) {
				update = input.update;
				return {
					ready: readyPromise,
					finished: finishedPromise,
					skipTransition() {
						ready();
						finish();
					},
				};
			},
		});
		const inputs: string[] = [];
		const props = {
			rows: ['a', 'b', 'c'],
			choice: 'a',
			className: 'before',
			color: 'red',
			html: '<b>before</b>',
			onInput: (value: string) => inputs.push(value),
		};
		try {
			await act(() => root.render(HostStateApp, props));
			const retained = container.querySelector('[data-row="b"]');
			const beforeRaw = container.querySelector('[data-raw]')!.firstChild;
			startTransition(() =>
				root.render(HostStateApp, {
					...props,
					rows: ['d', 'b', 'c'],
					choice: 'external',
					className: 'after',
					color: 'blue',
					html: '<i>after</i>',
				}),
			);
			await vi.waitFor(() => expect(update).toBeTypeOf('function'));
			expect(container.querySelector('section')!.className).toBe('before');
			expect(container.querySelector('input:checked')!.getAttribute('value')).toBe('a');
			expect(container.querySelector('[data-raw]')!.firstChild).toBe(beforeRaw);
			await update!();
			ready();
			finish();
			await act(async () => {});
			expect(container.querySelector('section')!.className).toBe('after');
			expect(container.querySelector('section')!.style.color).toBe('blue');
			expect(
				[...container.querySelectorAll('[data-row]')].map((node) => node.getAttribute('data-row')),
			).toEqual(['d', 'b', 'c']);
			expect(container.querySelector('[data-row="b"]')).toBe(retained);
			expect(container.querySelector('[data-raw]')!.innerHTML).toBe('<i>after</i>');
			const checked = container.querySelector('input:checked') as HTMLInputElement;
			expect(checked.value).toBe('external');
			expect(checked.form).toBe(container.querySelector('form'));
			checked.dispatchEvent(new Event('input', { bubbles: true }));
			expect(inputs).toEqual(['external']);
		} finally {
			flushSync(() => root.unmount());
			ready();
			finish();
			container.remove();
			mocks.restore();
		}
	});
});
