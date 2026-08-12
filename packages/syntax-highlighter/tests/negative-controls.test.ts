import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	verifyEntrypointSurfaces,
	verifyGeneratedTree,
	verifyRequiredLaneIds,
	verifyTypeCaseInventory,
} from '../scripts/parity-guards.mjs';

async function write(root: string, path: string, value: string) {
	await mkdir(join(root, path, '..'), { recursive: true });
	await writeFile(join(root, path), value);
}

describe('react-syntax-highlighter negative controls', () => {
	// @parity-case conformance:negative-controls
	it('fails closed for missing, extra, renamed, collided, stale, and removed-lane evidence', async () => {
		const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
		execFileSync(process.execPath, ['scripts/generate-surface.mjs', '--check'], {
			cwd: packageRoot,
			stdio: 'pipe',
		});
		execFileSync(process.execPath, ['scripts/generate-adapted-tests.mjs', '--check'], {
			cwd: packageRoot,
			stdio: 'pipe',
		});
		const root = await mkdtemp(join(tmpdir(), 'octane-react-syntax-highlighter-'));
		const expected = join(root, 'expected');
		const actual = join(root, 'actual');
		await write(expected, 'nested/entry.js', 'expected');
		await write(actual, 'nested/entry.js', 'expected');
		await expect(verifyGeneratedTree(expected, actual, 'fixture')).resolves.toBeUndefined();

		await writeFile(join(actual, 'nested/entry.js'), 'stale');
		await expect(verifyGeneratedTree(expected, actual, 'fixture')).rejects.toThrow('file is stale');
		await writeFile(join(actual, 'nested/entry.js'), 'expected');
		await write(actual, 'extra.js', 'extra');
		await expect(verifyGeneratedTree(expected, actual, 'fixture')).rejects.toThrow(
			'paths are stale',
		);
		await rm(join(actual, 'extra.js'));
		await rename(join(actual, 'nested/entry.js'), join(actual, 'nested/renamed.js'));
		await expect(verifyGeneratedTree(expected, actual, 'fixture')).rejects.toThrow(
			'paths are stale',
		);
		await rm(join(actual, 'nested/renamed.js'));
		await expect(verifyGeneratedTree(expected, actual, 'fixture')).rejects.toThrow(
			'paths are stale',
		);

		expect(() => verifyEntrypointSurfaces(['a', 'a'], ['a', 'a'], 2)).toThrow('collision');
		expect(() => verifyEntrypointSurfaces(['a'], ['b'], 1)).toThrow('identical');
		expect(() => verifyRequiredLaneIds(['runtime'], ['runtime', 'types'])).toThrow(
			'required parity lanes changed',
		);
		expect(() =>
			verifyTypeCaseInventory(
				'// @type-case retained\nconst retained = true;',
				'const retained = true;',
				['retained'],
				[],
			),
		).toThrow('required parity lanes changed');
		await rm(root, { recursive: true, force: true });
	});
});
