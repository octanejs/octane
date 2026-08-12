import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifestUrl = new URL('../../package.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

test('publishes the mapped root and package metadata entries', () => {
	assert.deepEqual(Object.keys(manifest.exports), ['.', './package.json']);
	assert.deepEqual(manifest.exports['.'], {
		types: './src/index.tsrx',
		import: './src/index.tsrx',
		require: './src/index.tsrx',
	});
	assert.equal(manifest.exports['./package.json'], './package.json');
});

test('ships consumer guidance and immutable upstream provenance', async () => {
	const files = new Set(manifest.files);
	for (const name of ['src', 'README.md', 'UPSTREAM.md', 'LICENSE']) {
		assert.ok(files.has(name), `missing published ${name}`);
	}
	const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
	assert.match(readme, /Migrate from React/);
	assert.match(readme, /never uploads files/i);
});
