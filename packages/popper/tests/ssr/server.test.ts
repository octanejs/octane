import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerPopperHarness } from '../runtime/_fixtures/Harness.tsrx';

describe('@octanejs/popper server rendering', () => {
	// @parity-case adapted:popper-ssr
	it('renders deterministic initial placement and styles without browser globals', () => {
		const first = renderToString(ServerPopperHarness);
		const second = renderToString(ServerPopperHarness);
		expect(second).toEqual(first);
		expect(first.html).toContain('id="reference"');
		expect(first.html).toContain('id="popper"');
		expect(first.html).toContain('data-placement="top"');
		expect(first.html).toContain('position:absolute');
	});
});
