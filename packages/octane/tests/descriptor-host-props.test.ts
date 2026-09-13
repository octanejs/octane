import { describe, expect, it } from 'vitest';
import { createRoot, flushSync, hostComponent, type ComponentBody } from '../src/index.js';
import { act, mount } from './_helpers';

const Host: ComponentBody<{ tag?: string; props: Record<string, unknown>; read?: () => void }> = (
	{ tag = 'div', props, read },
	scope,
) => {
	hostComponent(scope, 0, tag, props);
	read?.();
};

describe('persistent descriptor host properties', () => {
	it('keeps the last class and label target through alias removal and reordering', () => {
		const r = mount(Host, {
			tag: 'label',
			props: { class: 'first', className: 'last', for: 'a', htmlFor: 'b' },
		});
		try {
			const element = r.find('label');
			expect(element.className).toBe('last');
			expect(element.getAttribute('for')).toBe('b');
			r.update(Host, { tag: 'label', props: { class: 'first', for: 'a' } });
			expect(element.className).toBe('first');
			expect(element.getAttribute('for')).toBe('a');
			r.update(Host, {
				tag: 'label',
				props: { class: 'first', className: 'last', for: 'a', htmlFor: 'b' },
			});
			r.update(Host, {
				tag: 'label',
				props: { className: 'last', class: 'first', htmlFor: 'b', for: 'a' },
			});
			expect(element.className).toBe('first');
			expect(element.getAttribute('for')).toBe('a');
			expect(r.find('label')).toBe(element);
		} finally {
			r.unmount();
		}
	});

	it('keeps the last native event alias through removal and reordering', () => {
		const calls: string[] = [];
		const first = () => calls.push('first');
		const last = () => calls.push('last');
		const r = mount(Host, { tag: 'button', props: { onDoubleClick: first, onDblClick: last } });
		try {
			const element = r.find('button');
			const fire = () => element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			fire();
			r.update(Host, { tag: 'button', props: { onDoubleClick: first } });
			fire();
			r.update(Host, { tag: 'button', props: { onDoubleClick: first, onDblClick: last } });
			r.update(Host, { tag: 'button', props: { onDblClick: last, onDoubleClick: first } });
			fire();
			expect(calls).toEqual(['last', 'first', 'first']);
		} finally {
			r.unmount();
		}
	});

	it('reasserts authored attributes and controlled values after live DOM edits', () => {
		const props = {
			id: 'field',
			title: 'accepted',
			role: 'textbox',
			className: 'accepted',
			'data-state': 'accepted',
			'aria-label': 'accepted',
			value: 'accepted',
		};
		const r = mount(Host, { tag: 'input', props });
		try {
			const input = r.find('input') as HTMLInputElement;
			for (const name of ['id', 'title', 'role', 'class', 'data-state', 'aria-label'])
				input.setAttribute(name, 'foreign');
			input.value = 'foreign';
			r.update(Host, { tag: 'input', props: { ...props } });
			expect(input.id).toBe('field');
			expect(input.title).toBe('accepted');
			expect(input.className).toBe('accepted');
			expect(input.getAttribute('data-state')).toBe('accepted');
			expect(input.getAttribute('aria-label')).toBe('accepted');
			expect(input.value).toBe('accepted');
		} finally {
			r.unmount();
		}
	});

	it('observes mutable class, coercion, HTML values and current prop getters', () => {
		const classes = ['first'];
		let title = 'first';
		let reads = 0;
		const attribute = { toString: () => title };
		const html = { __html: '<strong>first</strong>' };
		const props = {
			className: classes,
			title: attribute,
			dangerouslySetInnerHTML: html,
			get 'data-label'() {
				reads++;
				return title;
			},
		};
		const r = mount(Host, { props });
		try {
			classes[0] = 'second';
			title = 'second';
			html.__html = '<strong>second</strong>';
			r.update(Host, { props });
			const element = r.find('div');
			expect(element.className).toBe('second');
			expect(element.title).toBe('second');
			expect(element.getAttribute('data-label')).toBe('second');
			expect(element.textContent).toBe('second');
			expect(reads).toBe(2);
		} finally {
			r.unmount();
		}
	});

	it('retains focus and ref lifetime while applying equal props and changed styles', () => {
		const refs: string[] = [];
		const ref = (element: Element | null) => {
			if (element !== null) {
				refs.push('attach');
				return () => refs.push('detach');
			}
		};
		const r = mount(Host, {
			tag: 'button',
			props: { ref, autoFocus: true, title: 'same', style: { color: 'red', padding: 4 } },
		});
		try {
			const element = r.find('button');
			const elsewhere = document.createElement('input');
			document.body.append(elsewhere);
			elsewhere.focus();
			r.update(Host, {
				tag: 'button',
				props: { ref, autoFocus: true, title: 'same', style: { color: 'blue' } },
			});
			expect(document.activeElement).toBe(elsewhere);
			expect(element.style.color).toBe('blue');
			expect(element.style.padding).toBe('');
			expect(refs).toEqual(['attach']);
			elsewhere.remove();
		} finally {
			r.unmount();
		}
		expect(refs).toEqual(['attach', 'detach']);
	});

	it('keeps custom-element attribute callbacks observable on equal prop updates', () => {
		const changes: Array<string | null> = [];
		class ObservedHost extends HTMLElement {
			static observedAttributes = ['data-value'];
			attributeChangedCallback(_name: string, _previous: string | null, value: string | null) {
				changes.push(value);
			}
		}
		const tag = 'descriptor-props-observed-host';
		customElements.define(tag, ObservedHost);
		const r = mount(Host, { tag, props: { 'data-value': 'same' } });
		try {
			r.update(Host, { tag, props: { 'data-value': 'same' } });
			expect(changes).toEqual(['same', 'same']);
		} finally {
			r.unmount();
		}
	});

	it('restores accepted attributes and events after a candidate suspends', async () => {
		const calls: string[] = [];
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		let resolve!: () => void;
		const pending = new Promise<void>((done) => {
			resolve = done;
		});
		let ready = false;
		const first = () => calls.push('first');
		const next = () => calls.push('next');
		try {
			root.render(Host, {
				tag: 'button',
				props: { title: 'first', className: 'first', onClick: first },
			});
			const button = container.querySelector('button')!;
			flushSync(() =>
				root.render(Host, {
					tag: 'button',
					props: { title: 'next', className: 'next', onClick: next },
					read: () => {
						if (!ready) throw pending;
					},
				}),
			);
			expect(button.title).toBe('first');
			expect(button.className).toBe('first');
			button.click();
			await act(async () => {
				ready = true;
				resolve();
				await pending;
			});
			expect(button.title).toBe('next');
			expect(button.className).toBe('next');
			button.click();
			expect(calls).toEqual(['first', 'next']);
			expect(container.querySelector('button')).toBe(button);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
