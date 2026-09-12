import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);

describe('export surface', function () {
	// @parity-case adapted:tanstack-table-legacy-subpath
	it('publishes the pinned legacy migration entrypoint', function () {
		const reactPackageJson = JSON.parse(
			readFileSync(require.resolve('@tanstack/react-table/package.json'), 'utf8'),
		);
		const octanePackageJson = JSON.parse(
			readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
		);
		expect(reactPackageJson.exports).toHaveProperty('./legacy');
		expect(octanePackageJson.exports).toHaveProperty('./legacy', './src/legacy.ts');
	});
});
