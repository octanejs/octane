import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { capturePairedArtifacts, waitForPreviewPortsClosed } from './pair-artifacts.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = {
	'index.html': Buffer.from('<script type="module" src="/assets/index.js"></script>'),
	'assets/index.js': Buffer.from('globalThis.label = "café";\n'),
	'octane-client-build.json': Buffer.from('{"id":"fixture"}\n'),
};

async function fixture(t, responseFor = (file) => files[file]) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-paired-artifacts-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const trees = Object.fromEntries(
		['base', 'head'].map((side) => [side, path.join(directory, side)]),
	);
	for (const tree of Object.values(trees)) {
		for (const relative of [
			'pnpm-lock.yaml',
			'benchmarks/js-framework/pair.mjs',
			'benchmarks/js-framework/pair-artifacts.mjs',
			'benchmarks/js-framework/operations.mjs',
			'benchmarks/lib/stats.mjs',
			'benchmarks/js-framework/octane-jsx/src/Main.tsx',
		]) {
			const file = path.join(tree, relative);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, 'fixture input\n');
		}
		fs.writeFileSync(path.join(tree, 'package.json'), '{"private":true}\n');
		for (const [relative, bytes] of Object.entries(files)) {
			const file = path.join(tree, 'benchmarks/js-framework/octane-jsx/dist', relative);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, bytes);
		}
	}
	const server = createServer((req, res) => {
		const file = req.url === '/' ? 'index.html' : req.url.slice(1);
		const bytes = responseFor(file);
		if (!bytes) {
			res.writeHead(404).end('missing asset');
			return;
		}
		res.writeHead(200, { 'Content-Encoding': 'gzip' });
		res.end(gzipSync(bytes));
	});
	await new Promise((resolve) => server.listen(0, 'localhost', resolve));
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const port = server.address().port;
	return {
		directory: path.join(directory, 'artifacts'),
		options: {
			trees,
			fixtures: [{ name: 'octane-jsx', directory: 'octane-jsx', base: port, head: port }],
			chromiumExecutable: process.execPath,
		},
		port,
	};
}

test('captures complete build bytes and verifies decoded HTTP response bytes for both sides', async (t) => {
	const { directory, options } = await fixture(t);
	await capturePairedArtifacts(directory, options);
	const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
	assert.equal(manifest.failed, undefined);
	for (const side of ['base', 'head']) {
		const captured = manifest.trees[side].fixtures['octane-jsx'];
		assert.deepEqual(Object.keys(captured.dist).sort(), Object.keys(files).sort());
		for (const [relative, bytes] of Object.entries(files)) {
			assert.equal(captured.dist[relative].sha256, hash(bytes));
			assert.equal(captured.served[relative].sha256, hash(bytes));
			assert.equal(captured.served[relative].headers['content-encoding'], 'gzip');
			for (const kind of ['dist', 'served']) {
				assert.deepEqual(
					fs.readFileSync(path.join(directory, side, 'octane-jsx', kind, relative)),
					bytes,
				);
			}
		}
	}
});

test('rejects stale served JavaScript while retaining the conflicting bodies and failure manifest', async (t) => {
	const stale = Buffer.from('globalThis.label = "old";\n');
	const { directory, options } = await fixture(t, (file) =>
		file.endsWith('.js') ? stale : files[file],
	);
	await assert.rejects(
		capturePairedArtifacts(directory, options),
		/Served artifact differs from build/,
	);
	const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
	assert.match(manifest.failed, /base\/octane-jsx\/assets\/index.js/);
	const captured = manifest.trees.base.fixtures['octane-jsx'];
	assert.equal(captured.dist['assets/index.js'].sha256, hash(files['assets/index.js']));
	assert.equal(captured.served['assets/index.js'].sha256, hash(stale));
	assert.deepEqual(
		fs.readFileSync(path.join(directory, 'base/octane-jsx/served/assets/index.js')),
		stale,
	);
});

test('rejects a missing served artifact and preserves its HTTP status', async (t) => {
	const { directory, options } = await fixture(t, (file) =>
		file.endsWith('.js') ? undefined : files[file],
	);
	await assert.rejects(
		capturePairedArtifacts(directory, options),
		/Served artifact differs from build.*404/,
	);
	const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
	assert.equal(manifest.trees.base.fixtures['octane-jsx'].served['assets/index.js'].status, 404);
});

test('reports a port still in use without terminating its listener', async (t) => {
	const { port } = await fixture(t);
	await assert.rejects(waitForPreviewPortsClosed([port], 50), /Preview ports still open/);
	assert.equal((await fetch(`http://localhost:${port}/`)).status, 200);
});
