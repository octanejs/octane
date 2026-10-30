import { parseDiffFromFile, type FileDiffMetadata } from '@pierre/diffs';
import { act, createElement, createRoot, type Root } from 'octane';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffApp, type DiffAppProps } from './_fixtures/app.tsrx';

// These cases run the port against the published @pierre/diffs 1.6.1 dist, the
// way an application installs it. The adapted upstream suite covers the same
// components against the pinned source.
const oldFile = { name: 'example.ts', contents: 'const a = 1;\nconst b = 2;\n' };
const newFile = { name: 'example.ts', contents: 'const a = 1;\nconst b = 3;\n' };
const fileDiff: FileDiffMetadata = parseDiffFromFile(oldFile, newFile);

let root: Root | undefined;
let container: HTMLElement | undefined;

async function render(props: DiffAppProps): Promise<HTMLElement> {
	container ??= document.body.appendChild(document.createElement('div'));
	root ??= createRoot(container);
	await act(async () => root!.render(createElement(DiffApp, props)));
	return container;
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	root = undefined;
	container = undefined;
});

describe('@octanejs/pierre-diffs with the published @pierre/diffs dist', () => {
	for (const virtualized of [false, true]) {
		it(`renders a FileDiff into its diffs-container and slots its children (virtualized: ${virtualized})`, async () => {
			const view = await render({
				fileDiff,
				virtualized,
				lineAnnotations: [{ side: 'additions', lineNumber: 2, metadata: 'note' }],
			});
			const host = view.querySelector('diffs-container');
			expect(host).not.toBeNull();
			expect(host!.classList.contains('diff')).toBe(true);
			// The core instance owns the shadow root; Octane owns the light-DOM slots.
			expect(host!.shadowRoot).not.toBeNull();
			expect(host!.querySelector('[slot="header-metadata"]')?.textContent).toBe('metadata');
			const note = host!.querySelector('.note');
			expect(note?.textContent).toBe('note');
			expect(note!.parentElement!.getAttribute('slot')).toMatch(/annotation/);
			if (virtualized) expect(view.querySelector('.scroller')).not.toBeNull();
		});
	}

	it('updates slot content in place and removes the container on unmount', async () => {
		const view = await render({ fileDiff, metadata: 'first' });
		const host = view.querySelector('diffs-container');
		await render({ fileDiff, metadata: 'second' });
		expect(view.querySelector('diffs-container')).toBe(host);
		expect(host!.querySelector('[slot="header-metadata"]')?.textContent).toBe('second');
		await act(async () => root!.unmount());
		root = undefined;
		expect(view.querySelector('diffs-container')).toBeNull();
	});
});
