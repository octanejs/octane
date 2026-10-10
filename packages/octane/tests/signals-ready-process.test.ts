// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';

const scratch = mkdtempSync(join(tmpdir(), 'octane-ready-producer-'));
const outfile = join(scratch, 'producer.mjs');
beforeAll(async () => {
	await build({
		entryPoints: [resolve(import.meta.dirname, '_fixtures/signals-ready-process.ts')],
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		minify: true,
		define: {
			'process.env.NODE_ENV': JSON.stringify(
				process.env.OCTANE_TEST_COMPILE_MODE === 'prod' ? 'production' : 'development',
			),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
	});
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

it.each([1, 12])(
	'lets host tasks cancel %s indefinitely ready producers without starving siblings',
	(producers) => {
		const result = spawnSync(process.execPath, [outfile, String(producers)], {
			encoding: 'utf8',
			timeout: 10_000,
			killSignal: 'SIGKILL',
		});
		expect(result.error, result.stderr).toBeUndefined();
		expect(result.status, result.stderr).toBe(0);
		const report = JSON.parse(result.stdout);
		expect(report.closed).toEqual(Array.from({ length: producers }, () => 1));
		expect(report.samples).toHaveLength(3);
	},
);
