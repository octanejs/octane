/**
 * Differential parity: the SAME `.tsrx` app runs through @octanejs/router
 * (octane) AND real @tanstack/react-router (the setup rewrites
 * `@octanejs/router` → `@tanstack/react-router`). After the initial load and
 * after each Link-click navigation, the rendered DOM — layout chrome, page
 * content, hrefs, and active-state attributes (data-status / aria-current) —
 * must be byte-identical. This is the gold-standard proof the octane binding
 * behaves like real react-router, not just like our reading of it.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/router-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

const settle = () => new Promise((r) => setTimeout(r, 25));

describe('differential: @octanejs/router vs real @tanstack/react-router', () => {
	it('initial load renders byte-identical layout + index route + link states', async () => {
		const d = await mountDifferential(FIXTURE, 'BasicApp', undefined, CACHE);
		await d.step('mount + load', async () => {
			await settle();
		});
		d.unmount();
	});

	it('Link navigation: index → about → params route → back to index', async () => {
		const d = await mountDifferential(FIXTURE, 'BasicApp', undefined, CACHE);
		await d.step('mount + load', async () => {
			await settle();
		});
		await d.step('click about', async (i, r) => {
			await i.click('.nav-about');
			await r.click('.nav-about');
			await settle();
		});
		await d.step('click item (params route)', async (i, r) => {
			await i.click('.nav-item');
			await r.click('.nav-item');
			await settle();
		});
		await d.step('click home', async (i, r) => {
			await i.click('.nav-home');
			await r.click('.nav-home');
			await settle();
		});
		d.unmount();
	});

	it('unknown URL renders the notFoundComponent identically inside the layout', async () => {
		const d = await mountDifferential(
			FIXTURE,
			'BasicApp',
			{ initial: '/definitely/missing' },
			CACHE,
		);
		await d.step('mount + load (404)', async () => {
			await settle();
		});
		d.unmount();
	});
});
