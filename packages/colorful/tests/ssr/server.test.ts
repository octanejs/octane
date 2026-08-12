import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerColorful } from './_fixtures/server.tsrx';
import { HydrationHex } from '../hydration/_fixtures/HydrationHarness.tsrx';

describe('@octanejs/colorful — server rendering', () => {
	// @parity-case adapted:react-colorful-ssr
	it('renders deterministic picker and input markup without browser globals', () => {
		const first = renderToString(ServerColorful);
		const second = renderToString(ServerColorful);
		expect(second).toEqual(first);
		expect(first.html).toContain('<h1>Color controls</h1>');
		expect(first.html).toContain('data-testid="hex"');
		expect(first.html).toContain('data-testid="alpha"');
		expect(first.html).toContain('aria-label="Hue"');
		expect(first.html).toContain('aria-label="Alpha"');
		expect(first.html).toContain('value="#aabbcc"');
		expect(first.html).not.toContain('<style');
	});

	it('renders the hydration fixture', () => {
		const result = renderToString(HydrationHex, { onChange: () => {} });
		expect(result.html).toContain('data-testid="hex"');
	});
});
