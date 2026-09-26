import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { graphApplicability } from './analyzer.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const read = (key) =>
	process.argv.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const root = path.resolve(read('root') ?? '.');
const outDir = read('out-dir');
const report = read('report');
const config = read('config') ?? path.join(root, 'vite.config.ts');
assert.ok(outDir && report, 'Pass --root, --out-dir and --report; optional --config');
assert.ok(!fs.existsSync(outDir), 'Use a fresh output directory');
assert.ok(!fs.existsSync(report), 'Use a fresh report path');
assert.ok(fs.existsSync(config), `Missing Vite config: ${config}`);
fs.mkdirSync(path.dirname(path.resolve(report)), { recursive: true });
await build({
	root,
	configFile: path.resolve(config),
	mode: 'production',
	plugins: [
		graphApplicability({
			sourceRoots: [root],
			reportFile: path.resolve(report),
			expectedOutDir: path.resolve(outDir),
		}),
	],
	build: { outDir: path.resolve(outDir), emptyOutDir: false, reportCompressedSize: false },
});
const result = JSON.parse(fs.readFileSync(report, 'utf8'));
console.log(
	JSON.stringify(
		{
			report: path.resolve(report),
			sources: result.sources.length,
			roots: result.roots.length,
			resolvedRoots: result.roots.filter((item) => item.resolvedComponent).length,
			routeHints: result.routeHints.length,
			components: result.components.length,
			syntacticallyLinkedComponents: result.components.filter(
				(item) => item.syntacticPathsFromRoots.length > 0,
			).length,
			unresolvedSites: result.components
				.flatMap((item) => item.sites)
				.filter((site) => !site.resolvedComponent).length,
			chunks: result.chunks.length,
			assets: result.assets.length,
		},
		null,
		2,
	),
);
