import type { Editor } from '@tiptap/core';
import { flushSync, hydrateRoot } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { DeferredEditor } from '../_fixtures/deferred-editor.tsrx';
import { DeferredCustomViews } from '../_fixtures/deferred-custom-views.tsrx';
import { flushEffects } from '../_helpers';

// The server-visible shell while useEditor's server snapshot is null, rendered
// by Octane's server: its hydration markers are part of the protocol, so the
// client adopts that output rather than hand-written markup.
async function serverShell(fixture: string, exportName: string): Promise<string> {
	return (
		await renderHydrationFixture('tiptap', `packages/tiptap/tests/_fixtures/${fixture}`, exportName)
	).html;
}

function settle(): void {
	flushEffects();
	flushSync(() => {});
	flushEffects();
}

async function settlePortals(): Promise<void> {
	settle();
	await Promise.resolve();
	settle();
	await Promise.resolve();
	settle();
}

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/tiptap hydration', () => {
	it('adopts the deferred server host and mounts a live editor after hydration', async () => {
		const html = await serverShell('deferred-editor.tsrx', 'DeferredEditor');
		vi.useFakeTimers();
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const serverMain = container.querySelector('main');
		const serverStatus = container.querySelector('#deferred-status');
		const serverSelection = container.querySelector('#deferred-selection');
		let editor: Editor | undefined;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, DeferredEditor, {
			onEditor: (currentEditor: Editor) => {
				editor = currentEditor;
			},
		});
		expect(container.querySelector('main')).toBe(serverMain);
		expect(container.querySelector('#deferred-status')).toBe(serverStatus);
		expect(container.querySelector('#deferred-selection')).toBe(serverSelection);
		expect(serverStatus?.textContent).toBe('deferred');
		expect(serverSelection?.textContent).toBe('deferred');

		settle();
		expect(container.querySelector('main')).toBe(serverMain);
		expect(container.querySelector('#deferred-status')).toBe(serverStatus);
		expect(container.querySelector('#deferred-selection')).toBe(serverSelection);
		expect(serverStatus?.textContent).toBe('ready');
		expect(serverSelection?.textContent).toBe('Hydrated editor');
		expect(container.querySelector('[data-editor-host="deferred"] .ProseMirror')?.textContent).toBe(
			'Hydrated editor',
		);
		expect(editor).toBeTruthy();
		expect(error).not.toHaveBeenCalled();

		root.unmount();
		flushEffects();
		vi.runAllTimers();
		expect(editor?.isDestroyed).toBe(true);
		error.mockRestore();
		container.remove();
	});

	it('adopts a deferred shell before mounting an interactive custom view and menu', async () => {
		const html = await serverShell('deferred-custom-views.tsrx', 'DeferredCustomViews');
		vi.useFakeTimers();
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const serverMain = container.querySelector('#deferred-custom-views');
		const serverTitle = container.querySelector('#deferred-custom-title');
		const serverAction = container.querySelector('#deferred-shell-action');
		let editor: Editor | undefined;
		let menuElement: HTMLDivElement | null = null;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const root = hydrateRoot(container, DeferredCustomViews, {
			onEditor: (currentEditor: Editor) => {
				editor = currentEditor;
			},
			onMenuRef: (element: HTMLDivElement | null) => {
				menuElement = element;
			},
		});
		expect(container.querySelector('#deferred-custom-views')).toBe(serverMain);
		expect(container.querySelector('#deferred-custom-title')).toBe(serverTitle);
		expect(container.querySelector('#deferred-shell-action')).toBe(serverAction);
		expect(container.querySelector('#deferred-custom-status')?.textContent).toBe('deferred');

		await settlePortals();
		expect(container.querySelector('#deferred-custom-views')).toBe(serverMain);
		expect(container.querySelector('#deferred-custom-title')).toBe(serverTitle);
		expect(container.querySelector('#deferred-shell-action')).toBe(serverAction);
		expect(container.querySelector('#deferred-custom-status')?.textContent).toBe('ready');
		expect(container.querySelector('#deferred-custom-text')?.textContent).toBe(
			'Hydrated panel content',
		);
		expect(container.querySelector('[data-hydration-node-theme]')?.textContent).toBe('hydrated');
		expect(container.querySelector('[data-hydration-node-content]')?.textContent).toBe(
			'Hydrated panel content',
		);
		expect(menuElement).toBeInstanceOf(HTMLDivElement);
		expect(menuElement?.querySelector('[data-hydration-menu-action]')?.textContent).toBe(
			'menu action',
		);

		(serverAction as HTMLButtonElement).click();
		(container.querySelector('[data-hydration-node-action]') as HTMLButtonElement).click();
		(menuElement?.querySelector('[data-hydration-menu-action]') as HTMLButtonElement).click();
		settle();
		expect(container.querySelector('#deferred-shell-clicks')?.textContent).toBe('shell:1');
		expect(container.querySelector('[data-hydration-node-action]')?.textContent).toBe('node:1');
		expect(container.querySelector('#deferred-menu-clicks')?.textContent).toBe('menu:1');
		expect(error).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();

		root.unmount();
		flushEffects();
		vi.runAllTimers();
		expect(editor?.isDestroyed).toBe(true);
		expect(menuElement).toBe(null);
		expect(error).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
		error.mockRestore();
		warn.mockRestore();
		container.remove();
	});
});
