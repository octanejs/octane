import { describe, it, expect } from 'vitest';
import { flushEffects, mount } from './_helpers';
import {
	createElement,
	flushSync,
	hostComponent,
	type ComponentBody,
	type OctaneNode,
} from '../src/index.js';
import { HostComponentChildren } from './_fixtures/host-component-children.tsrx';

// `hostComponent` (the runtime primitive behind @octanejs/motion's `motion.<tag>`) REUSES its
// element across renders. Regressions fixed here:
//   1. props/attributes/events that DISAPPEAR between renders must be removed, not left stale.
//   2. `onXxxCapture` must register a capture-phase listener (via eventSlot), not a dead
//      `$$clickcapture` slot + a never-fired `clickcapture` delegated event.

// A raw component body that renders a host element via hostComponent, props driven by the
// parent's `hp`. hostComponent inserts the element as a side effect (returns it), so the body
// itself renders nothing.
const HostBody = (props: any, scope: any): void => {
	hostComponent(scope, 0, props.tag ?? 'div', props.hp, null);
};

describe('hostComponent — reused host and children', () => {
	it('accepts callable children after an empty mount and releases them when removed', () => {
		const refs: string[] = [];
		const hostRef = (element: Element | null) => {
			if (element !== null) {
				refs.push('attach');
				return () => refs.push('detach');
			}
		};
		const Host: ComponentBody<{ label: string | null; attached: boolean }> = (props, scope) => {
			hostComponent(
				scope,
				0,
				'section',
				props.attached ? { ref: hostRef, 'data-label': props.label } : null,
				props.label === null
					? null
					: () => createElement('input', { defaultValue: props.label, 'aria-label': props.label }),
			);
		};
		const r = mount(Host, { label: null, attached: false });
		try {
			const section = r.find('section');
			expect(section.childNodes).toHaveLength(0);
			expect(refs).toEqual([]);
			r.update(Host, { label: 'first', attached: true });
			const input = r.find('input') as HTMLInputElement;
			input.value = 'typed';
			input.focus();
			expect(refs).toEqual(['attach']);
			r.update(Host, { label: 'second', attached: true });
			expect(r.find('section')).toBe(section);
			expect(r.find('input')).toBe(input);
			expect(input.value).toBe('typed');
			expect(input.getAttribute('aria-label')).toBe('second');
			expect(document.activeElement).toBe(input);
			r.update(Host, { label: null, attached: false });
			expect(r.find('section')).toBe(section);
			expect(section.childNodes).toHaveLength(0);
			expect(section.hasAttribute('data-label')).toBe(false);
			expect(input.isConnected).toBe(false);
			expect(refs).toEqual(['attach', 'detach']);
			r.update(Host, { label: 'third', attached: true });
			const fresh = r.find('input') as HTMLInputElement;
			expect(fresh).not.toBe(input);
			expect(fresh.value).toBe('third');
			r.unmount();
			expect(refs).toEqual(['attach', 'detach', 'attach', 'detach']);
		} finally {
			r.unmount();
		}
	});

	it('renders the value returned by callable children', () => {
		const host: ComponentBody<{ label: string }> = (props, scope) => {
			hostComponent(scope, 0, 'section', null, () =>
				createElement('strong', { id: 'returned-child' }, props.label),
			);
		};
		const r = mount(host, { label: 'first' });
		try {
			const child = r.find('#returned-child');
			expect(child.textContent).toBe('first');
			r.update(host, { label: 'second' });
			expect(r.find('#returned-child')).toBe(child);
			expect(child.textContent).toBe('second');
		} finally {
			r.unmount();
		}
	});

	it('updates compiled children while retaining their state and cleaning up removed children', () => {
		const host: ComponentBody<{ children?: OctaneNode }> = (props, scope) => {
			hostComponent(scope, 0, 'section', { id: 'callable-host' }, props.children);
		};
		const lifecycle: string[] = [];
		const attached: HTMLButtonElement[] = [];
		const detached: HTMLButtonElement[] = [];
		const onEffect = (label: string) => {
			lifecycle.push(`setup:${label}`);
			return () => {
				lifecycle.push(`cleanup:${label}`);
			};
		};
		const childRef = (element: HTMLButtonElement | null) => {
			if (element === null) return;
			attached.push(element);
			return () => {
				detached.push(element);
			};
		};
		const props = { host, childRef, onEffect };
		const r = mount(HostComponentChildren, { ...props, label: 'first', show: true });
		try {
			flushEffects();
			const section = r.find('#callable-host');
			const label = r.find('#host-label');
			const button = r.find('#host-child');
			expect(button.textContent).toBe('first:0');
			expect(lifecycle).toEqual(['setup:first']);
			expect(attached).toEqual([button]);

			r.click('#host-child');
			flushEffects();
			expect(button.textContent).toBe('first:1');
			r.update(HostComponentChildren, { ...props, label: 'second', show: true });
			flushEffects();
			expect(r.find('#callable-host')).toBe(section);
			expect(r.find('#host-label')).toBe(label);
			expect(label.textContent).toBe('second');
			expect(r.find('#host-child')).toBe(button);
			expect(button.textContent).toBe('second:1');
			expect(lifecycle).toEqual(['setup:first', 'cleanup:first', 'setup:second']);
			expect(attached).toEqual([button]);
			expect(detached).toEqual([]);

			r.update(HostComponentChildren, { ...props, label: 'empty', show: false });
			flushEffects();
			expect(r.find('#callable-host')).toBe(section);
			expect(label.textContent).toBe('empty');
			expect(r.findAll('#host-child')).toEqual([]);
			expect(detached).toEqual([button]);
			expect(lifecycle).toEqual(['setup:first', 'cleanup:first', 'setup:second', 'cleanup:second']);

			r.update(HostComponentChildren, { ...props, label: 'third', show: true });
			flushEffects();
			const remounted = r.find('#host-child');
			expect(r.find('#callable-host')).toBe(section);
			expect(remounted).not.toBe(button);
			expect(remounted.textContent).toBe('third:0');
			expect(attached).toEqual([button, remounted]);
			r.unmount();
			flushEffects();
			expect(lifecycle).toEqual([
				'setup:first',
				'cleanup:first',
				'setup:second',
				'cleanup:second',
				'setup:third',
				'cleanup:third',
			]);
		} finally {
			r.unmount();
		}
	});

	it('removes attributes that disappear across renders', () => {
		const r = mount(HostBody as any, { hp: { id: 'h', 'data-x': '1', title: 't', class: 'a' } });
		const div = r.container.querySelector('#h')!;
		expect(div.getAttribute('data-x')).toBe('1');
		expect(div.getAttribute('title')).toBe('t');

		r.root.render(HostBody as any, { hp: { id: 'h', class: 'a' } });
		flushSync(() => {});

		expect(div.hasAttribute('data-x')).toBe(false); // removed
		expect(div.hasAttribute('title')).toBe(false); // removed
		expect(div.className).toBe('a'); // kept
		r.unmount();
	});

	it('keeps an input selection when a reused host gains a defaultChecked prop', () => {
		const r = mount(HostBody as any, {
			tag: 'input',
			hp: { id: 'host-default', type: 'checkbox' },
		});
		try {
			const input = r.find('#host-default') as HTMLInputElement;
			r.update(HostBody as any, {
				tag: 'input',
				hp: { id: 'host-default', type: 'checkbox', defaultChecked: true },
			});
			expect(r.find('#host-default')).toBe(input);
			expect(input.checked).toBe(false);
			expect(input.defaultChecked).toBe(true);
		} finally {
			r.unmount();
		}
	});

	it('removes an event handler that disappears across renders', () => {
		let clicks = 0;
		const h = () => clicks++;
		const Body = (props: any, scope: any): void => {
			hostComponent(scope, 0, 'button', props.on ? { id: 'e', onClick: h } : { id: 'e' }, null);
		};
		const r = mount(Body as any, { on: true });
		const btn = r.container.querySelector('#e') as HTMLElement;
		btn.click();
		expect(clicks).toBe(1);

		r.root.render(Body as any, { on: false });
		flushSync(() => {});
		btn.click();
		expect(clicks).toBe(1); // handler removed → no further clicks
		r.unmount();
	});

	it('onClickCapture fires in the capture phase (not a dead clickcapture slot)', () => {
		let captured = 0;
		const Body = (props: any, scope: any): void => {
			hostComponent(scope, 0, 'button', { id: 'b', onClickCapture: () => captured++ }, null);
		};
		const r = mount(Body as any, {});
		const btn = r.container.querySelector('#b') as HTMLElement;
		btn.click();
		expect(captured).toBe(1);
		r.unmount();
	});

	it('honors autoFocus on mount but not when added to an existing host', () => {
		const initial = mount(HostBody as any, {
			tag: 'input',
			hp: { id: 'host-initial-autofocus', autoFocus: true },
		});
		try {
			expect(document.activeElement).toBe(initial.find('#host-initial-autofocus'));
		} finally {
			initial.unmount();
		}

		const existing = mount(HostBody as any, {
			tag: 'input',
			hp: { id: 'host-later-autofocus' },
		});
		try {
			const el = existing.find('#host-later-autofocus');
			existing.update(HostBody as any, {
				tag: 'input',
				hp: { id: 'host-later-autofocus', autoFocus: true },
			});
			expect(existing.find('#host-later-autofocus')).toBe(el);
			expect(document.activeElement).not.toBe(el);
		} finally {
			existing.unmount();
		}
	});

	it('still adds a raw autoFocus attribute to an existing custom host', () => {
		const r = mount(HostBody as any, {
			tag: 'my-autofocus-element',
			hp: { id: 'host-custom-autofocus' },
		});
		try {
			r.update(HostBody as any, {
				tag: 'my-autofocus-element',
				hp: { id: 'host-custom-autofocus', autoFocus: true },
			});
			expect(r.find('#host-custom-autofocus').getAttribute('autofocus')).toBe('');
		} finally {
			r.unmount();
		}
	});
});
