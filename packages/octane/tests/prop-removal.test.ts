import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { flushSync, setSpread } from '../src/index.js';
import { PropRemoval, setAlt } from './_fixtures/deopt-prop-removal.tsrx';

// Prop REMOVAL parity across the three prop-diff loops (setSpread, patchDeoptProps,
// applyHostProps), all routed through the shared removeHostProp:
//   - `htmlFor` must remove the native `for` attribute (the SET path's alias, mirrored);
//   - `class`/`className` must remove the attribute (never leave `class=""`);
//   - `suppressHydrationWarning` is a JS flag (`__oct_suppress`), never a DOM
//     attribute — and its disappearance must RESET the flag;
//   - a vanished `on*` handler must clear its delegated slot key.

describe('setSpread — removal parity with the SET path', () => {
	it('removes the native `for` attribute when a spread `htmlFor` disappears', () => {
		const el = document.createElement('label');
		setSpread(el, { htmlFor: 'x' }, undefined);
		expect(el.getAttribute('for')).toBe('x');
		setSpread(el, {}, { htmlFor: 'x' });
		expect(el.hasAttribute('for')).toBe(false); // the aliased attribute is gone
		expect(el.hasAttribute('htmlfor')).toBe(false); // and no junk literal either
	});

	it('treats suppressHydrationWarning as a JS flag (no DOM attribute), reset on removal', () => {
		const el = document.createElement('div');
		setSpread(el, { suppressHydrationWarning: true, id: 'a' }, undefined);
		expect((el as any).__oct_suppress).toBe(true);
		// Never serialized as an attribute (the server's ssrSpread skips the key, so an
		// attribute write here would itself be a guaranteed hydration divergence).
		expect(el.hasAttribute('suppresshydrationwarning')).toBe(false);
		setSpread(el, { id: 'a' }, { suppressHydrationWarning: true, id: 'a' });
		expect((el as any).__oct_suppress).toBe(false);
	});

	it('clears a delegated event slot when the spread handler disappears', () => {
		const el = document.createElement('button');
		const fn = () => {};
		setSpread(el, { onClick: fn }, undefined);
		expect((el as any).$$click).toBe(fn);
		setSpread(el, {}, { onClick: fn });
		expect((el as any).$$click).toBe(null);
	});
});

describe('de-opt host prop removal (patchDeoptProps on a reused element)', () => {
	it('removes htmlFor→for, class, and resets __oct_suppress when the props vanish', () => {
		const r = mount(PropRemoval);
		const el = r.find('#target') as HTMLElement;
		expect(el.getAttribute('for')).toBe('field');
		expect(el.getAttribute('class')).toBe('big');
		expect((el as any).__oct_suppress).toBe(true);

		flushSync(() => setAlt(true));
		// Same element, patched in place.
		expect(r.find('#target')).toBe(el);
		expect(el.getAttribute('data-alt')).toBe('1');
		// The aliased `for` attribute is removed (not a no-op removeAttribute('htmlFor')).
		expect(el.hasAttribute('for')).toBe(false);
		// class is REMOVED — not left behind as `class=""`.
		expect(el.hasAttribute('class')).toBe(false);
		// The suppress flag is reset, matching applyHostProps' removal loop.
		expect((el as any).__oct_suppress).toBe(false);
		r.unmount();
	});
});
