import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { Preview, Tokens } from '../_fixtures/aria-120.tsrx';

describe('React Aria 1.20 server rendering', () => {
	it('renders a labelled token field without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html } = renderToString(Tokens, {});
		expect(html).toContain('role="textbox"');
		expect(html).toContain('aria-labelledby=');
		expect(html).toContain('Hello ');
		expect(html).toContain('Ada');
		expect(html).toContain('Choose recipients');
	});

	it('renders the closed preview trigger without a portal', () => {
		const { html } = renderToString(Preview);
		expect(html).toContain('Preview details');
		expect(html).not.toContain('Read more');
	});
});
