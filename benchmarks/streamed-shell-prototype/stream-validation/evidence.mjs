import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const inputs = [
	'pnpm-lock.yaml',
	'packages/octane/tests/hydration/_fixtures/streamed-static-shell.tsrx',
	'packages/octane/tests/hydration/_fixtures/streamed-static-shell-client.ts',
	'packages/octane/src/hydration/stream-delivery.ts',
	'packages/octane/src/hydration/streamed-signals.ts',
	'benchmarks/streamed-shell-prototype/streamed-baseline.ts',
	'benchmarks/streamed-shell-prototype/streamed-candidate.ts',
	'benchmarks/streamed-shell-prototype/streamed-hydrate.ts',
	'benchmarks/streamed-shell-prototype/stream-validation/evidence.mjs',
	'benchmarks/streamed-shell-prototype/stream-validation/server-entry.ts',
	'benchmarks/streamed-shell-prototype/stream-validation/run.mjs',
	'benchmarks/streamed-shell-prototype/stream-validation/node-jsdom.mjs',
];

function sha256(file) {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function emittedFiles(directory) {
	const files = ['server.mjs'];
	function visit(relative) {
		for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
			const file = path.join(relative, entry.name);
			if (entry.isDirectory()) visit(file);
			else if (file !== path.join(relative.split(path.sep)[0], 'package.json')) files.push(file);
		}
	}
	visit('baseline');
	visit('candidate');
	return files.sort();
}

function hashes(directory, files) {
	return Object.fromEntries(files.map((file) => [file, sha256(path.join(directory, file))]));
}

export function writeEvidence(repo, directory, metadata) {
	const manifest = {
		version: 1,
		...metadata,
		inputs: hashes(repo, inputs),
		emitted: hashes(directory, emittedFiles(directory)),
	};
	fs.writeFileSync(
		path.join(directory, 'manifest.json'),
		JSON.stringify(manifest, null, 2) + '\n',
		{ flag: 'wx' },
	);
	return sha256(path.join(directory, 'manifest.json'));
}

export function verifyEvidence(repo, directory) {
	const manifestFile = path.join(directory, 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
	assert.equal(manifest.version, 1);
	assert.deepEqual(Object.keys(manifest.inputs).sort(), [...inputs].sort());
	assert.deepEqual(
		hashes(repo, inputs),
		manifest.inputs,
		'Selected authored inputs changed after the build',
	);
	assert.deepEqual(
		hashes(directory, emittedFiles(directory)),
		manifest.emitted,
		'Emitted assets changed after the build',
	);
	return sha256(manifestFile);
}
