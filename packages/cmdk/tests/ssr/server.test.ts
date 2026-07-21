// Phase 5: the menu server-renders all items in source order without touching
// browser globals; the DOM-authoritative filter/selection is post-hydration work.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { BasicMenu } from '../_fixtures/basic.tsrx';

describe('@octanejs/cmdk — server rendering', () => {
	it('renders the cmdk contract and all items in source order', () => {
		const { html } = renderToString(BasicMenu);

		expect(html).toContain('cmdk-root');
		expect(html).toContain('cmdk-input');
		expect(html).toContain('cmdk-list');
		expect(html).toContain('role="listbox"');
		expect(html).toContain('role="combobox"');

		const apple = html.indexOf('Apple');
		const banana = html.indexOf('Banana');
		const cherry = html.indexOf('Cherry');
		expect(apple).toBeGreaterThan(-1);
		expect(apple).toBeLessThan(banana);
		expect(banana).toBeLessThan(cherry);
	});

	it('does not ship the empty state above the results', () => {
		// Items register in layout effects, which never run on the server, so the
		// match count is unavoidably 0 during SSR. Rendering Empty on that would put
		// "No results found." above a fully-populated list on every server-rendered
		// page — and leave it there permanently for readers without JavaScript.
		const { html } = renderToString(BasicMenu);

		expect(html).toContain('cmdk-item');
		expect(html).not.toContain('cmdk-empty');
	});
});
