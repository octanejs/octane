import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { flushSync, hostComponent } from '../src/index.js';

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

describe('hostComponent — no stale props/events on the reused element', () => {
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
});
