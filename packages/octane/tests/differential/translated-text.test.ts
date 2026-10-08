import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { translateTextHosts } from '../_page-translation.js';
import {
	mountDifferential,
	preloadDifferentialFixture,
	type DiffMount,
	type DiffPair,
} from './_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/translated-text.tsrx');
const SPREAD_FIXTURE = resolve(__dirname, '../_fixtures/translated-text-spread.tsrx');

await Promise.all([
	preloadDifferentialFixture(FIXTURE),
	preloadDifferentialFixture(SPREAD_FIXTURE),
]);

// React writes a host's only string child through setTextContent, which
// replaces whatever a page translator put there on the next update, so the page
// shows the new message rather than a stale translation.
function translate(m: DiffMount, selector: string): void {
	translateTextHosts(m.container, selector);
}

// Translate, update, update again untranslated, then translate the restored
// text and update once more.
async function translateThenAdvance(d: DiffPair, selector: string): Promise<void> {
	const next = async (i: DiffMount, r: DiffMount) => {
		await i.click('button');
		await r.click('button');
	};
	await d.step('mount', () => {});
	await d.step('translate', (i, r) => {
		translate(i, selector);
		translate(r, selector);
	});
	await d.step('next message', next);
	await d.step('next message, untranslated', next);
	await d.step('next message, untranslated again', next);
	await d.step('translate again', (i, r) => {
		translate(i, selector);
		translate(r, selector);
	});
	await d.step('next message after the second translation', next);
	d.unmount();
}

describe('differential: a translated only-child text host keeps updating', () => {
	it('replaces translated text in an explicit text binding', async () => {
		await translateThenAdvance(await mountDifferential(FIXTURE, 'TextBinding'), '#text');
	});

	it('replaces translated text in a text binding whose host has other bindings', async () => {
		await translateThenAdvance(await mountDifferential(FIXTURE, 'ClassedTextBinding'), '#text');
	});

	it('replaces translated text in a custom element text binding', async () => {
		await translateThenAdvance(await mountDifferential(FIXTURE, 'CustomElementText'), '#text');
	});

	it('replaces translated text in a renderable value hole', async () => {
		await translateThenAdvance(await mountDifferential(FIXTURE, 'RenderableHole'), '#hole');
	});

	it('replaces translated text in keyed rows', async () => {
		await translateThenAdvance(await mountDifferential(FIXTURE, 'KeyedRows'), 'b, i');
	});

	it('replaces translated text in keyed rows that read component state', async () => {
		await translateThenAdvance(await mountDifferential(FIXTURE, 'KeyedRowsReadingState'), 'b, i');
	});

	it('clears translated text when the hole switches to an element', async () => {
		await translateThenAdvance(await mountDifferential(FIXTURE, 'TextToElement'), '#hole');
	});

	it('replaces translated text in a host with spread props', async () => {
		await translateThenAdvance(await mountDifferential(SPREAD_FIXTURE, 'SpreadHost'), '#hole');
	});

	it('clears translated text when a spread host switches to an element', async () => {
		await translateThenAdvance(
			await mountDifferential(SPREAD_FIXTURE, 'SpreadTextToElement'),
			'#hole',
		);
	});

	it('clears translated text when the next message is empty', async () => {
		const d = await mountDifferential(FIXTURE, 'RenderableHole');
		await d.step('advance to Goodbye', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		await d.step('translate', (i, r) => {
			translate(i, '#hole');
			translate(r, '#hole');
		});
		await d.step('next message is empty', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		await d.step('message after empty', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		d.unmount();
	});
});
