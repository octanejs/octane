import { it, expect } from 'vitest';
import { createElement } from 'octane';
import { mount } from './_helpers';
import { HtmlSpread as Tsx } from './_fixtures/innerhtml-spread.tsx';
import { HtmlSpread as Tsrx, SpreadOnly } from './_fixtures/innerhtml-spread.tsrx';

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

// A spread and an element descriptor carry the same runtime props, so they must
// leave the same DOM and handlers after every update: added, changed, removed and
// reinstated attributes, class and style values, events, and raw HTML whose object
// is reused with new content.
it('applies the same props through a spread and an element descriptor', () => {
	const html = { __html: '<b>one</b>' };
	const clicks: string[] = [];
	const onClick = (event: MouseEvent) =>
		clicks.push((event.currentTarget as Element).parentElement!.id);
	const steps: Record<string, unknown>[] = [
		{
			id: 'a',
			className: ['x', 'y'],
			style: { color: 'red', fontSize: 12 },
			title: 't',
			hidden: true,
			'data-n': 1,
			'aria-label': 'first',
			onClick,
			dangerouslySetInnerHTML: html,
		},
		{
			id: 'b',
			className: 'z',
			style: { color: 'blue' },
			'data-n': 2,
			onClick,
			dangerouslySetInnerHTML: html,
		},
		{},
		{ className: null, style: 'margin: 1px', hidden: false, 'aria-hidden': true, tabIndex: 0 },
	];
	const Descriptor = (props: { attrs: Record<string, unknown> }) =>
		createElement('div', props.attrs);
	const spread = mount(SpreadOnly, { attrs: steps[0] });
	const descriptor = mount(Descriptor, { attrs: steps[0] });
	spread.container.id = 'spread';
	descriptor.container.id = 'descriptor';
	try {
		for (const [index, attrs] of steps.entries()) {
			if (index === 1) html.__html = '<i>two</i>';
			spread.update(SpreadOnly, { attrs });
			descriptor.update(Descriptor, { attrs });
			expect(descriptor.container.innerHTML).toBe(spread.container.innerHTML);
			clicks.length = 0;
			(spread.container.firstElementChild as HTMLElement).click();
			(descriptor.container.firstElementChild as HTMLElement).click();
			expect(clicks).toEqual(attrs.onClick ? ['spread', 'descriptor'] : []);
		}
		expect(spread.container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
	} finally {
		spread.unmount();
		descriptor.unmount();
	}
});
