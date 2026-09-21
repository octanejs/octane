import { readFileSync } from 'node:fs';
import path from 'node:path';
import { satisfies } from 'semver';
import { describe, expect, it } from 'vitest';

describe('@octanejs/docusaurus package boundary', () => {
	it('pins the private upstream seam and peers on the Octane singleton', () => {
		const manifest = JSON.parse(
			readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
		);

		expect(manifest.peerDependencies['@docusaurus/core']).toBe('3.10.1');
		expect(manifest.devDependencies['@docusaurus/core']).toBe('3.10.1');
		const { version } = JSON.parse(
			readFileSync(path.resolve(import.meta.dirname, '../../octane/package.json'), 'utf8'),
		);
		expect(manifest.peerDependencies.octane).toMatch(/^workspace:\^/);
		const range = manifest.peerDependencies.octane.replace(/^workspace:/, '');
		expect(satisfies(version, range)).toBe(true);
		expect(satisfies('0.1.50', range)).toBe(false);
		expect(manifest.devDependencies.octane).toBe('workspace:*');
		expect(manifest.dependencies?.octane).toBeUndefined();
		expect(manifest.exports).toEqual(
			expect.objectContaining({
				'.': expect.any(Object),
				'./client': expect.any(Object),
				'./mdx': expect.any(Object),
				'./theme': expect.any(Object),
				'./vite': expect.any(Object),
			}),
		);
		expect(manifest.dependencies['@octanejs/remix-router']).toBe('workspace:*');
		expect(manifest.dependencies['@octanejs/seo']).toBe('workspace:*');
	});
});
