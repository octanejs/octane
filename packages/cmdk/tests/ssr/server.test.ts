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
});
