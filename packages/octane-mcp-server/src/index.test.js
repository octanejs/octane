import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { areaForPath, scaffoldReactPort, validationFor } from './index.js';

describe('@octanejs/mcp-server helpers', () => {
	it('classifies Octane repository paths', () => {
		expect(areaForPath('packages/octane/src/compiler/compile.js')).toBe('compiler');
		expect(areaForPath('packages/octane/src/runtime.ts')).toBe('core-runtime');
		expect(areaForPath('packages/octane/src/runtime.server.ts')).toBe('ssr');
		expect(areaForPath('packages/zustand/src/index.ts')).toBe('ecosystem-binding');
		expect(areaForPath('benchmarks/news/run.mjs')).toBe('benchmark');
		expect(areaForPath('.rulesync/rules/project.md')).toBe('rulesync-source');
	});

	it('recommends validation commands from changed paths', () => {
		const commands = validationFor(
			[
				'packages/octane/src/runtime.ts',
				'packages/zustand/src/index.ts',
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
		expect(commands).toContain('pnpm typecheck');
		expect(commands).toContain('pnpm format:check');
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
