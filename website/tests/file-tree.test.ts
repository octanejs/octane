// The generated-file listings in the docs. Two things are being protected: the
// nesting is real markup rather than indentation inside a string, and the
// listing is NOT a code block — every fence in the docs is mapped to `DocPre`,
// which hangs a copy button off it, and there is nothing here to paste.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, waitFor } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { getRouter } from '../src/router.ts';
import { FileTree } from '../src/components/FileTree.tsrx';

afterEach(cleanup);

function mount(entries: { path: string; note?: string }[], label = 'Generated files') {
	return render(FileTree as any, { props: { entries, label } });
}

describe('FileTree', () => {
	it('folds a shared directory into one node holding both files', () => {
		const { container } = mount([
			{ path: 'index.html' },
			{ path: 'src/App.tsrx', note: 'the landing page' },
			{ path: 'src/server/health.ts', note: 'GET /api/health' },
		]);

		const top = container.querySelectorAll(':scope > div > ul > li');
		// index.html and src — `src` appears once even though two paths cross it.
		expect(Array.from(top).map((li) => li.querySelector('.ft-name')?.textContent)).toEqual([
			'index.html',
			'src',
		]);

		// Nesting is markup, so the depth of a path is the depth of its list item.
		const health = Array.from(container.querySelectorAll('.ft-name')).find(
			(el) => el.textContent === 'health.ts',
		)!;
		expect(health.closest('ul')?.parentElement?.querySelector('.ft-name')?.textContent).toBe(
			'server',
		);
	});

	it('shows a note against the file it describes, never the directory above it', () => {
		const { container } = mount([{ path: 'src/server/health.ts', note: 'GET /api/health' }]);

		const rows = Array.from(container.querySelectorAll('.ft-row')).map((row) => ({
			name: row.querySelector('.ft-name')?.textContent,
			note: row.querySelector('.ft-note')?.textContent ?? null,
		}));
		expect(rows).toEqual([
			{ name: 'src', note: null },
			{ name: 'server', note: null },
			{ name: 'health.ts', note: 'GET /api/health' },
		]);
	});

	it('names the tree for assistive technology', () => {
		const { container } = mount([{ path: 'index.html' }], 'Files created by the spa template');
		expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
			'Files created by the spa template',
		);
	});
});

describe('the CLI page’s scaffold listings', () => {
	it('renders them as trees rather than copyable code blocks', async () => {
		const router = getRouter({ history: createMemoryHistory({ initialEntries: ['/docs/cli'] }) });
		await router.load();
		const { container } = render(RouterProvider as any, { props: { router } });
		await waitFor(() => {
			if (!container.querySelector('.doc-hero')) throw new Error('CLI document not committed');
		});

		const trees = container.querySelectorAll('.prose [role="group"] ul');
		expect(trees.length).toBeGreaterThanOrEqual(2);

		// The listings carry no copy affordance, because a file list is not
		// something anyone pastes. Real snippets on this page keep theirs.
		for (const group of container.querySelectorAll('.prose [role="group"]')) {
			expect(group.querySelector('.codeblock-copy')).toBeNull();
			expect(group.querySelector('pre')).toBeNull();
		}
		expect(container.querySelector('.prose pre.shiki')).toBeTruthy();
	});
});
