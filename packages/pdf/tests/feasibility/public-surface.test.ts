import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import publicSurface from '../../upstream-public-surface.json';

const upstreamRoot = dirname(fileURLToPath(import.meta.resolve('react-pdf/package.json')));
const bindingRoot = resolve(import.meta.dirname, '../..');

async function listFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const path = resolve(directory, entry.name);
			return entry.isDirectory() ? listFiles(path) : [relative(upstreamRoot, path)];
		}),
	);
	return nested.flat().sort();
}

function isFrameworkPrivateEvidence(path: string): boolean {
	return (
		['LICENSE', 'README.md', 'package.json'].includes(path) ||
		/^dist\/.*\.(?:d\.ts|js)$/.test(path) ||
		/^src\/.*\.(?:css|ts|tsx)$/.test(path)
	);
}

describe('react-pdf U1 — published public-surface ledger', () => {
	// @parity-case adapted:react-pdf-runtime-surface
	it('pins the root runtime exports and package export map', async () => {
		const [rootModule, packageJson] = await Promise.all([
			readFile(resolve(upstreamRoot, 'dist/index.js'), 'utf8'),
			readFile(resolve(upstreamRoot, 'package.json'), 'utf8').then(JSON.parse),
		]);
		const exportStatement = rootModule.match(/export \{([^}]+)\};/s)?.[1];
		const runtimeExports = exportStatement
			?.split(',')
			.map((name) => name.trim())
			.filter(Boolean)
			.sort();

		expect(packageJson.version).toBe(publicSurface.authority.version);
		expect(packageJson.exports).toEqual(publicSurface.authority.exports);
		expect(runtimeExports).toEqual([...publicSurface.rootRuntimeExports].sort());
	});

	// @parity-case adapted:react-pdf-type-surface
	it('pins every root type export named by the published declaration', async () => {
		const declaration = await readFile(resolve(upstreamRoot, 'dist/index.d.ts'), 'utf8');
		for (const exportName of publicSurface.rootTypeExports) {
			expect(declaration, `missing root type ${exportName}`).toMatch(
				new RegExp(`\\b${exportName}\\b`),
			);
		}
		expect(publicSurface.rootTypeExports).toHaveLength(10);
	});

	// @parity-case adapted:react-pdf-wildcard
	it('classifies all 94 published artifacts without silently narrowing the wildcard', async () => {
		const artifacts = await listFiles(upstreamRoot);
		const exactExceptions = new Set(publicSurface.wildcardPolicy.exactPublicExceptions);
		const unclassified = artifacts.filter(
			(path) => !exactExceptions.has(path) && !isFrameworkPrivateEvidence(path),
		);

		expect(artifacts).toHaveLength(94);
		expect(unclassified).toEqual([]);
		expect([...exactExceptions].sort()).toEqual([
			'dist/Page/AnnotationLayer.css',
			'dist/Page/TextLayer.css',
		]);
		for (const path of exactExceptions) expect(artifacts).toContain(path);
	});

	// @parity-case adapted:react-pdf-documentation
	it('keeps every documented CSS and worker import in the migration contract', async () => {
		const readme = await readFile(resolve(upstreamRoot, 'README.md'), 'utf8');
		for (const entry of publicSurface.documentedSubpaths) {
			expect(readme, `README no longer documents ${entry.upstream}`).toContain(entry.upstream);
		}
	});

	// @parity-case adapted:react-pdf-css
	it('ships the two documented styles byte-for-byte with their license notices', async () => {
		for (const path of publicSurface.wildcardPolicy.exactPublicExceptions) {
			const [upstream, binding] = await Promise.all([
				readFile(resolve(upstreamRoot, path), 'utf8'),
				readFile(resolve(bindingRoot, path), 'utf8'),
			]);
			expect(binding).toBe(upstream);
			expect(binding).toContain('Licensed under the Apache License, Version 2.0');
		}
	});
});
