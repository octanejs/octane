import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { RetRef, AtRef } from './_fixtures/ref-fold.tsrx';

// Refs already fold: a `ref={…}` on an element inside a folded host fragment is a
// dynamic attribute, so it threads as a `props.hN` hole and attaches on the
// renderer's element. Confirm the folded form attaches the same node as the inline
// `@{}` oracle.
describe('refs attach through the fold', () => {
	it('a ref callback on a folded element receives the element', () => {
		let folded: HTMLElement | null = null;
		let inline: HTMLElement | null = null;
		const a = mount(RetRef as any, { r: (el: HTMLElement) => (folded = el) });
		const b = mount(AtRef as any, { r: (el: HTMLElement) => (inline = el) });
		expect(folded).toBe(a.find('button'));
		expect(inline).toBe(b.find('button'));
		expect((folded as unknown as HTMLElement)?.tagName).toBe('BUTTON');
		a.unmount();
		b.unmount();
	});
});
