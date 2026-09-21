import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { satisfies } from 'semver';
import { describe, expect, it } from 'vitest';
import * as root from '@octanejs/livestore';
import * as experimental from '@octanejs/livestore/experimental';

const packagePath = resolve(process.cwd(), 'packages/livestore/package.json');

describe('published package contract', () => {
	it('matches the pinned renderer surface at the root and experimental entry', () => {
		expect(Object.keys(root).sort()).toEqual([
			'LiveList',
			'StoreRegistry',
			'StoreRegistryContext',
			'StoreRegistryProvider',
			'captureStackInfo',
			'storeOptions',
			'useClientDocument',
			'useQuery',
			'useQueryRef',
			'useStore',
			'useStoreRegistry',
			'useSyncStatus',
			'withReactApi',
		]);
		expect(experimental.LiveList).toBe(root.LiveList);
	});

	it('publishes only Octane and the released framework-neutral closure', async () => {
		const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as {
			dependencies: Record<string, string>;
			peerDependencies: Record<string, string>;
			devDependencies: Record<string, string>;
		};
		expect(Object.keys(manifest.dependencies).sort()).toEqual([
			'@livestore/common',
			'@livestore/framework-toolkit',
			'@livestore/livestore',
			'@livestore/utils',
			'@opentelemetry/api',
		]);
		expect(Object.keys(manifest.peerDependencies)).toEqual(['octane']);
		expect(manifest.peerDependencies.octane).toMatch(/^workspace:\^/);
		const { version } = JSON.parse(
			await readFile(resolve(process.cwd(), 'packages/octane/package.json'), 'utf8'),
		) as { version: string };
		const range = manifest.peerDependencies.octane.replace(/^workspace:/, '');
		expect(satisfies(version, range)).toBe(true);
		expect(satisfies('0.1.50', range)).toBe(false);
		expect(manifest.dependencies).not.toHaveProperty('react');
		expect(manifest.devDependencies.react).toBe('catalog:livestore-react-oracle');
		expect(manifest.devDependencies['@types/react']).toBe('catalog:livestore-react-oracle');
	});
});
