import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { automaticStaticShell } from '../automatic/plugin.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build, version } = await import(pathToFileURL(require.resolve('vite')).href);
const root = fs.realpathSync(process.argv[2]);
const evidence = path.resolve(process.argv[3]);
const variant = process.argv[4];
assert.ok(['baseline', 'fallback'].includes(variant));
const decisions = [];
let savedManifest = false;
const captureManifest = {
	name: 'signal-chat-measure-client-manifest',
	enforce: 'post',
	apply: 'build',
	writeBundle(_options, bundle) {
		const asset = bundle['.vite/manifest.json'];
		assert.ok(asset && asset.type === 'asset', 'Vite client manifest must be present');
		fs.writeFileSync(path.join(evidence, 'client-manifest.json'), asset.source);
		savedManifest = true;
	},
};
await build({
	root,
	configFile: path.join(root, 'vite.config.ts'),
	mode: 'production',
	plugins: [
		...(variant === 'fallback'
			? automaticStaticShell({
					root,
					file: path.join(root, 'src/App.tsrx'),
					specialize: true,
					onDecision: (decision) => decisions.push(decision),
				})
			: []),
		captureManifest,
	],
});
assert.ok(savedManifest, 'Client manifest was not captured');
if (variant === 'fallback') {
	assert.ok(decisions.length > 0, 'The automatic plugin must inspect the route');
	assert.ok(
		decisions.every((decision) => decision.accepted === false),
		'The current route is outside the prototype',
	);
}
fs.writeFileSync(
	path.join(evidence, 'build.json'),
	JSON.stringify({ variant, vite: version, decisions }, null, 2) + '\n',
);
