// @vitest-environment jsdom
import { flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hydrateDocusaurusRoot } from '@octanejs/docusaurus/hydrate';
import { executeHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { nextPaint } from '../../octane/tests/_helpers';
import type { DocusaurusPrerenderResult } from '../types/server.js';
import {
	createDocusaurusTestManifest,
	createDocusaurusTestRegistry,
} from './_fixtures/docusaurus-app.js';

const originalUrl = window.location.href;

afterEach(() => {
	window.history.replaceState(null, '', originalUrl);
	document.body.replaceChildren();
});

async function flushRouting() {
	for (let index = 0; index < 4; index++) {
		await Promise.resolve();
		flushSync(() => {});
		await nextPaint();
	}
}

describe('Docusaurus hydration', () => {
	it('does not hydrate when its signal is already aborted', async () => {
		const container = document.createElement('div');
		const signal = AbortSignal.abort();

		await expect(
			hydrateDocusaurusRoot(
				container,
				createDocusaurusTestManifest(),
				createDocusaurusTestRegistry(),
				{ signal },
			),
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(container.childNodes).toHaveLength(0);
	});

	it('adopts prerendered route nodes and keeps client navigation live', async () => {
		const url = new URL('/docs/guide/intro', window.location.origin).href;
		const serverResult = await executeHydrationFixture<DocusaurusPrerenderResult>(
			'docusaurus',
			'packages/docusaurus/tests/ssr/_fixtures/hydration.ts',
			'renderDocusaurusHydrationRoute',
			url,
		);
		window.history.replaceState(null, '', url);

		const container = document.createElement('div');
		container.innerHTML = serverResult.html;
		document.body.appendChild(container);
		const serverSection = container.querySelector('section');
		const serverArticle = container.querySelector('article');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const loads: string[] = [];
		const hydration = await hydrateDocusaurusRoot(
			container,
			createDocusaurusTestManifest(),
			createDocusaurusTestRegistry(loads),
		);

		try {
			expect(errors).not.toHaveBeenCalled();
			expect(container.querySelector('section')).toBe(serverSection);
			expect(container.querySelector('article')).toBe(serverArticle);
			expect(container.querySelector('h1')?.textContent).toBe('Introduction');
			expect(loads).not.toContain('advanced');

			await hydration.router.navigate('/docs/guide/advanced');
			await flushRouting();

			expect(container.querySelector('section')).toBe(serverSection);
			expect(container.querySelector('h1')?.textContent).toBe('Advanced');
			expect(container.querySelector('p')?.textContent).toBe('Advanced body');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			hydration.root.unmount();
			hydration.router.dispose();
			errors.mockRestore();
		}
	});
});
