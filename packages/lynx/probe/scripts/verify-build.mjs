import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import {
	decode_napi as decodeNativeBundleWithNapi,
	decode_wasm as decodeNativeBundleWithWasm,
	supportNapi,
} from '@lynx-js/tasm';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('../dist/', import.meta.url);
const LOCKFILE = new URL('../package-lock.json', import.meta.url);

const expectedBundles = [
	'imperative.lynx.bundle',
	'imperative.web.bundle',
	'main.lynx.bundle',
	'main.web.bundle',
];
const summary = {};
for (const filename of expectedBundles) {
	const file = new URL(filename, DIST);
	const metadata = await stat(file);
	assert.ok(metadata.size > 100, `${filename} must contain an encoded Lynx application`);
	const content = await readFile(file);
	const text = content.toString('utf8');
	assert.doesNotMatch(text, /@lynx-js\/react|ReactLynx|preact/i);
	assert.doesNotMatch(text, /structuredClone/);
	if (filename.endsWith('.lynx.bundle')) {
		const decoded = supportNapi()
			? decodeNativeBundleWithNapi(content)
			: await decodeNativeBundleWithWasm(content);
		assert.equal(decoded['engine-version'], '3.9');
		assert.ok(decoded['main-thread-script']);
		assert.ok(decoded['background-thread-script']);
		assert.doesNotMatch(JSON.stringify(decoded), /@lynx-js\/react|ReactLynx|preact/i);
	} else {
		assert.match(text, /main-thread\.js/);
		assert.match(text, /background\.js/);
	}
	summary[filename] = metadata.size;
}

const lockfile = JSON.parse(await readFile(LOCKFILE, 'utf8'));
const installedPackages = Object.keys(lockfile.packages ?? {});
assert.equal(
	installedPackages.some(
		(path) =>
			path.includes('node_modules/@lynx-js/react') || /node_modules\/preact(?:\/|$)/.test(path),
	),
	false,
	'the probe dependency graph must not install ReactLynx or Preact',
);
const rsbuildVersions = new Set(
	installedPackages
		.filter((path) => path.endsWith('node_modules/@rsbuild/core'))
		.map((path) => lockfile.packages[path].version),
);
assert.deepEqual([...rsbuildVersions], ['2.1.4']);
const rspackVersions = new Set(
	installedPackages
		.filter((path) => path.endsWith('node_modules/@rspack/core'))
		.map((path) => lockfile.packages[path].version),
);
assert.deepEqual([...rspackVersions], ['2.1.3']);

process.stdout.write(
	`${JSON.stringify(
		{
			bundleBytes: summary,
			probeRoot: ROOT.pathname,
			rsbuildVersions: [...rsbuildVersions],
			rspackVersions: [...rspackVersions],
		},
		null,
		2,
	)}\n`,
);
