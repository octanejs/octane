// Drift guard for the materialized markup the hydration suite hydrates against.
// If the emitted bytes change, this fails here rather than surfacing as a
// confusing hydration mismatch in the other project.
import { describe, it, expect } from 'vitest';
import { prerender } from 'octane/static';
import { HydratePage } from '../_fixtures/hydrate-page.tsrx';
import { SERVER_BODY, SERVER_HEAD } from '../hydration/server-html.ts';

describe('materialized server html', () => {
	it('matches what the fixture renders today', async () => {
		const { html, head } = await prerender(HydratePage, undefined, { headChannel: 'separate' });
		// The head-ownership keys are derived from call-site position in
		// src/components.tsrx, so editing that file legitimately changes them. When
		// this fails, copy the received strings into tests/hydration/server-html.ts.
		expect(head, 'update tests/hydration/server-html.ts with this value').toBe(SERVER_HEAD);
		expect(html, 'update tests/hydration/server-html.ts with this value').toBe(SERVER_BODY);
	});
});
