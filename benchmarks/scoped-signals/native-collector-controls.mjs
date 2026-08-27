import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// These protocol controls supplement the public compiled renderer checks. They
// run in a separate bundle so the measured collector's exports and code stay
// unchanged, and never assert which implementation path a scope takes.
export function checkCollectorObserverRestoration(api) {
	const owner = {};
	const source = { getVersion: () => 7 };
	const reads = [];
	const intercepted = [];
	const collector = api.createNativeReadCollector((...read) => reads.push(read));
	const render = collector.beginRender(owner);
	const outer = collector.beginScope(owner);
	const inherited = api.getNativeReadObserver();
	const observer = (...read) => intercepted.push(read);
	api.setNativeReadObserver(observer);
	try {
		const nested = collector.beginScope(owner);
		try {
			api.reportNativeRead(source, source.getVersion());
			assert.deepEqual(reads, [[owner, source, 7]], 'A nested scope must collect its own read');
			assert.equal(intercepted.length, 0, 'The enclosing observer must not steal a scope read');
		} finally {
			collector.endScope(nested);
		}
		assert.equal(api.getNativeReadObserver(), observer, 'Restore the enclosing observer');
		api.reportNativeRead(source, source.getVersion());
		assert.deepEqual(intercepted, [[source, 7]], 'The enclosing observer must remain usable');
		assert.equal(reads.length, 1, 'Restored enclosing reads must not join the nested scope');
	} finally {
		api.setNativeReadObserver(inherited);
		collector.endScope(outer);
		collector.endRender(render);
	}
	assert.equal(api.getNativeReadObserver(), null);
	assert.equal(api.isNativeWriteGuarded(), false);
	return { observerRestored: true, nestedReadCollected: true, enclosingObserverUsable: true };
}

export function checkCollectorWriteGuardRestoration(api) {
	const owner = {};
	const source = { getVersion: () => 7 };
	const reads = [];
	const collector = api.createNativeReadCollector((...read) => reads.push(read));
	const render = collector.beginRender(owner);
	const outer = collector.beginScope(owner);
	api.endNativeWriteGuard(false);
	try {
		const nested = collector.beginScope(owner);
		try {
			assert.equal(api.isNativeWriteGuarded(), true, 'The nested scope must guard writes');
			api.reportNativeRead(source, source.getVersion());
			assert.deepEqual(reads, [[owner, source, 7]], 'A guarded scope must still collect reads');
		} finally {
			collector.endScope(nested);
		}
		assert.equal(api.isNativeWriteGuarded(), false, 'Restore the enclosing writable region');
	} finally {
		api.endNativeWriteGuard(true);
		collector.endScope(outer);
		collector.endRender(render);
	}
	assert.equal(api.getNativeReadObserver(), null);
	assert.equal(api.isNativeWriteGuarded(), false);
	return { nestedScopeGuarded: true, readsCollected: true, enclosingWriteGuardRestored: true };
}

export async function runNativeCollectorControls(
	target,
	{ build, readInput, hash, repo, scratch },
) {
	const name = target.label + ':collector-controls';
	const entry = [
		`export { createNativeReadCollector } from ${JSON.stringify(path.join(target.root, 'packages/octane/src/signals/native-read-collector.ts'))};`,
		`export { reportNativeRead, getNativeReadObserver, setNativeReadObserver, isNativeWriteGuarded, endNativeWriteGuard } from ${JSON.stringify(path.join(target.root, 'packages/octane/src/signals/read-protocol.ts'))};`,
	].join('\n');
	const output = await build({
		absWorkingDir: repo,
		stdin: { contents: entry, sourcefile: name + '.mjs', resolveDir: repo },
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		platform: 'node',
		format: 'esm',
		target: 'es2022',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"' },
		logLevel: 'silent',
		plugins: [
			{
				name: 'native-collector-controls-source-inputs',
				setup(plugin) {
					plugin.onLoad({ filter: /\.ts$/ }, ({ path: file }) => ({
						contents: readInput(file),
						loader: 'ts',
						resolveDir: path.dirname(file),
					}));
				},
			},
		],
	});
	const code = output.outputFiles[0].text;
	const file = path.join(scratch, target.label + '-collector-controls.mjs');
	fs.writeFileSync(file, code);
	const api = await import(pathToFileURL(file).href);
	assert.equal(api.getNativeReadObserver(), null);
	assert.equal(api.isNativeWriteGuarded(), false);
	return {
		name,
		target: target.label,
		method: 'Untimed observer and write-guard restoration controls in a separate collector bundle.',
		helperSha256: hash(readInput(import.meta.filename)),
		entrySha256: hash(entry),
		bundleSha256: hash(code),
		bundleBytes: Buffer.byteLength(code),
		inputs: Object.keys(output.metafile.inputs)
			.filter((input) => !input.endsWith(name + '.mjs'))
			.map((input) => ({ path: input, sha256: hash(readInput(path.resolve(repo, input))) })),
		observer: checkCollectorObserverRestoration(api),
		writeGuard: checkCollectorWriteGuardRestoration(api),
	};
}
