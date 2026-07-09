// Playground tests — the in-browser compile pipeline (the same
// `octane/compiler` call the page makes) plus the /playground route's static
// shell. The full editor/preview stack (CodeMirror + Shiki + blob-module
// execution) is browser-only and is exercised by the dev-SSR path, not jsdom.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from '../src/app/router.ts';
import { compilePlayground, DEFAULT_SOURCES } from '../src/lib/playground.ts';

afterEach(cleanup);

async function renderRoute(url: string) {
	const router = makeRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return { router, ...utils };
}

describe('playground compile pipeline', () => {
	it('compiles the default TSRX source to client runtime code', () => {
		const result = compilePlayground(DEFAULT_SOURCES.tsrx, 'tsrx');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.code).toContain("from 'octane'");
			// The snippet's @for lowers to the runtime's keyed list block.
			expect(result.code).toContain('forBlock');
			// The scoped <style> block emits a CSS injection.
			expect(result.code).toContain('injectStyle');
		}
	});

	it('compiles the default TSX source to client runtime code', () => {
		const result = compilePlayground(DEFAULT_SOURCES.tsx, 'tsx');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.code).toContain("from 'octane'");
			// TS annotations must be gone — the playground executes this directly.
			expect(result.code).not.toContain('useState<');
		}
	});

	it('reports compile errors instead of throwing', () => {
		const result = compilePlayground('export function App() @{ <div>{oops</div> }', 'tsrx');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
	});
});

describe('/playground route', () => {
	it('renders the shell: mode switch, view switch, and both panels', async () => {
		const { container } = await renderRoute('/playground');

		// Source-language switch (disabled until the editor stack boots).
		const langGroup = container.querySelector('[aria-label="Source language"]');
		const langButtons = Array.from(langGroup?.querySelectorAll('button') ?? []);
		expect(langButtons.map((b) => b.textContent?.trim())).toEqual(['TSRX', 'TSX']);

		// Result view switch — live preview vs compiled output.
		const viewGroup = container.querySelector('[aria-label="Result view"]');
		const viewButtons = Array.from(viewGroup?.querySelectorAll('button') ?? []);
		expect(viewButtons.map((b) => b.textContent?.trim())).toEqual(['Preview', 'Compiled output']);

		// Both panels exist; preview is the visible one by default.
		expect(container.querySelector('.pg-preview')).toBeTruthy();
		expect(container.querySelector('.pg-preview')?.classList.contains('hidden')).toBe(false);
		expect(container.querySelectorAll('.pg-editor').length).toBe(2);

		// The mobile pane toggle exists (CSS shows it only under 980px).
		const paneGroup = container.querySelector('.pg-mobile-toggle');
		const paneButtons = Array.from(paneGroup?.querySelectorAll('button') ?? []);
		expect(paneButtons.map((b) => b.textContent?.trim())).toEqual(['Editor', 'Result']);

		// The nav carries the playground link.
		const navLink = Array.from(container.querySelectorAll('a.nav-link')).find(
			(a) => a.getAttribute('href') === '/playground',
		);
		expect(navLink).toBeTruthy();

		// The playground fills the viewport — the layout renders no footer here.
		expect(container.querySelector('footer')).toBeNull();
	});

	it('other routes keep the footer', async () => {
		const { container } = await renderRoute('/');
		expect(container.querySelector('footer')).toBeTruthy();
	});
});
