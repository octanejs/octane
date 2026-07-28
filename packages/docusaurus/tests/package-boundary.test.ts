import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('@octanejs/docusaurus package boundary', () => {
	it('pins the private upstream seam and peers on the Octane singleton', () => {
		const manifest = JSON.parse(
			readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
		);

		expect(manifest.peerDependencies['@docusaurus/core']).toBe('3.10.1');
		expect(manifest.devDependencies['@docusaurus/core']).toBe('3.10.1');
		expect(manifest.peerDependencies.octane).toBe('workspace:*');
		expect(manifest.devDependencies.octane).toBe('workspace:*');
		expect(manifest.dependencies?.octane).toBeUndefined();
		expect(manifest.exports).toEqual(
			expect.objectContaining({
				'.': expect.any(Object),
				'./mdx': expect.any(Object),
				'./vite': expect.any(Object),
			}),
		);
	});
});
