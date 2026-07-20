import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageDirectory, '../..');

function collectFiles(entryPath: string): Array<string> {
	if (!existsSync(entryPath)) return [];
	if (!statSync(entryPath).isDirectory()) return [entryPath];
	return readdirSync(entryPath).flatMap((entry) => collectFiles(resolve(entryPath, entry)));
}

describe('@octanejs/tanstack-start package boundary', () => {
	it('publishes only repository-owned Start and router integration', () => {
		const manifestPath = resolve(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			files: Array<string>;
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const dependencyNames = Object.keys({
			...manifest.dependencies,
			...manifest.peerDependencies,
			...manifest.devDependencies,
		});
		const forbiddenPackagePrefixes = ['@tanstack/octane-start', '@tanstack/octane-router'];

		expect(
			dependencyNames.filter((name) =>
				forbiddenPackagePrefixes.some((prefix) => name.startsWith(prefix)),
			),
		).toEqual([]);
		expect(manifest.dependencies?.['@octanejs/tanstack-router']).toBe('workspace:*');

		const publishedFiles = [
			manifestPath,
			...manifest.files.flatMap((entry) => collectFiles(resolve(packageDirectory, entry))),
		];
		const forbiddenPublishedText = [
			...forbiddenPackagePrefixes,
			'packages/tanstack-start/vendor',
			'pkg.pr.new',
		];
		const violations = publishedFiles.flatMap((file) => {
			const source = readFileSync(file, 'utf8');
			return forbiddenPublishedText
				.filter((text) => source.includes(text))
				.map((text) => `${file}: ${text}`);
		});

		expect(violations).toEqual([]);
	});

	it('does not retain upstream vendor artifacts or workspace registration', () => {
		const workspace = readFileSync(resolve(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');

		expect(existsSync(resolve(packageDirectory, 'vendor'))).toBe(false);
		expect(existsSync(resolve(packageDirectory, 'tanstack-octane-native-injection.patch'))).toBe(
			false,
		);
		expect(workspace).not.toContain('packages/tanstack-start/vendor');
	});
});
