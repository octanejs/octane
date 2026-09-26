import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build, version } = await import(pathToFileURL(require.resolve('vite')).href);
const root = fs.realpathSync(process.argv[2]);
const output = path.resolve(process.argv[3]);
const variant = process.argv[4];
assert.ok(['baseline', 'control', 'fallback'].includes(variant));
let captured = false;
const inspect = {
	name: 'runtime-size-observe-client-build',
	enforce: 'post',
	apply: 'build',
	generateBundle(_options, bundle) {
		const chunks = {};
		for (const item of Object.values(bundle)) {
			if (item.type !== 'chunk') continue;
			const modules = {};
			for (const [id, rendered] of Object.entries(item.modules)) {
				const info = this.getModuleInfo(id);
				modules[id] = {
					renderedLength: rendered.renderedLength,
					originalLength: rendered.originalLength,
					renderedExports: rendered.renderedExports,
					removedExports: rendered.removedExports,
					importedIds: info?.importedIds ?? [],
					dynamicallyImportedIds: info?.dynamicallyImportedIds ?? [],
					importers: info?.importers ?? [],
					dynamicImporters: info?.dynamicImporters ?? [],
				};
			}
			chunks[item.fileName] = {
				isEntry: item.isEntry,
				isDynamicEntry: item.isDynamicEntry,
				imports: item.imports,
				dynamicImports: item.dynamicImports,
				exports: item.exports,
				modules,
			};
		}
		fs.writeFileSync(path.join(output, 'chunk-modules.json'), JSON.stringify(chunks, null, 2));
	},
	writeBundle(_options, bundle) {
		const manifest = bundle['.vite/manifest.json'];
		assert.ok(manifest && manifest.type === 'asset', 'Client manifest is required');
		fs.writeFileSync(path.join(output, 'client-manifest.json'), manifest.source);
		captured = true;
	},
};
await build({
	root,
	configFile: path.join(root, 'vite.config.ts'),
	mode: 'production',
	// The third route-runner slot is a minifier control, not a shell fallback.
	build: { sourcemap: 'hidden', ...(variant === 'fallback' ? { minify: 'terser' } : {}) },
	plugins: [inspect],
});
assert.ok(captured, 'Client build was not captured');
fs.writeFileSync(
	path.join(output, 'build.json'),
	JSON.stringify(
		{ variant, minifier: variant === 'fallback' ? 'terser' : 'vite-default', vite: version },
		null,
		2,
	) + '\n',
);
