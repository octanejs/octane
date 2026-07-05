import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers.js';
import { isChildrenBlock } from '../src/index.js';
import { ElementChildren, TextChildren, RenderPropChildren } from './_fixtures/children-block.tsrx';

// A component's element/text children lower to a render function (`__children$N`), which — unlike
// a render-prop child (`<C>{(x) => …}</C>`, passed RAW) — the compiler tags via `markChildrenBlock`.
// `isChildrenBlock` lets a function-as-child consumer tell them apart. Regression for the
// @octanejs/base-ui Dialog payload-render-function API.
function stripComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

describe('isChildrenBlock: distinguishing compiled children from render-prop function children', () => {
	it('element children are NOT called — rendered as-is', () => {
		const m = mount(ElementChildren);
		flushEffects();
		expect(stripComments(m.html())).toBe('<div class="wrap"><span class="el">hi</span></div>');
		m.unmount();
	});

	it('text children are NOT called — rendered as-is', () => {
		const m = mount(TextChildren);
		flushEffects();
		expect(stripComments(m.html())).toBe('<div class="wrap">plain</div>');
		m.unmount();
	});

	it('a render-prop function child IS called with data', () => {
		const m = mount(RenderPropChildren);
		flushEffects();
		expect(stripComments(m.html())).toBe('<div class="wrap"><span class="rp">payload</span></div>');
		m.unmount();
	});

	it('isChildrenBlock is false for a plain user function and non-functions', () => {
		expect(isChildrenBlock(() => null)).toBe(false);
		expect(isChildrenBlock((x: any) => x)).toBe(false);
		expect(isChildrenBlock(null)).toBe(false);
		expect(isChildrenBlock('text')).toBe(false);
		expect(isChildrenBlock(42)).toBe(false);
		expect(isChildrenBlock(undefined)).toBe(false);
	});
});
