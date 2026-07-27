import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, installed, runCli } from './helpers/fixture.js';

/** @type {{ cleanup: () => void }[]} */
const fixtures = [];

/**
 * @param {Record<string, string | object>} files
 */
function fixture(files) {
	const created = createFixture(files);
	fixtures.push(created);
	return created;
}

afterEach(() => {
	while (fixtures.length > 0) fixtures.pop()?.cleanup();
});

const HEALTHY = {
	'package.json': {
		name: 'healthy-app',
		type: 'module',
		scripts: { typecheck: 'tsrx-tsc --noEmit -p tsconfig.json' },
		dependencies: { octane: '^0.1.17' },
	},
	'tsconfig.json': {
		compilerOptions: {
			jsxImportSource: 'octane',
			moduleResolution: 'bundler',
			plugins: [{ name: '@tsrx/typescript-plugin' }],
		},
	},
	'vite.config.ts':
		"import { octane } from 'octane/compiler/vite';\n" +
		"export default { plugins: [octane()], build: { target: 'esnext' } };\n",
	'pnpm-lock.yaml': 'lockfileVersion: 9\n',
	'src/App.tsrx': "export function App() @{ <div>{'hi' as string}</div> }\n",
	...installed('octane', '0.1.17', { peerDependencies: { vite: '^8.0.16' } }),
	...installed('vite', '8.1.5'),
	...installed('@tsrx/typescript-plugin', '0.3.112'),
};

/**
 * @param {any} report
 * @returns {string[]}
 */
const failing = (report) =>
	report.checks
		.filter((/** @type {any} */ c) => c.status === 'fail')
		.map((/** @type {any} */ c) => c.id);

/**
 * @param {any} report
 * @param {string} id
 */
const check = (report, id) => report.checks.find((/** @type {any} */ c) => c.id === id);

describe('octane doctor', () => {
	it('passes a correctly configured project and exits 0', async () => {
		const { root } = fixture(HEALTHY);
		const result = await runCli(['doctor', '--cwd', root, '--json']);

		expect(failing(result.json())).toEqual([]);
		expect(result.json().ok).toBe(true);
		expect(result.exitCode).toBe(0);
	});

	it('reports each misconfiguration and exits 3', async () => {
		const { root } = fixture({
			...HEALTHY,
			'package.json': {
				name: 'broken-app',
				scripts: { typecheck: 'tsc --noEmit' },
				dependencies: { octane: '^0.1.17' },
			},
			'tsconfig.json': { compilerOptions: { strict: true } },
			'vite.config.ts': 'export default { plugins: [] };\n',
			'src/shims.d.ts': "declare module '*.tsrx' {\n\tconst c: unknown;\n\texport default c;\n}\n",
			'src/Bad.tsrx': "import { forwardRef } from 'octane';\nexport const Bad = forwardRef;\n",
		});

		const report = (await runCli(['doctor', '--cwd', root, '--json'])).json();

		expect(failing(report)).toEqual(
			expect.arrayContaining([
				'bundler.plugin-present',
				'ts.jsx-import-source',
				'ts.tsrx-plugin',
				'ts.wildcard-tsrx-decl',
				'source.forward-ref',
			]),
		);
		expect(report.ok).toBe(false);
		expect((await runCli(['doctor', '--cwd', root])).exitCode).toBe(3);
	});

	it('detects a second copy of the runtime', async () => {
		const { root } = fixture({
			...HEALTHY,
			...installed('some-lib', '1.0.0'),
			...installed('octane', '0.1.10', {}, 'some-lib'),
		});

		const duplicate = check(
			(await runCli(['doctor', '--cwd', root, '--json'])).json(),
			'deps.octane-duplicates',
		);
		expect(duplicate.status).toBe('fail');
		expect(duplicate.message).toMatch(/2 copies/);
		expect(duplicate.detail.join('\n')).toMatch(/some-lib/);
	});

	it('does not fail the run on warning-severity findings alone', async () => {
		const { root } = fixture({
			...HEALTHY,
			'vite.config.ts':
				"import { octane } from 'octane/compiler/vite';\n" +
				"export default { plugins: [octane()], build: { target: 'es2020' } };\n",
		});

		const result = await runCli(['doctor', '--cwd', root, '--json']);
		expect(check(result.json(), 'bundler.build-target').status).toBe('warn');
		expect(result.exitCode).toBe(0);
	});

	it('does not mistake a *-tsc tool for plain tsc', async () => {
		// `\btsc\b` also matches the tail of `vue-tsc`, which would fail a healthy
		// script and, under --fix, rewrite it to `vue-tsrx-tsc`.
		const { root } = fixture({
			...HEALTHY,
			'package.json': {
				name: 'vue-ish',
				scripts: { typecheck: 'vue-tsc --noEmit' },
				dependencies: { octane: '^0.1.17' },
			},
		});

		const report = (await runCli(['doctor', '--cwd', root, '--json'])).json();
		expect(check(report, 'ts.typecheck-script').status).not.toBe('fail');

		await runCli(['doctor', '--cwd', root, '--fix', '--yes', '--category', 'typescript']);
		expect(
			JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.typecheck,
		).toBe('vue-tsc --noEmit');
	});

	it('rewrites every bare tsc in a compound script', async () => {
		const { root } = fixture({
			...HEALTHY,
			'package.json': {
				name: 'compound',
				scripts: { typecheck: 'tsc -p a && tsc -p b' },
				dependencies: { octane: '^0.1.17' },
			},
		});

		await runCli(['doctor', '--cwd', root, '--fix', '--yes', '--category', 'typescript']);
		expect(
			JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.typecheck,
		).toBe('tsrx-tsc -p a && tsrx-tsc -p b');
	});

	it('filters with --only', async () => {
		const { root } = fixture(HEALTHY);
		const report = (
			await runCli(['doctor', '--cwd', root, '--json', '--only', 'env.node-version'])
		).json();
		expect(report.checks).toHaveLength(1);
		expect(report.checks[0].id).toBe('env.node-version');
	});
});

