import { resolve } from 'node:path';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { createServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';

import { octane } from '../../../octane/src/compiler/vite.js';
import { PdfShell } from './pdf-shell.tsrx';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const fixturePath = resolve(import.meta.dirname, 'pdf-shell.tsrx');
const serverRuntime = resolve(repositoryRoot, 'packages/octane/src/server/index.ts');

async function renderServerShell(): Promise<string> {
	const server = await createServer({
		configFile: false,
		root: repositoryRoot,
		logLevel: 'silent',
		appType: 'custom',
		plugins: [octane({ ssr: true })],
		resolve: {
			alias: [
				{ find: /^octane$/, replacement: serverRuntime },
				{ find: /^octane\/server$/, replacement: serverRuntime },
			],
		},
		server: { middlewareMode: true, hmr: false },
	});

	try {
		const [fixture, runtime] = await Promise.all([
			server.ssrLoadModule(fixturePath),
			server.ssrLoadModule(serverRuntime),
		]);
		return runtime.renderToString(fixture.PdfShell, {}).html;
	} finally {
		await server.close();
	}
}

describe('react-pdf U1 — shell hydration', () => {
	// @parity-case adapted:react-pdf-hydration
	it('adopts the deterministic server shell and activates client effects', async () => {
		const container = document.createElement('div');
		container.innerHTML = await renderServerShell();
		document.body.appendChild(container);
		const serverSection = container.querySelector('.react-pdf__Document');
		const serverMessage = container.querySelector('.react-pdf__message');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, PdfShell);
			drainPassiveEffects();
			flushSync(() => {});
			await Promise.resolve();

			expect(container.querySelector('.react-pdf__Document')).toBe(serverSection);
			expect(container.querySelector('.react-pdf__message')).toBe(serverMessage);
			expect(serverSection?.getAttribute('data-phase')).toBe('client');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});
