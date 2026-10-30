import { preloadFileTree } from '@pierre/trees';
import { act, hydrateRoot } from 'octane';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './_fixtures/app.tsrx';
import { BASE_OPTIONS, flushDom, installFileTreeDom, renderedPaths } from './_dom';
import { renderToString, ServerApp } from './_server';

beforeAll(installFileTreeDom);

afterEach(() => {
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('@octanejs/pierre-trees server rendering and hydration', () => {
	it('serves the preloaded tree as a declarative shadow root and hydrates it in place', async () => {
		const options = { ...BASE_OPTIONS, id: 'ssr-tree' };
		const preloadedData = preloadFileTree(options);
		const props = { options, preloadedData };

		// A server has no `window`, so FileTree writes the preloaded shadow root out.
		vi.stubGlobal('window', undefined);
		let html: string;
		try {
			html = renderToString(ServerApp, props);
		} finally {
			vi.unstubAllGlobals();
		}
		expect(html).toContain(
			`<template shadowrootmode="open">${preloadedData.shadowHtml}</template>`,
		);

		const container = document.body.appendChild(document.createElement('div'));
		container.innerHTML = html;
		const host = container.querySelector('file-tree-container');
		if (!(host instanceof HTMLElement)) throw new Error('expected the server host');
		expect(host.id).toBe('ssr-tree');
		// The @pierre/trees element attaches a declarative shadow root that reaches
		// the page through innerHTML, as a browser's HTML parser does for a page.
		expect(host.querySelector('template')).toBeNull();
		const serverTree = host.shadowRoot?.querySelector('[data-file-tree-id]');
		const serverHeader = host.querySelector('[data-test-header]');
		expect(serverTree).toBeInstanceOf(HTMLElement);
		expect(serverHeader?.textContent).toBe('Header action 0');

		const errors = vi.spyOn(console, 'error');
		const warnings = vi.spyOn(console, 'warn');
		const root = await act(async () => {
			const hydrated = hydrateRoot(container, App, props);
			await flushDom();
			return hydrated;
		});
		try {
			expect(errors).not.toHaveBeenCalled();
			expect(warnings).not.toHaveBeenCalled();
			// The host, the header, and the tree the server rendered are adopted.
			expect(container.querySelector('file-tree-container')).toBe(host);
			expect(host.querySelector('[data-test-header]')).toBe(serverHeader);
			expect(host.shadowRoot!.querySelector('[data-file-tree-id]')).toBe(serverTree);
			expect(renderedPaths(host)).toContain('README.md');

			await act(async () => {
				(serverHeader as HTMLButtonElement).click();
				await flushDom();
			});
			expect(serverHeader?.textContent).toBe('Header action 1');
		} finally {
			await act(async () => root.unmount());
		}
	});
});
