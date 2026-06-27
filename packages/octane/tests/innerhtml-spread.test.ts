import { it, expect } from 'vitest';
import { mount } from './_helpers';
import { HtmlSpread as Tsx } from './_fixtures/innerhtml-spread.tsx';
import { HtmlSpread as Tsrx } from './_fixtures/innerhtml-spread.tsrx';

// Regression: `dangerouslySetInnerHTML={{__html}}` must set the element's
// innerHTML even when the element also carries a spread (the attr lands AFTER the
// spread, so it routes through setAttribute's dangerouslySetInnerHTML path) — it
// must not leave a dead lowercased attribute or an empty element. This is the HN
// comment/story/about pattern: `{...stylex.props(x)} dangerouslySetInnerHTML={…}`.
for (const [name, Comp] of [
	['.tsx', Tsx],
	['.tsrx', Tsrx],
] as const) {
	it(`dangerouslySetInnerHTML sets innerHTML alongside a spread (${name})`, () => {
		const r = mount(Comp as any, { html: '<b class="x">hi</b>' });
		const el = r.find('[data-testid="rich"]') as HTMLElement;
		expect(el.getAttribute('data-spread')).toBe('yes'); // spread still applied
		expect(el.querySelector('b.x')?.textContent).toBe('hi'); // innerHTML applied
		expect(el.hasAttribute('dangerouslysetinnerhtml')).toBe(false); // no dead attribute
		r.unmount();
	});
}
