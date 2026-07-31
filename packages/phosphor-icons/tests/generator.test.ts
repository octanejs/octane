// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

describe('@octanejs/phosphor-icons — generator', () => {
	it('is deterministic for the pinned core metadata and assets', () => {
		expect(
			execFileSync(process.execPath, ['scripts/generate.mjs', '--check'], {
				cwd: packageRoot,
				encoding: 'utf8',
			}),
		).toContain('1512 icons');
	});

	it('rejects changed generated output', () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-phosphor-generator-'));
		try {
			cpSync(packageRoot, fixtureRoot, {
				recursive: true,
				filter: (source) => !source.includes(`${join(packageRoot, 'node_modules')}`),
			});
			symlinkSync(join(packageRoot, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');
			const camera = join(fixtureRoot, 'src/icons/camera.ts');
			writeFileSync(camera, `${readFileSync(camera, 'utf8')}\n// stale\n`);

			const result = spawnSync(process.execPath, ['scripts/generate.mjs', '--check'], {
				cwd: fixtureRoot,
				encoding: 'utf8',
			});
			expect(result.status).toBe(1);
			expect(result.stderr).toContain('stale src/icons/camera.ts');
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});
});
