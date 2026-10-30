import { parseDiffFromFile } from '@pierre/diffs';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { DiffApp } from '../_fixtures/app.tsrx';

const fileDiff = parseDiffFromFile(
	{ name: 'example.ts', contents: 'const a = 1;\nconst b = 2;\n' },
	{ name: 'example.ts', contents: 'const a = 1;\nconst b = 3;\n' },
);

function withoutComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

describe('@octanejs/pierre-diffs on octane/server', () => {
	it('renders prerendered HTML as a declarative shadow root beside the slotted children', async () => {
		expect(typeof window).toBe('undefined');
		const { prerenderedHTML } = await preloadFileDiff({ fileDiff });
		const { html } = renderToString(DiffApp, {
			fileDiff,
			prerenderedHTML,
			lineAnnotations: [{ side: 'additions', lineNumber: 2, metadata: 'note' }],
		});
		// Hydration markers are Octane's own; compare the markup around them.
		const markup = withoutComments(html);
		const host = /<diffs-container class="diff">([\s\S]*)<\/diffs-container>/.exec(markup);
		expect(host).not.toBeNull();
		const template = /^<template shadowrootmode="open">([\s\S]*?)<\/template>/.exec(host![1]);
		expect(template?.[1]).toBe(withoutComments(prerenderedHTML));
		expect(host![1]).toContain(
			'<div slot="header-metadata"><span class="meta">metadata</span></div>',
		);
		expect(host![1]).toContain('<span class="note">note</span>');
	});

	it('renders only the slotted children without prerendered HTML, and inside a Virtualizer', () => {
		for (const virtualized of [false, true]) {
			const { html } = renderToString(DiffApp, { fileDiff, virtualized });
			expect(html).toContain('<diffs-container class="diff">');
			expect(html).not.toContain('<template');
			expect(html).toContain('<span class="meta">metadata</span>');
			expect(html.includes('class="scroller"')).toBe(virtualized);
		}
	});
});
