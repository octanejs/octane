import { parseDiffFromFile } from '@pierre/diffs';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { act, createElement, hydrateRoot, type Root } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiffApp, type DiffAppProps } from './_fixtures/app.tsrx';
import { renderDiffAppToString } from './_server';

const fileDiff = parseDiffFromFile(
	{ name: 'example.ts', contents: 'const a = 1;\nconst b = 2;\n' },
	{ name: 'example.ts', contents: 'const a = 1;\nconst b = 3;\n' },
);

// A browser's HTML parser attaches each `<template shadowrootmode>` as its
// parent's shadow root before the parent upgrades, so the diffs-container
// element keeps the server's shadow root. Neither innerHTML nor jsdom does that:
// parse into inert template content, attach the roots there, then insert.
function insertServerHTML(container: HTMLElement, html: string): void {
	const parsed = document.createElement('template');
	parsed.innerHTML = html;
	for (const template of parsed.content.querySelectorAll<HTMLTemplateElement>(
		'template[shadowrootmode]',
	)) {
		template.parentElement!.attachShadow({ mode: 'open' }).append(template.content);
		template.remove();
	}
	container.append(parsed.content);
}

let root: Root | undefined;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	document.body.replaceChildren();
});

describe('@octanejs/pierre-diffs hydration', () => {
	it('adopts the server-rendered diff and its prerendered shadow root', async () => {
		const { prerenderedHTML } = await preloadFileDiff({ fileDiff });
		const props: DiffAppProps = {
			fileDiff,
			prerenderedHTML,
			lineAnnotations: [{ side: 'additions', lineNumber: 2, metadata: 'note' }],
		};
		const container = document.body.appendChild(document.createElement('div'));
		insertServerHTML(container, renderDiffAppToString(props));
		const host = container.querySelector('diffs-container')!;
		const shadowRoot = host.shadowRoot!;
		const serverRows = shadowRoot.querySelectorAll('[data-line]').length;
		const note = host.querySelector('.note');
		const metadata = host.querySelector('.meta');
		expect(serverRows).toBeGreaterThan(0);

		const recoverable = vi.fn();
		await act(async () => {
			root = hydrateRoot(container, createElement(DiffApp, props), {
				onRecoverableError: recoverable,
			});
		});

		expect(recoverable).not.toHaveBeenCalled();
		expect(container.querySelector('diffs-container')).toBe(host);
		expect(host.shadowRoot).toBe(shadowRoot);
		expect(host.querySelector('.note')).toBe(note);
		expect(host.querySelector('.meta')).toBe(metadata);
		expect(shadowRoot.querySelectorAll('[data-line]').length).toBe(serverRows);
	});
});
