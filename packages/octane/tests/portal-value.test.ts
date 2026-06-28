import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	ReturnPortal,
	TernaryPortal,
	ThemedReturnPortal,
	FragmentPortal,
	InlineJsxPortal,
	ToggleApp,
	FlipApp,
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
