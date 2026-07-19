/**
 * The same fixtures run through @octanejs/styled-components and the published
 * styled-components package on React. Every step drives identical events on
 * both sides and compares normalized innerHTML byte-for-byte — including the
 * generated class names, which line up because both implementations share the
 * upstream hashing (componentId counters, djb2 + base52, SC_VERSION) and the
 * fixtures create components in identical order on both sides.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const CACHE = resolve(__dirname, '.react-cache');
const fixture = (name: string) => resolve(__dirname, `../_fixtures/${name}.tsrx`);

describe('differential: @octanejs/styled-components vs styled-components', () => {
	it('basic styling with a transient-prop toggle', async () => {
		const d = await mountDifferential(fixture('basic-smoke'), 'SmokeApp', undefined, CACHE);
		await d.step('initial render', () => {});
		await d.step('toggle variant', async (octane, react) => {
			await octane.click('#btn');
			await react.click('#btn');
		});
		d.unmount();
	});

	it('nested theme providers with a function theme and a theme toggle', async () => {
		const d = await mountDifferential(fixture('themed-card'), 'ThemedCard', undefined, CACHE);
		await d.step('initial themed render', () => {});
		await d.step('toggle dark theme', async (octane, react) => {
			await octane.click('#toggle-theme');
			await react.click('#toggle-theme');
		});
		d.unmount();
	});

	it('attrs resolution and shouldForwardProp filtering', async () => {
		const d = await mountDifferential(fixture('attrs-input'), 'AttrsInput', undefined, CACHE);
		await d.step('initial attrs', () => {});
		await d.step('escalate tone', async (octane, react) => {
			await octane.click('#filter-btn');
			await react.click('#filter-btn');
		});
		d.unmount();
	});

	it('state-driven `as` polymorphism', async () => {
		const d = await mountDifferential(fixture('as-polymorph'), 'AsPolymorph', undefined, CACHE);
		await d.step('button form', () => {});
		await d.step('swap to anchor', async (octane, react) => {
			await octane.click('#swap');
			await react.click('#swap');
		});
		expect(d.octane.find('#poly').tagName).toBe('A');
		d.unmount();
	});

	it('createGlobalStyle + keyframes with a dynamic global prop', async () => {
		const d = await mountDifferential(
			fixture('global-keyframes'),
			'GlobalKeyframes',
			undefined,
			CACHE,
		);
		await d.step('initial global styles', () => {});
		await d.step('widen', async (octane, react) => {
			await octane.click('#widen');
			await react.click('#widen');
		});
		d.unmount();
	});

	it('styled(Styled) folding with a component selector', async () => {
		const d = await mountDifferential(fixture('compose'), 'Compose', undefined, CACHE);
		await d.step('mild tone', () => {});
		await d.step('hot tone', async (octane, react) => {
			await octane.click('#fancy');
			await react.click('#fancy');
		});
		d.unmount();
	});
});