describe('octane doctor --fix', () => {
	const BROKEN_TS = {
		...HEALTHY,
		'package.json': {
			name: 'fixable-app',
			scripts: { typecheck: 'tsc --noEmit -p tsconfig.json' },
			dependencies: { octane: '^0.1.17' },
		},
		'tsconfig.json':
			'{\n\t// a real tsconfig has comments\n\t"compilerOptions": {\n\t\t"strict": true,\n\t}\n}\n',
	};

	it('repairs what it can and leaves the file otherwise intact', async () => {
		const { root } = fixture(BROKEN_TS);

		await runCli(['doctor', '--cwd', root, '--fix', '--yes', '--category', 'typescript']);

		const tsconfig = readFileSync(path.join(root, 'tsconfig.json'), 'utf8');
		expect(tsconfig).toContain('// a real tsconfig has comments');
		expect(tsconfig).toContain('"jsxImportSource": "octane"');
		expect(tsconfig).toContain('@tsrx/typescript-plugin');
		expect(
			JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.typecheck,
		).toBe('tsrx-tsc --noEmit -p tsconfig.json');
	});

	it('is idempotent', async () => {
		const { root } = fixture(BROKEN_TS);
		const args = ['doctor', '--cwd', root, '--fix', '--yes', '--category', 'typescript'];

		await runCli(args);
		const after = readFileSync(path.join(root, 'tsconfig.json'), 'utf8');
		await runCli(args);

		expect(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')).toBe(after);
	});

	it('writes nothing under --dry-run', async () => {
		const { root } = fixture(BROKEN_TS);
		const before = readFileSync(path.join(root, 'tsconfig.json'), 'utf8');

		await runCli([
			'doctor',
			'--cwd',
			root,
			'--fix',
			'--dry-run',
			'--yes',
			'--category',
			'typescript',
		]);

		expect(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')).toBe(before);
	});

	it('refuses to edit unattended without --yes, naming the flag', async () => {
		const { root } = fixture(BROKEN_TS);
		const before = readFileSync(path.join(root, 'tsconfig.json'), 'utf8');

		const result = await runCli(['doctor', '--cwd', root, '--fix', '--category', 'typescript']);

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/--yes is required/);
		expect(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')).toBe(before);
	});
});
