import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const checker = path.join(packageRoot, 'scripts/check-upstream-crosswalk.mjs');
const manifestPath = path.join(packageRoot, 'audit/upstream-crosswalk.json');

async function runMutation(mutate: (manifest: Record<string, any>) => void, args: string[] = []) {
	const directory = await mkdtemp(path.join(tmpdir(), 'octane-drei-crosswalk-'));
	const target = path.join(directory, 'upstream-crosswalk.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	mutate(manifest);
	await writeFile(target, JSON.stringify(manifest));
	return spawnSync(process.execPath, [checker, ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: { ...process.env, OCTANE_DREI_CROSSWALK_PATH: target },
	});
}

describe('Drei crosswalk guard', { timeout: 30_000 }, () => {
	it('accepts the committed inventory while work remains explicitly classified as gaps', async () => {
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
		const result = spawnSync(process.execPath, [checker], {
			cwd: repositoryRoot,
			encoding: 'utf8',
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`379 exports, ${manifest.expectedTotals.gaps as number} gaps`);
	});

	it('rejects duplicate upstream exports', async () => {
		const result = await runMutation((manifest) => {
			manifest.exports.push({ ...manifest.exports[0] });
			manifest.expectedTotals.sourceExports += 1;
			manifest.expectedTotals.gaps += 1;
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('expected 379 source exports');
	});

	it('rejects classified exports whose evidence disappeared', async () => {
		const result = await runMutation((manifest) => {
			const entry = manifest.exports.find((candidate) => candidate.status !== 'gap');
			entry.evidence = ['packages/drei/tests/does-not-exist.test.ts'];
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('points to missing evidence');
	});

	it('rejects a same-count export identity mutation', async () => {
		const result = await runMutation((manifest) => {
			manifest.exports[0].name = `${manifest.exports[0].name}Renamed`;
			manifest.exports[0].id = `export:${manifest.exports[0].name}`;
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('export inventory differs from pinned upstream');
	});

	it('rejects an inventory digest mismatch', async () => {
		const result = await runMutation((manifest) => {
			manifest.inventorySha256 = '0'.repeat(64);
		});

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('inventorySha256 does not match');
	});

	it('rejects readiness while any public export remains a gap', async () => {
		const result = await runMutation(
			(manifest) => {
				const entry = manifest.exports.find((candidate) => candidate.status !== 'gap');
				entry.status = 'gap';
				manifest.expectedTotals.gaps += 1;
			},
			['--ready'],
		);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('exports remain unported');
	});
});
