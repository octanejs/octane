import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'octane/compiler';
import { JSDOM } from 'jsdom';
import { vi } from 'vitest';

export async function bundleRuntime(project, mode, contents, external = [], loader) {
	const target = path.join(project, mode + '.mjs');
	await build({
		stdin: {
			resolveDir: project,
			contents,
		},
		outfile: target,
		bundle: true,
		platform: 'node',
		format: 'esm',
		loader,
		external: ['react', 'react-dom', 'react-dom/*', ...external],
		plugins: [
			{
				name: 'real-tsrx',
				setup(b) {
					b.onLoad({ filter: /\.tsrx$/ }, async ({ path: file }) => ({
						contents: compile(await readFile(file, 'utf8'), file, { mode }).code,
						loader: 'js',
						resolveDir: path.dirname(file),
					}));
				},
			},
		],
	});
	return import(/* @vite-ignore */ pathToFileURL(target).href);
}

export function installDOM() {
	const dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
	for (const name of [
		'window',
		'document',
		'Element',
		'HTMLElement',
		'Text',
		'Node',
		'Comment',
		'MutationObserver',
		'Event',
		'navigator',
	]) {
		vi.stubGlobal(name, dom.window[name]);
	}
	vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
	return dom;
}
