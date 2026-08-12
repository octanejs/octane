import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateRoot } from 'octane';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { act, flushEffects, loader, settle } from '../_helpers';
import { HydratePage } from './_fixtures/hydrate.tsrx';

const FIXTURE = 'packages/monaco-editor/tests/hydration/_fixtures/hydrate.tsrx';

beforeEach(() => {
	loader.__reset();
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('@octanejs/monaco-editor — hydration', () => {
	it('adopts the server section and reaches a ready editor on the client', async () => {
		const server = await renderHydrationFixture('monaco-editor', FIXTURE, 'HydratePage', {});

		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);

		const serverPage = container.querySelector('#page')!;
		const serverHeading = container.querySelector('h1')!;
		const serverSlot = container.querySelector('#editor-slot')!;

		expect(server.html).toContain('Loading...');
		expect(server.html).not.toContain('data-monaco-ready');

		const errors = vi.spyOn(console, 'error');
		const root = hydrateRoot(container, HydratePage, {});

		expect(container.querySelector('#page')).toBe(serverPage);
		expect(container.querySelector('h1')).toBe(serverHeading);
		expect(container.querySelector('#editor-slot')).toBe(serverSlot);

		flushEffects();
		await settle();

		expect(container.querySelector('[data-monaco-ready="true"]')).toBeTruthy();
		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();

		act(() => root.unmount());
		container.remove();
	});
});
