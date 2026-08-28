import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function flatten(entry) {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function toPortable(path) {
	return path.split(sep).join('/');
}

/** Verifies the pinned Better Auth source, export metadata, tests, and license evidence. */
export function verifyBetterAuthUpstream(root = packageRoot) {
	const upstream = join(root, 'upstream');
	const sums = join(upstream, 'SHA256SUMS');
	const expected = new Map(
		readFileSync(sums, 'utf8')
			.trim()
			.split('\n')
			.map(function parseLine(line) {
				const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
				if (match === null) throw new Error(`Invalid SHA256SUMS entry: ${line}`);
				return [match[2], match[1]];
			}),
	);

	const actualFiles = walk(upstream)
		.map(function toRelative(path) {
			return toPortable(relative(upstream, path));
		})
		.filter(function keepEvidence(path) {
			return path !== 'SHA256SUMS';
		})
		.sort();
	const expectedFiles = [...expected.keys()].sort();

	if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
		throw new Error('Vendored Better Auth file inventory differs from upstream/SHA256SUMS');
	}

	for (const path of actualFiles) {
		const bytes = readFileSync(join(upstream, path));
		const hash = createHash('sha256').update(bytes).digest('hex');
		if (hash !== expected.get(path)) throw new Error(`Vendored byte drift: ${path}`);
	}

	const required = [
		'LICENSE.md',
		'packages/better-auth/package.json',
		'packages/better-auth/src/client/client-declaration.test.ts',
		'packages/better-auth/src/client/client.test.ts',
		'packages/better-auth/src/client/react/index.ts',
		'packages/better-auth/src/client/react/react-store.ts',
		'packages/better-auth/src/plugins/additional-fields/additional-fields.test.ts',
	];
	for (const path of required) {
		if (!existsSync(join(upstream, path))) throw new Error(`Missing upstream artifact: ${path}`);
	}

	const manifest = JSON.parse(
		readFileSync(join(upstream, 'packages/better-auth/package.json'), 'utf8'),
	);
	const reactExport = manifest.exports?.['./react'];
	if (
		manifest.name !== 'better-auth' ||
		manifest.version !== '1.6.29' ||
		manifest.license !== 'MIT' ||
		reactExport?.['dev-source'] !== './src/client/react/index.ts' ||
		reactExport?.types !== './dist/client/react/index.d.mts' ||
		reactExport?.default !== './dist/client/react/index.mjs'
	) {
		throw new Error('Better Auth package or React export metadata differs from the pinned release');
	}

	const license = readFileSync(join(upstream, 'LICENSE.md'), 'utf8');
	if (
		!license.includes('The MIT License (MIT)') ||
		!license.includes('Copyright (c) 2024 - present, Bereket Engida')
	) {
		throw new Error('Better Auth license evidence does not contain the pinned MIT notice');
	}

	const clientTest = readFileSync(
		join(upstream, 'packages/better-auth/src/client/client.test.ts'),
		'utf8',
	);
	const declarationTest = readFileSync(
		join(upstream, 'packages/better-auth/src/client/client-declaration.test.ts'),
		'utf8',
	);
	const fieldsTest = readFileSync(
		join(upstream, 'packages/better-auth/src/plugins/additional-fields/additional-fields.test.ts'),
		'utf8',
	);
	if (
		!clientTest.includes('createAuthClient as createReactClient') ||
		!clientTest.includes('from "./react"')
	) {
		throw new Error('Pinned shared client test no longer imports the React entry');
	}
	if (!declarationTest.includes('from "better-auth/react"')) {
		throw new Error('Pinned declaration test no longer imports better-auth/react');
	}
	if (
		!fieldsTest.includes('createAuthClient as createReactAuthClient') ||
		!fieldsTest.includes('from "../../client/react"')
	) {
		throw new Error('Pinned additional-fields test no longer imports the React entry');
	}

	return {
		files: actualFiles.length,
		integrity: `sha256:${createHash('sha256').update(readFileSync(sums)).digest('hex')}`,
	};
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
	const result = verifyBetterAuthUpstream();
	console.log(`Better Auth upstream evidence is current (${result.files} byte-exact files).`);
}
