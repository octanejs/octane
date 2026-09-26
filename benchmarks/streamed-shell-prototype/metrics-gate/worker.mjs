import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
assert.ok(['baseline', 'stub'].includes(variant));
const matches = [];
let manifestWritten = false;
const diagnostic = {
	name: 'metrics-activation-graph-only',
	enforce: 'post',
	apply: 'build',
	transform(code, id, options) {
		if (variant !== 'stub' || options?.ssr || this.environment?.config?.consumer === 'server')
			return null;
		const [file, query] = id.split('?');
		if (file !== path.join(root, 'src/App.tsrx') || query !== 'octane-hydrate=4') return null;
		// Do not silently target a different island if the source/compiler changes.
		assert.ok(code.includes('Metrics.tsrx'), 'Expected the compiled Metrics activation');
		matches.push({ id, compiledSha256: createHash('sha256').update(code).digest('hex') });
		// Deliberately nonfunctional: no adoption, updates, events, timer or cleanup.
		return { code: 'export default function metricsGraphOnlyStub() {}', map: null };
	},
	generateBundle(_options, bundle) {
		const chunks = {};
		for (const item of Object.values(bundle)) {
			if (item.type !== 'chunk') continue;
			chunks[item.fileName] = {
				imports: item.imports,
				dynamicImports: item.dynamicImports,
				modules: Object.keys(item.modules),
			};
		}
		fs.writeFileSync(path.join(output, 'chunk-modules.json'), JSON.stringify(chunks, null, 2));
	},
	writeBundle(_options, bundle) {
		const asset = bundle['.vite/manifest.json'];
		assert.ok(asset && asset.type === 'asset', 'Client manifest is required');
		fs.writeFileSync(path.join(output, 'client-manifest.json'), asset.source);
		manifestWritten = true;
	},
};
await build({
	root,
	configFile: path.join(root, 'vite.config.ts'),
	mode: 'production',
	plugins: [diagnostic],
});
assert.ok(manifestWritten, 'Client manifest was not captured');
assert.equal(matches.length, variant === 'stub' ? 1 : 0, 'Unexpected substitution count');
fs.writeFileSync(
	path.join(output, 'build.json'),
	JSON.stringify({ variant, vite: version, matches }, null, 2) + '\n',
);
