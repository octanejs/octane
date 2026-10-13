import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { Feedback } from '@dnd-kit/dom';
import { KeyboardSensor } from '@octanejs/dnd-kit';
import { flushEffects } from '../../../octane/tests/_helpers';
import { SERVER_HTML } from './server-html';
import { ServerFixture, latestManager } from '../ssr/_fixtures/server.tsrx';

function expandCountedMarkers(html: string): string {
	return html.replace(/<!--([\[\]])([1-9]\d*)-->/g, (whole, marker: string, raw: string) => {
		const count = Number(raw);
		return Number.isSafeInteger(count) && count > 1 ? `<!--${marker}-->`.repeat(count) : whole;
	});
}

async function settle(): Promise<void> {
	flushSync(() => {});
	flushEffects();
	await Promise.resolve();
	await Promise.resolve();
	flushEffects();
	flushSync(() => {});
}

let container: HTMLElement;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	container = document.createElement('div');
	container.innerHTML = SERVER_HTML;
	document.body.appendChild(container);
	error = vi.spyOn(console, 'error');
});

afterEach(() => {
	expect(error.mock.calls).toEqual([]);
	error.mockRestore();
	container.remove();
});

describe('@octanejs/dnd-kit hydration', () => {
	it('adopts server nodes, registers entities, and becomes keyboard interactive', async () => {
		const main = container.querySelector('#server-dnd');
		const source = container.querySelector('#server-drag') as HTMLButtonElement;
		const target = container.querySelector('#server-drop') as HTMLElement;
		const root = hydrateRoot(container, ServerFixture, {
			sensors: [KeyboardSensor],
			plugins: [Feedback],
		});
		await settle();

		expect(expandCountedMarkers(container.innerHTML)).toBe(SERVER_HTML);
		expect(container.querySelector('#server-dnd')).toBe(main);
		expect(container.querySelector('#server-drag')).toBe(source);
		expect(latestManager.registry.draggables.has('server-drag')).toBe(true);
		expect(latestManager.registry.droppables.has('server-drop')).toBe(true);
		expect(latestManager.registry.draggables.has('server-sort')).toBe(true);
		expect(latestManager.registry.droppables.has('server-sort')).toBe(true);

		vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 40, 40));
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 80, 80));
		source.dispatchEvent(
			new KeyboardEvent('keydown', {
				bubbles: true,
				cancelable: true,
				code: 'Space',
				key: ' ',
			}),
		);
		await settle();
		expect(latestManager.dragOperation.status.dragging).toBe(true);
		expect(container.querySelector('#server-overlay')?.textContent).toBe('not active');

		source.dispatchEvent(
			new KeyboardEvent('keydown', {
				bubbles: true,
				cancelable: true,
				code: 'Escape',
				key: 'Escape',
			}),
		);
		await settle();
		root.unmount();
	});
});
