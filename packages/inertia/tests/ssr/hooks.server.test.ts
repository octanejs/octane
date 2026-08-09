/**
 * Octane-only unpaired SSR framework-contract test. Outside react-parity
 * ownership — see packages/inertia/UPSTREAM.md.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerHooks } from '../_fixtures/server-hooks.tsrx';

describe('Inertia hooks during server rendering', () => {
	it('creates request-local initial state without browser reads or effects', () => {
		const first = renderToString(ServerHooks).html;
		const second = renderToString(ServerHooks).html;

		expect(first).toContain('false:false:Ada:false');
		expect(second).toBe(first);
	});
});
