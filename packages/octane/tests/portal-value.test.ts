import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { createElement, createPortal, textSlot } from '../src/index.js';
import {
	ReturnPortal,
	TernaryPortal,
	ThemedReturnPortal,
	FragmentPortal,
	InlineJsxPortal,
	ToggleApp,
	FlipApp,
	MemoPortalApp,
	TextPortalFlip,
} from './_fixtures/portal-value.tsrx';

// A createPortal(...) VALUE should render wherever any renderable value renders —
// it must NOT require sitting at a host-element child position.
describe('portal as a value (no host-element wrapper)', () => {
	function withTarget(fn: (target: HTMLElement) => void) {
		const target = document.createElement('section');
		document.body.appendChild(target);
		try {
			fn(target);
		} finally {
			target.remove();
		}
	}

	it('renders when a component RETURNS a createPortal value', () => {
		withTarget((target) => {
			const r = mount(ReturnPortal, { target });
			expect(r.findAll('.modal')).toHaveLength(0); // not in the app container
			expect(target.querySelector('.modal')!.textContent).toBe('return');
			r.unmount();
			expect(target.querySelector('.modal')).toBe(null);
		});
	});

	it('renders a createPortal in a ternary at a child position', () => {
		withTarget((target) => {
			const r = mount(TernaryPortal, { target });
			expect(target.querySelector('.modal')!.textContent).toBe('ternary');
			r.unmount();
			expect(target.querySelector('.modal')).toBe(null);
		});
	});

	it('renders a createPortal at a fragment root', () => {
		withTarget((target) => {
			const r = mount(FragmentPortal, { target });
			expect(target.querySelector('.modal')!.textContent).toBe('fragment');
			r.unmount();
			expect(target.querySelector('.modal')).toBe(null);
		});
	});

	it('renders a createPortal whose body is inline component JSX', () => {
		withTarget((target) => {
			const r = mount(InlineJsxPortal, { target });
			expect(target.querySelector('.modal.inline')!.textContent).toBe('inline');
			r.unmount();
			expect(target.querySelector('.modal.inline')).toBe(null);
		});
	});

	it('flows context through a value-position portal', () => {
		withTarget((target) => {
			const r = mount(ThemedReturnPortal, { target });
			expect(target.querySelector('.modal.themed')!.textContent).toBe('dark');
			r.unmount();
		});
	});

	it('flips its return between a singleRoot component, null, and a portal', () => {
		withTarget((target) => {
			const r = mount(FlipApp, { target });
			// mode "solo": a singleRoot component (markerless componentSlot at slot 0).
			expect(r.findAll('.solo')).toHaveLength(1);
			expect(r.find('.solo')!.textContent).toBe('solo');

			// → null: the slot flips from componentSlot to childSlot. Must not corrupt.
			r.click('.b-null');
			expect(r.findAll('.solo')).toHaveLength(0);
			expect(target.querySelector('.solo')).toBe(null);

			// → portal: a createPortal value at the same slot, into the foreign target.
			r.click('.b-portal');
			expect(r.findAll('.solo')).toHaveLength(0); // not in the app container
			expect(target.querySelector('.solo')!.textContent).toBe('portal');

			// → back to the singleRoot component: flips from childSlot back to comp.
			r.click('.b-solo');
			expect(r.find('.solo')!.textContent).toBe('solo');
			expect(target.querySelector('.solo')).toBe(null); // portal torn down

			r.unmount();
		});
	});

	it('refreshes a context consumer inside a value-position portal under a memo bail', () => {
		withTarget((target) => {
			const r = mount(MemoPortalApp, { target });
			expect(target.querySelector('.modal.themed')!.textContent).toBe('light');

			// The provider value changes but the memo'd indirection's props are stable →
			// it bails; the lazy propagation must still reach the consumer inside the
			// portal (the content Block lives in the childSlot's embedded PortalSlot).
			r.click('.b-dark');
			expect(target.querySelector('.modal.themed')!.textContent).toBe('dark');
			r.unmount();
		});
	});

	it('tears the portal down when an inline text hole flips from a portal to a primitive', () => {
		withTarget((target) => {
			const r = mount(TextPortalFlip, { target });
			expect(target.querySelector('.modal')!.textContent).toBe('text-flip');

			// portal → string: the compiled inline text-hole path must route the flip
			// through the full classifier so the portal's foreign-target content is
			// torn down.
			r.click('.b-flip');
			expect(target.querySelector('.modal')).toBe(null);
			expect(r.find('.root').textContent).toContain('plain');

			// string → portal: mode-switches back cleanly.
			r.click('.b-flip');
			expect(target.querySelector('.modal')!.textContent).toBe('text-flip');
			expect(r.find('.root').textContent).not.toContain('plain');

			r.unmount();
			expect(target.querySelector('.modal')).toBe(null);
		});
	});

	it('textSlot: a portal-mode slot flipping to a primitive routes through the classifier', () => {
		withTarget((target) => {
			// Drive `textSlot` exactly as the compiler's bagless (noTemplate) emission
			// does — `textSlot(__s, 0, __block.parentNode, value, __block.endMarker)` —
			// so the portal→primitive flip hits textSlot's mode-switch guard. Without
			// the portal check in that guard, the primitive hot path wrote the text and
			// left the portal's foreign-target content mounted forever.
			const body = (props: any, scope: any) => {
				textSlot(scope, 0, scope.block.parentNode, props.value, scope.block.endMarker);
			};
			const portalValue = () =>
				createPortal(createElement('div', { className: 'modal' }, 'slot-portal'), target);

			const r = mount(body as any, { value: portalValue() });
			expect(target.querySelector('.modal')!.textContent).toBe('slot-portal');

			// portal → string: portal torn down, text rendered in place.
			r.update(body as any, { value: 'plain-text' });
			expect(target.querySelector('.modal')).toBe(null);
			expect(r.container.textContent).toContain('plain-text');

			// string → portal: mode-switches back cleanly.
			r.update(body as any, { value: portalValue() });
			expect(target.querySelector('.modal')!.textContent).toBe('slot-portal');
			expect(r.container.textContent).not.toContain('plain-text');

			r.unmount();
			expect(target.querySelector('.modal')).toBe(null);
		});
	});

	it('mounts/unmounts cleanly when toggled, leaving no orphan markers', () => {
		withTarget((target) => {
			const r = mount(ToggleApp, { target });
			expect(target.querySelector('.modal')).not.toBe(null);

			r.click('button'); // close
			expect(target.querySelector('.modal')).toBe(null);
			// No orphan portal markers / content left behind in the target.
			expect(target.childNodes.length).toBe(0);

			r.click('button'); // reopen
			expect(target.querySelector('.modal')!.textContent).toBe('toggle');

			r.click('button'); // close again
			expect(target.childNodes.length).toBe(0);

			r.unmount();
			expect(target.childNodes.length).toBe(0);
		});
	});
});
