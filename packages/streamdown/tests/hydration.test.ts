import { describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { ServerDocument } from './_fixtures/server-document.tsrx';

const SERVER_HTML =
	'<!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><div class="space-y-4 whitespace-normal [&amp;>*:first-child]:mt-0 [&amp;>*:last-child]:mb-0"><!--[--><!--[--><!--[--><!--[--><h1 class="mt-6 mb-2 font-semibold text-3xl" data-streamdown="heading-1">Hydrate</h1><!--]--><!--]--><!--[-->\n<!--]--><!--[--><!--[--><p>Stable.</p><!--]--><!--]--><!--]--><!--]--></div><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]-->';

const expandCountedHydrationMarkers = (html: string): string =>
	html.replace(/<!--([\[\]])([1-9]\d*)-->/g, (whole, marker: string, rawCount: string) => {
		const count = Number(rawCount);
		return Number.isSafeInteger(count) && count > 1 ? `<!--${marker}-->`.repeat(count) : whole;
	});

describe('@octanejs/streamdown hydration', () => {
	it('adopts server Markdown and updates the same document afterward', async () => {
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.appendChild(container);

		const heading = container.querySelector('h1');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, ServerDocument, {
			content: '# Hydrate\n\nStable.',
		});

		flushSync(() => {});
		drainPassiveEffects();

		expect(expandCountedHydrationMarkers(container.innerHTML)).toBe(SERVER_HTML);
		expect(container.querySelector('h1')).toBe(heading);
		expect(error).not.toHaveBeenCalled();

		root.render(ServerDocument, {
			content: '# Hydrate\n\nUpdated.\n\n```ts\nconst answer = 42;\n```',
			mode: 'streaming',
		});
		await vi.waitFor(() => {
			flushSync(() => {});
			drainPassiveEffects();
			expect(container.querySelector('p')?.textContent).toBe('Updated.');
		});
		expect(container.querySelector('[data-streamdown="code-block"]')?.textContent).toContain(
			'const answer = 42;',
		);
		expect(error).not.toHaveBeenCalled();
		const streamingHeading = container.querySelector('h1');

		root.render(ServerDocument, {
			content: '# Hydrate\n\nShort.',
			mode: 'streaming',
		});
		await vi.waitFor(() => {
			flushSync(() => {});
			drainPassiveEffects();
			expect(container.querySelector('p')?.textContent).toBe('Short.');
		});
		expect(container.querySelectorAll('[data-streamdown="code-block"]')).toHaveLength(0);
		expect(container.querySelector('h1')).toBe(streamingHeading);
		expect(error).not.toHaveBeenCalled();

		root.unmount();
		error.mockRestore();
		container.remove();
	});
});
