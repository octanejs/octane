import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { act as reactAct } from 'react';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/rtk-query.tsrx');
const cache = resolve(__dirname, '.react-cache');

async function waitForText(
	pair: Awaited<ReturnType<typeof mountDifferential>>,
	expected: Record<string, string>,
): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		await pair.observe('poll for terminal RTK Query state', async () => {
			await reactAct(async () => {
				await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
			});
		});
		if (
			[pair.octane, pair.react].every((mount) =>
				Object.entries(expected).every(
					([selector, text]) => mount.find(selector).textContent === text,
				),
			)
		) {
			for (const mount of [pair.octane, pair.react]) {
				for (const [selector, text] of Object.entries(expected)) {
					expect(mount.find(selector).textContent).toBe(text);
				}
			}
			return;
		}
	}

	throw new Error(
		`RTK Query state did not settle: ${JSON.stringify({
			expected,
			octane: pair.octane.container.innerHTML,
			react: pair.react.container.innerHTML,
		})}`,
	);
}

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/redux-toolkit vs @reduxjs/toolkit/react', () => {
	// @parity-case differential:redux-toolkit-query
	it('query mount, fulfillment, and argument swap are byte-identical', async () => {
		const pair = await mountDifferential(fixture, 'QueryApp', undefined, cache);
		await waitForText(pair, {
			'#first': 'first=value-a:fulfilled',
			'#second': 'second=value-b:fulfilled',
			'#selected': 'selected=value-selected',
		});
		await pair.step('initial queries fulfilled', () => {});
		await pair.observe('swap argument', async (octane, react) => {
			await octane.click('#swap');
			await react.click('#swap');
		});
		await waitForText(pair, { '#first': 'first=value-c:fulfilled' });
		await pair.step('swapped query fulfilled', () => {});
		pair.unmount();
	});

	// @parity-case differential:redux-toolkit-lazy-mutation
	it('lazy query and mutation initial and fulfilled outcomes are byte-identical', async () => {
		const pair = await mountDifferential(fixture, 'LazyMutationApp', undefined, cache);
		await pair.step('mount', () => {});
		await pair.observe('trigger both', async (octane, react) => {
			await octane.click('#load');
			await react.click('#load');
			await octane.click('#mutate');
			await react.click('#mutate');
		});
		await waitForText(pair, {
			'#lazy': 'lazy=value-lazy:fulfilled',
			'#mutation': 'mutation=mutated-mutation:fulfilled',
		});
		await pair.step('lazy query and mutation fulfilled', () => {});
		pair.unmount();
	});

	// @parity-case differential:redux-toolkit-infinite-query
	it('infinite query pagination is byte-identical', async () => {
		const pair = await mountDifferential(fixture, 'InfiniteApp', undefined, cache);
		await waitForText(pair, { '#pages': 'pages=page-0:fulfilled' });
		await pair.step('fulfilled first page', () => {});
		await pair.observe('request next page', async (octane, react) => {
			await octane.click('#next');
			await react.click('#next');
		});
		await waitForText(pair, { '#pages': 'pages=page-0|page-1:fulfilled' });
		await pair.step('next page fulfilled', () => {});
		pair.unmount();
	});
});
