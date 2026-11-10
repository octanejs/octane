// @vitest-environment node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, type Platform } from 'esbuild';
import { expect, it } from 'vitest';
import * as clientDocument from '../src/compiled/serverDocument.client.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

// Where a bundler targeting `platform` resolves the compiled Document's
// `#server-document` import.
async function resolveServerDocument(platform: Platform): Promise<string> {
	let resolved = '';
	await build({
		stdin: { contents: "import '#server-document';", resolveDir: root },
		bundle: true,
		write: false,
		platform,
		logLevel: 'silent',
		plugins: [
			{
				name: 'capture',
				setup(builder) {
					builder.onResolve({ filter: /^#server-document$/ }, async (args) => {
						if (args.pluginData) return undefined;
						const result = await builder.resolve(args.path, {
							kind: args.kind,
							resolveDir: args.resolveDir,
							pluginData: true,
						});
						resolved = path.relative(root, result.path);
						return { path: result.path, external: true };
					});
				},
			},
		],
	});
	return resolved;
}

// <html>, <head>, and <body> compile to element descriptors, so a browser build
// must not reach them: only the server renders the document elements.
it('resolves the server document to an empty stub in browser builds', async () => {
	expect(await resolveServerDocument('browser')).toBe(
		path.join('src', 'compiled', 'serverDocument.client.ts'),
	);
	expect(await resolveServerDocument('node')).toBe(
		path.join('src', 'compiled', 'serverDocument.tsrx'),
	);
	expect(clientDocument.ServerHtml).toBeNull();
	expect(clientDocument.ServerHead).toBeNull();
	expect(clientDocument.ServerBody).toBeNull();
});
