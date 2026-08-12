/**
 * The same fixtures run through @octanejs/styled-components and the published
 * styled-components package on React. Every step drives identical events on
 * both sides and compares:
 *   1. normalized root-container innerHTML (including generated class names)
 *   2. each engine's isolated `style[data-styled]` stylesheet output
 *
 * Stylesheets are isolated per engine via StyleSheetManager + a dedicated
 * insertion target, so dual-mounting into one document does not collide on
 * shared `data-styled` / componentId tags. Stylesheet comparison is what
 * proves each engine inserted the consumer-visible rules, not only matching
 * generated class names on the container.
 *
 * Class names line up because both implementations share the upstream hashing
 * (componentId counters, djb2 + base52, SC_VERSION) and the fixtures create
 * components in identical order on both sides. Cases whose only observable
 * result would be a createGlobalStyle sheet update are kept out of this
 * oracle and covered by Octane conformance tests instead.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { mountStyledDifferential, preloadStyledDifferentialFixture } from './_styled-rig.js';

const CACHE = resolve(__dirname, '.react-cache');

function fixture(name: string): string {
	return resolve(__dirname, `../_fixtures/${name}.tsrx`);
}

// Keep fixture pairs sequential: each styled-components runtime assigns component IDs
// from module-global counters, so concurrent fixture evaluation can change their order.
// The Octane and React imports within each pair still preload concurrently.
await preloadStyledDifferentialFixture(fixture('basic-smoke'), CACHE);
await preloadStyledDifferentialFixture(fixture('themed-card'), CACHE);
await preloadStyledDifferentialFixture(fixture('attrs-input'), CACHE);
await preloadStyledDifferentialFixture(fixture('as-polymorph'), CACHE);
await preloadStyledDifferentialFixture(fixture('global-keyframes'), CACHE);
await preloadStyledDifferentialFixture(fixture('compose'), CACHE);

describe('differential: @octanejs/styled-components vs styled-components', function () {
	// @parity-case differential:styled-components-basic
	it('basic styling with a transient-prop toggle', async function () {
		const d = await mountStyledDifferential(fixture('basic-smoke'), 'SmokeApp', undefined, CACHE);
		await d.step('initial render', function () {});
		await d.step(
			'toggle variant',
			async function (octane, react) {
				await octane.click('#btn');
				await react.click('#btn');
			},
			{ expectSheetChange: true },
		);
		d.unmount();
	});

	// @parity-case differential:styled-components-theming
	it('nested theme providers with a function theme and a theme toggle', async function () {
		const d = await mountStyledDifferential(fixture('themed-card'), 'ThemedCard', undefined, CACHE);
		await d.step('initial themed render', function () {});
		await d.step(
			'toggle dark theme',
			async function (octane, react) {
				await octane.click('#toggle-theme');
				await react.click('#toggle-theme');
			},
			{ expectSheetChange: true },
		);
		d.unmount();
	});

	// @parity-case differential:styled-components-attrs
	it('attrs resolution and shouldForwardProp filtering', async function () {
		const d = await mountStyledDifferential(fixture('attrs-input'), 'AttrsInput', undefined, CACHE);
		await d.step('initial attrs', function () {});
		await d.step(
			'escalate tone',
			async function (octane, react) {
				await octane.click('#filter-btn');
				await react.click('#filter-btn');
			},
			{ expectSheetChange: true },
		);
		d.unmount();
	});

	// @parity-case differential:styled-components-polymorphism
	it('state-driven `as` polymorphism', async function () {
		const d = await mountStyledDifferential(
			fixture('as-polymorph'),
			'AsPolymorph',
			undefined,
			CACHE,
		);
		await d.step('button form', function () {});
		await d.step('swap to anchor', async function (octane, react) {
			await octane.click('#swap');
			await react.click('#swap');
		});
		expect(d.octane.find('#poly').tagName).toBe('A');
		d.unmount();
	});

	// @parity-case differential:styled-components-global-keyframes
	it('keyframes with a dynamic letter-spacing prop', async function () {
		const d = await mountStyledDifferential(
			fixture('global-keyframes'),
			'GlobalKeyframes',
			undefined,
			CACHE,
		);
		await d.step('initial keyframed styles', function () {});
		await d.step(
			'widen',
			async function (octane, react) {
				await octane.click('#widen');
				await react.click('#widen');
			},
			{ expectSheetChange: true },
		);
		d.unmount();
	});

	// @parity-case differential:styled-components-composition
	it('styled(Styled) folding with a component selector', async function () {
		const d = await mountStyledDifferential(fixture('compose'), 'Compose', undefined, CACHE);
		await d.step('mild tone', function () {});
		await d.step(
			'hot tone',
			async function (octane, react) {
				await octane.click('#fancy');
				await react.click('#fancy');
			},
			{ expectSheetChange: true },
		);
		d.unmount();
	});
});
