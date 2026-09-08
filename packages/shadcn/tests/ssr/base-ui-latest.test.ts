import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import {
	SelectExample,
	NavigationExample,
	ScrollExample,
} from '../_fixtures/shadcn-diff/base-ui-latest.tsrx';

describe('@octanejs/shadcn — Base UI wrapper server rendering', () => {
	it('renders a selected form value without browser globals', () => {
		const { html } = renderToString(SelectExample);
		expect(html).toContain('data-slot="select-trigger"');
		expect(html).toContain('Apple');
		expect(html).toContain('name="fruit"');
		expect(html).toContain('value="apple"');
	});
	it('renders navigation links and scrollable content without opening portals', () => {
		expect(renderToString(NavigationExample).html).toContain('href="#home"');
		const { html } = renderToString(ScrollExample);
		expect(html).toContain('data-slot="scroll-area-viewport"');
		expect(html).toContain('Scrollable content');
	});
});
