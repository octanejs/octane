import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { flushSync } from '../src/index.js';
import { StylePatch, setHidden } from './_fixtures/deopt-style-patch.tsrx';

// Regression: patchDeoptProps reused applyDeoptProp (the FRESH-element helper) for
// style, which passes prev=undefined into setStyle — so declarations DROPPED from the
// style object between renders were never removed from a reused element (real-world:
// Radix Slider's thumb kept its pre-measurement `display: none` forever).
describe('de-opt host style patching', () => {
	it('removes declarations dropped from the style object on a reused element', () => {
		const r = mount(StylePatch);
		const el = r.find('#box') as HTMLElement;
		expect(el.style.display).toBe('none');
		expect(el.style.color).toBe('red');

		flushSync(() => setHidden(false));
		// display was dropped from the object; color survives.
		expect(el.style.display).toBe('');
		expect(el.style.color).toBe('red');
		r.unmount();
	});
});
