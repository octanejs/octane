import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('rejects altered upstream bytes even when their checksum row is regenerated', () => {
	const root = mkdtempSync(join(tmpdir(), 'react-select-upstream-'));
	cpSync(join(packageRoot, 'upstream'), root, { recursive: true });
	const target = join(root, 'src/filters.ts');
	writeFileSync(target, `${readFileSync(target, 'utf8')}\n// altered\n`);
	const digest = createHash('sha256').update(readFileSync(target)).digest('hex');
	const sums = join(root, 'SHA256SUMS');
	writeFileSync(
		sums,
		readFileSync(sums, 'utf8').replace(
			/^[a-f0-9]{64}  \.\/src\/filters\.ts$/m,
			`${digest}  ./src/filters.ts`,
		),
	);
	assert.throws(
		() =>
			execFileSync(process.execPath, [join(packageRoot, 'scripts/verify-upstream.mjs')], {
				env: { ...process.env, REACT_SELECT_UPSTREAM_ROOT: root },
				stdio: 'pipe',
			}),
		/SHA256SUMS differs from the independently pinned canonical manifest/,
	);
});

test('rejects an unknown crosswalk type status', () => {
	const root = mkdtempSync(join(tmpdir(), 'react-select-crosswalk-'));
	const source = join(packageRoot, 'audit/export-crosswalk.json');
	const crosswalk = JSON.parse(readFileSync(source, 'utf8'));
	crosswalk.entryPoints[0].types = 'complete-ish';
	const target = join(root, 'export-crosswalk.json');
	writeFileSync(target, JSON.stringify(crosswalk));
	assert.throws(
		() =>
			execFileSync(process.execPath, [join(packageRoot, 'scripts/verify-crosswalk.mjs')], {
				env: { ...process.env, REACT_SELECT_CROSSWALK_PATH: target },
				stdio: 'pipe',
			}),
		/has unknown type status complete-ish/,
	);
});
