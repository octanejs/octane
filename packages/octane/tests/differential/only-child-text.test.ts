import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential, preloadDifferentialFixture, type DiffPair } from './_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/only-child-text.tsrx');
const SPREAD_FIXTURE = resolve(__dirname, '../_fixtures/only-child-text-spread.tsrx');

await Promise.all([
	preloadDifferentialFixture(FIXTURE),
	preloadDifferentialFixture(SPREAD_FIXTURE),
]);

async function advanceMessages(d: DiffPair): Promise<void> {
	await d.step('mount', () => {});
	for (const step of ['next value', 'empty text', 'restored text']) {
		await d.step(step, async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
	}
	d.unmount();
}

describe('differential: only-child text updates', () => {
	it('updates an explicit text binding through empty text', async () => {
		await advanceMessages(await mountDifferential(FIXTURE, 'TextBinding'));
	});

	it('updates text whose host has other bindings', async () => {
		await advanceMessages(await mountDifferential(FIXTURE, 'ClassedTextBinding'));
	});

	it('updates a custom element text binding', async () => {
		await advanceMessages(await mountDifferential(FIXTURE, 'CustomElementText'));
	});

	it('updates a renderable value hole through empty text', async () => {
		await advanceMessages(await mountDifferential(FIXTURE, 'RenderableHole'));
	});

	it('updates text in keyed rows', async () => {
		await advanceMessages(await mountDifferential(FIXTURE, 'KeyedRows'));
	});

	it('updates text in keyed rows that read component state', async () => {
		await advanceMessages(await mountDifferential(FIXTURE, 'KeyedRowsReadingState'));
	});

	it('switches from text to an element and back', async () => {
		await advanceMessages(await mountDifferential(FIXTURE, 'TextToElement'));
	});

	it('updates text in a host with spread props', async () => {
		await advanceMessages(await mountDifferential(SPREAD_FIXTURE, 'SpreadHost'));
	});

	it('switches a spread host from text to an element and back', async () => {
		await advanceMessages(await mountDifferential(SPREAD_FIXTURE, 'SpreadTextToElement'));
	});
});
