import { it, expect } from 'vitest';
import { mount } from './_helpers';
import { HtmlSpread as Tsx } from './_fixtures/innerhtml-spread.tsx';
import { HtmlSpread as Tsrx } from './_fixtures/innerhtml-spread.tsrx';

// Regression: `innerHTML={expr}` must set the element's innerHTML even when the
// element also has a spread (which routes the binding through setAttribute) — it
// previously left a dead lowercased `innerhtml` attribute and an empty element.
for (const [name, Comp] of [
	['.tsx', Tsx],
	['.tsrx', Tsrx],
] as const) {
	it(`innerHTML={expr} sets innerHTML alongside a spread (${name})`, () => {
		const r = mount(Comp as any, { html: '<b class="x">hi</b>' });
		const el = r.find('[data-testid="rich"]') as HTMLElement;
		expect(el.classList.contains('wrap')).toBe(true); // spread still applied
		expect(el.querySelector('b.x')?.textContent).toBe('hi'); // innerHTML applied
		expect(el.hasAttribute('innerhtml')).toBe(false); // no dead attribute
		r.unmount();
	});
}
