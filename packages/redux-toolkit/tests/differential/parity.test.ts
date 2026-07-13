import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { act as reactAct } from 'react';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/rtk-query.tsrx');
const cache = resolve(__dirname, '.react-cache');
const settle = () =>
	reactAct(async () => {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
	});

describe('differential: @octanejs/redux-toolkit vs @reduxjs/toolkit/react', () => {
	it('query mount, fulfillment, and argument swap are byte-identical', async () => {
		const pair = await mountDifferential(fixture, 'QueryApp', undefined, cache);
		await pair.step('mount', () => {});
		await pair.step('fulfilled', () => settle());
		await pair.step('swap argument', async (octane, react) => {
			await octane.click('#swap');
			await react.click('#swap');
			await settle();
		});
		pair.unmount();
	});

	it('lazy query and mutation lifecycles are byte-identical', async () => {
		const pair = await mountDifferential(fixture, 'LazyMutationApp', undefined, cache);
		await pair.step('mount', () => {});
		await pair.step('trigger both', async (octane, react) => {
			await octane.click('#load');
			await react.click('#load');
			await octane.click('#mutate');
			await react.click('#mutate');
			await settle();
		});
		pair.unmount();
	});

	it('infinite query pagination is byte-identical', async () => {
		const pair = await mountDifferential(fixture, 'InfiniteApp', undefined, cache);
		await pair.step('fulfilled first page', () => settle());
		await pair.step('next page', async (octane, react) => {
			await octane.click('#next');
			await react.click('#next');
			await settle();
		});
		pair.unmount();
	});
});
