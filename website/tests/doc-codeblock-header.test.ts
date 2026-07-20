// Doc code fences render inside a labelled panel: a header strip carrying the
// fence language and a copy button (the same header treatment PackageInstall
// uses). The language comes from the data-language the shiki transformer stamps
// on each <pre>; this proves it flows through to a visible label.
import { it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { getRouter } from '../src/router.ts';

afterEach(cleanup);

async function renderRoute(url: string) {
	const router = getRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as never, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return utils;
}

it('labels each doc code block with its fence language and a copy button', async () => {
	const { container } = await renderRoute('/docs/quick-start');

	const panels = container.querySelectorAll('.codeblock');
	expect(panels.length).toBeGreaterThan(0);

	const labels = Array.from(container.querySelectorAll('.codeblock .codeblock-name')).map((el) =>
		el.textContent?.trim(),
	);
	// The quick-start uses .tsrx and shell fences; every panel gets a header
	// label, and none is the empty string or the unresolved "text" fallback.
	expect(labels.length).toBe(panels.length);
	expect(labels.every((l) => l && l !== 'text')).toBe(true);
	expect(labels).toContain('tsrx');

	// Every panel's header carries a working copy button.
	const copyButtons = container.querySelectorAll('.codeblock .codeblock-copy-bar');
	expect(copyButtons.length).toBe(panels.length);
});
