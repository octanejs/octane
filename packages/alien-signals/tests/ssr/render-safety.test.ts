import { describe, expect, it } from 'vitest';
import { createSignal } from '@octanejs/alien-signals';
import { renderToStaticMarkup } from 'octane/server';
import { ServerSignalView } from '../_fixtures/hooks.tsrx';

describe('@octanejs/alien-signals SSR', () => {
	it('reads snapshots without starting client-owned effects or scopes', () => {
		expect(typeof document).toBe('undefined');
		const source = createSignal(7);
		const entries: string[] = [];

		const { html, css } = renderToStaticMarkup(ServerSignalView, {
			source,
			log: (entry) => entries.push(entry),
		});

		expect(html).toBe('<p id="server-signal">7</p>');
		expect(css).toBe('');
		expect(entries).toEqual([]);
	});
});
