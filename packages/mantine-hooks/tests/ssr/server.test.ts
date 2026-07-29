import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ExplicitInitialMediaQuery, ServerHooks } from '../_fixtures/server-hooks.tsrx';

describe('@octanejs/mantine-hooks server behavior', () => {
	it('renders deterministic initial state without a browser', () => {
		const first = renderToString(ServerHooks).html;
		const second = renderToString(ServerHooks).html;

		expect(first).toBe(second);
		expect(first).toContain('2:open:Ada,Grace:narrow');
	});

	it('preserves an explicit media-query initial value outside the effect', () => {
		expect(renderToString(ExplicitInitialMediaQuery).html).toContain('wide');
	});
});
