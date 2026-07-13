import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	areaForPath,
	BUNDLED_SKILLS,
	isOctaneRepo,
	scaffoldReactPort,
	validationFor,
} from './index.js';
import { KNOWN_BINDING_PACKAGE_DIRS } from './bridge.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('@octanejs/mcp-server helpers', () => {
	it('classifies Octane repository paths', () => {
		expect(areaForPath('packages/octane/src/compiler/compile.js')).toBe('compiler');
		expect(areaForPath('packages/octane/src/runtime.ts')).toBe('core-runtime');
		expect(areaForPath('packages/octane/src/runtime.server.ts')).toBe('ssr');
		expect(areaForPath('packages/zustand/src/index.ts')).toBe('ecosystem-binding');
		expect(areaForPath('packages/radix/src/index.ts')).toBe('ecosystem-binding');
		expect(areaForPath('packages/octane-mcp-server/src/index.js')).toBe('mcp-server');
		expect(areaForPath('benchmarks/news/run.mjs')).toBe('benchmark');
		expect(areaForPath('.rulesync/rules/project.md')).toBe('rulesync-source');
	});

	it('classifies every maintained binding and recommends its test project', () => {
		const paths = [...KNOWN_BINDING_PACKAGE_DIRS].map(
			(directory) => `packages/${directory}/src/index.ts`,
		);
		const commands = validationFor(paths, 'binding');

		for (const directory of KNOWN_BINDING_PACKAGE_DIRS) {
			expect(areaForPath(`packages/${directory}/src/index.ts`)).toBe('ecosystem-binding');
			expect(commands).toContain(
				`./node_modules/.bin/vitest run packages/${directory}/tests --project ${directory}`,
			);
		}
	});

	it('recommends validation commands from changed paths', () => {
		const commands = validationFor(
			[
				'packages/octane/src/runtime.ts',
				'packages/zustand/src/index.ts',
				'packages/radix/src/index.ts',
				'.rulesync/rules/project.md',
			],
			'core',
		);

		expect(commands).toContain('pnpm rules:generate');
		expect(commands).toContain(
			'./node_modules/.bin/vitest run packages/octane/tests --project octane',
		);
		expect(commands).toContain(
			'./node_modules/.bin/vitest run packages/zustand/tests --project zustand',
		);
		expect(commands).toContain(
			'./node_modules/.bin/vitest run packages/radix/tests --project radix',
		);
		expect(commands).toContain('pnpm typecheck');
		expect(commands).toContain('pnpm format:check');
	});

	it('detects the octane monorepo for repo-mode tools', async () => {
		expect(isOctaneRepo(resolve(PACKAGE_ROOT, '../..'))).toBe(true);
		const elsewhere = await mkdtemp(join(tmpdir(), 'octane-mcp-test-'));
		expect(isOctaneRepo(elsewhere)).toBe(false);
	});

	it('ships every bundled skill inside the package', async () => {
		for (const file of Object.values(BUNDLED_SKILLS)) {
			expect(existsSync(resolve(PACKAGE_ROOT, file))).toBe(true);
			const body = await readFile(resolve(PACKAGE_ROOT, file), 'utf8');
			expect(body).toMatch(/^# Skill:/);
		}
	});

	it('runs the React port scaffolder wrapper', async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), 'octane-mcp-test-'));
		await mkdir(join(repoRoot, 'scripts'), { recursive: true });
		await mkdir(join(repoRoot, 'react'), { recursive: true });
		await writeFile(
			join(repoRoot, 'scripts/scaffold-react-port.mjs'),
			"import { writeFileSync } from 'node:fs';\nconst out = process.argv[process.argv.indexOf('--out') + 1];\nwriteFileSync(out, 'generated');\nconsole.log('ok');\n",
		);
		await writeFile(join(repoRoot, 'react/source-test.js'), "it('works', () => {});\n");

		const result = await scaffoldReactPort(repoRoot, {
			reactTestFile: 'react/source-test.js',
			outFile: 'ported.test.ts',
		});

		expect(result.code).toBe(0);
		expect(result.stdout).toContain('ok');
		await expect(readFile(join(repoRoot, 'ported.test.ts'), 'utf8')).resolves.toBe('generated');
	});
});
