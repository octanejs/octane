import { describe, expect, it } from 'vitest';
import { createSignal } from '@octanejs/alien-signals';
import { renderToStaticMarkup } from 'octane/server';
import { ServerSignalView, ServerSignalFeatures } from '../_fixtures/hooks.tsrx';

describe('@octanejs/alien-signals SSR', () => {
	// @parity-case native:alien-signals-server-52c8675cd45df337
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

// @parity-case native:alien-signals-server-7c1fdab1ce06537c
it('renders selected and deferred snapshots without running phase effects on the server', () => {
	const source = createSignal(7);
	const entries: string[] = [];
	const { html } = renderToStaticMarkup(ServerSignalFeatures, {
		source,
		log: (entry) => entries.push(entry),
	});
	expect(html).toBe(
		'<div id="server-features"><output id="current">7</output><output id="selected">14</output><output id="deferred">7</output></div>',
	);
	expect(entries).toEqual([]);
	source(8);
	expect(entries).toEqual([]);
});
