import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { Interleaved } from './_fixtures/interleaved-text-components.tsrx';

// Regression for the hacker-news home-page crash: a `.meta`-style row that interleaves sibling
// text holes with `<Tag/>` component holes. The compiler emits `htextSwap` (which detaches the
// text hole's `<!>` placeholder) — the fix defers those mounts until after ALL element walks
// (including the component anchors, which navigate `sibling(textHolePlaceholder, 1)`) are
// computed. Before the fix this threw "Cannot read properties of null (reading 'parentNode')".
describe('regression: sibling text holes interleaved with component holes', () => {
	it('mounts without crashing and renders text + components in source order', () => {
		const r = mount(Interleaved as any, { a: 'AA', b: 'BB' });
		const meta = r.container.querySelector('div.meta')!;
		expect(meta).not.toBeNull();
		// text "AA" + <b>X</b> + text "BB" + <b>Y</b>, in order.
		expect(meta.textContent).toBe('AAXBBY');
		expect([...meta.querySelectorAll('b.tag')].map((t) => t.textContent)).toEqual(['X', 'Y']);
		r.unmount();
	});
});
