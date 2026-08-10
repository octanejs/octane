import { resolve } from 'node:path';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { octane } from '../../../octane/src/compiler/vite.js';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const serverRuntime = resolve(repositoryRoot, 'packages/octane/src/server/index.ts');
const octaneEntry = resolve(repositoryRoot, 'packages/pdf/src/index.server.ts');
let server: Awaited<ReturnType<typeof createServer>>;

function normalizeMarkup(html: string): string {
	return html.replace(/<!--(?:\[|\]|\/?)-->/g, '').replace(/<!---->/g, '');
}

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: repositoryRoot,
		logLevel: 'silent',
		appType: 'custom',
		plugins: [octane({ ssr: true })],
		resolve: {
			alias: [
				{ find: /^octane$/, replacement: serverRuntime },
				{ find: /^octane\/server$/, replacement: serverRuntime },
				{ find: /^@octanejs\/pdf$/, replacement: octaneEntry },
			],
		},
		server: { middlewareMode: true, hmr: false },
	});
});

afterAll(async () => {
	await server?.close();
});

async function renderOctane(exportName: string, props: Record<string, unknown>): Promise<string> {
	const [binding, runtime] = await Promise.all([
		server.ssrLoadModule(octaneEntry),
		server.ssrLoadModule(serverRuntime),
	]);
	return normalizeMarkup(runtime.renderToStaticMarkup(binding[exportName], props).html);
}

async function loadReactAuthority() {
	class DOMMatrixShim {}
	class ImageDataShim {}
	class Path2DShim {}
	Object.assign(globalThis, {
		DOMMatrix: DOMMatrixShim,
		ImageData: ImageDataShim,
		Path2D: Path2DShim,
	});
	const [{ createElement }, { renderToStaticMarkup }, binding] = await Promise.all([
		import('react'),
		import('react-dom/server'),
		import('react-pdf'),
	]);
	return {
		binding,
		render(exportName: string, props: Record<string, unknown>) {
			const component = (binding as unknown as Record<string, unknown>)[exportName];
			return renderToStaticMarkup(createElement(component as never, props));
		},
	};
}

describe('@octanejs/pdf pristine React shell parity', () => {
	// @parity-case differential:react-pdf-document-shells
	it('matches Document no-data and loading server markup', async () => {
		const react = await loadReactAuthority();
		const cases = [
			{ className: ['custom-document'], noData: 'Choose a PDF' },
			{ className: 'custom-document', file: 'probe.pdf', loading: 'Please wait' },
		];

		for (const props of cases) {
			expect(await renderOctane('Document', props)).toBe(react.render('Document', props));
		}
	});
});
