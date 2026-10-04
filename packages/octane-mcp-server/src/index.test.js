import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	areaForPath,
	BENCHMARK_SUITES,
	BUNDLED_SKILLS,
	REPO_SKILLS,
	createServer,
	engineeringPlanFor,
	isOctaneRepo,
	runCommand,
	scaffoldReactPort,
	validationFor,
} from './index.js';
import { KNOWN_BINDING_PACKAGE_DIRS } from './bridge.js';
import { explainStrong, STRONG_CATALOG, STRONG_EXPLAIN_TOOL } from './strong.js';
import {
	STRONG_DIAGNOSTICS,
	STRONG_RECIPES,
} from '../../octane/src/compiler/strong-diagnostics.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');

/** Connect a client to a server outside any octane checkout: the user-facing tools only. */
async function connectUserServer() {
	const server = createServer({ repoRoot: await mkdtemp(join(tmpdir(), 'octane-mcp-test-')) });
	const client = new Client({ name: 'octane-mcp-test', version: '1.0.0' });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return {
		client,
		close: async () => {
			await client.close();
			await server.close();
		},
	};
}

/** Every file under a directory, recursively. */
function filesUnder(directory, pattern) {
	return readdirSync(directory, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && pattern.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));
}

// `OCTANE_STRONG_*` prose has no code after the prefix, so a match must end
// on a letter or digit.
const DIAGNOSTIC_CODE = /\bOCTANE_[A-Z0-9]+(?:_[A-Z0-9]+)*\b/g;

describe('@octanejs/mcp-server helpers', () => {
	it('classifies Octane repository paths', () => {
		expect(areaForPath('packages/octane/src/compiler/compile.js')).toBe('compiler');
		expect(areaForPath('packages/octane/src/runtime.ts')).toBe('core-runtime');
		expect(areaForPath('packages/octane/src/runtime.server.ts')).toBe('ssr');
		expect(areaForPath('packages/zustand/src/index.ts')).toBe('ecosystem-binding');
		expect(areaForPath('packages/alien-signals/src/index.ts')).toBe('ecosystem-binding');
		expect(areaForPath('packages/radix/src/index.ts')).toBe('ecosystem-binding');
		expect(areaForPath('packages/octane-mcp-server/src/index.js')).toBe('mcp-server');
		expect(areaForPath('packages/adapter-vercel/src/index.ts')).toBe('deploy-adapter');
		expect(areaForPath('packages/adapter-cloudflare/src/index.js')).toBe('deploy-adapter');
		expect(areaForPath('packages/octane-evals/tools/run.mjs')).toBe('evals');
		expect(areaForPath('website/src/pages/index.tsrx')).toBe('website');
		expect(areaForPath('benchmarks/news/run.mjs')).toBe('benchmark');
		expect(areaForPath('.rulesync/rules/project.md')).toBe('rulesync-source');
	});

	it('recommends the adapter, evals, and website test projects', () => {
		const commands = validationFor(
			[
				'packages/adapter-vercel/src/index.ts',
				'packages/adapter-cloudflare/src/index.js',
				'packages/octane-evals/tools/run.mjs',
				'website/src/pages/index.tsrx',
			],
			'feature',
		);

		expect(commands).toContain(
			'./node_modules/.bin/vitest run packages/adapter-vercel/tests --project adapter-vercel',
		);
		expect(commands).toContain(
			'./node_modules/.bin/vitest run packages/adapter-cloudflare/tests --project adapter-cloudflare',
		);
		expect(commands).toContain(
			'./node_modules/.bin/vitest run packages/octane-evals/tests --project octane-evals',
		);
		expect(commands).toContain('./node_modules/.bin/vitest run website/tests --project website');
		expect(commands).toContain('pnpm typecheck');
	});

	it('keeps the benchmark suite list in sync with the unified runner manifest', async () => {
		// BENCHMARK_SUITES is hand-maintained in index.js; the runner manifest in
		// benchmarks/bench.mjs is the source of truth. --list prints one suite
		// name per line, in manifest order.
		const repoRoot = resolve(PACKAGE_ROOT, '../..');
		const result = await runCommand(process.execPath, ['benchmarks/bench.mjs', '--list'], {
			cwd: repoRoot,
		});
		expect(result.code).toBe(0);
		const suites = result.stdout
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && line !== 'Available suites:');
		expect(suites).toContain('tsrx-hydrate-module-slicing');
		expect(suites).toContain('tsrx-stable-hookful-propagation');
		expect(suites).toContain('tsrx-renderer-validation-ranges');
		expect(suites).toContain('tsrx-local-component-name-catalog');
		expect(suites).toEqual(BENCHMARK_SUITES);

		// The public MCP schema must accept every runner suite, not just keep
		// an exported helper list in sync.
		const server = createServer({ repoRoot });
		const client = new Client({ name: 'octane-mcp-test', version: '1.0.0' });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		try {
			await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
			const tools = await client.listTools();
			const benchmark = tools.tools.find((tool) => tool.name === 'octane_benchmark');
			expect(benchmark?.inputSchema.properties?.benchmark?.enum).toEqual(['all', ...suites]);
		} finally {
			await client.close();
			await server.close();
		}
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
		expect(commands).toContain('node benchmarks/bench.mjs --quick --ratios');
		expect(commands).toContain('pnpm format:check');
	});

	it('requires performance evidence and adversarial review for framework fundamentals', () => {
		const plan = engineeringPlanFor(
			{
				scope: 'framework-core',
				changeKind: 'refactor',
				paths: ['packages/octane/src/runtime.ts'],
			},
			true,
		);

		expect(plan.performanceSensitive).toBe(true);
		expect(plan.requiredSkills).toEqual([
			'build-octane-software',
			'octane-core-extend',
			'performance-audit',
		]);
		expect(plan.gates.performance).toContain(
			'Identify hot paths and record a relevant baseline before editing.',
		);
		expect(plan.gates.selfReview).toContain(
			'Resolve findings, rerun affected checks, and repeat the review on the final diff.',
		);
		expect(plan.validationCommands).toContain('node benchmarks/bench.mjs --quick --ratios');
	});

	it('routes binding work by ownership before choosing evidence', () => {
		const plan = engineeringPlanFor(
			{ scope: 'library', changeKind: 'feature', paths: ['packages/zustand/src/index.ts'] },
			true,
		);

		expect(plan.requiredSkills).toContain('react-library-port');
		expect(plan.requiredSkills).not.toContain('octane-react-library-port');
		expect(plan.gates.parity.join('\n')).toContain('update-bindings');
		expect(plan.gates.parity.join('\n')).toContain('direct upstream imports');
		expect(plan.gates.parity.join('\n')).toContain('For copied or rewritten code');
		expect(plan.gates.parity.join('\n')).toContain('Preserve strict legacy evidence');
		expect(plan.gates.parity.join('\n')).toContain('packages/<name>/UPSTREAM.md');
		expect(plan.gates.parity.join('\n')).toContain('divergence');
		expect(plan.gates.parity.join('\n')).toContain("pinned release's own suite");

		const applicationPlan = engineeringPlanFor(
			{ scope: 'application', changeKind: 'feature', paths: ['src/App.tsrx'] },
			true,
		);
		expect(applicationPlan.gates.parity).toBeUndefined();
		expect(applicationPlan.requiredSkills).not.toContain('react-library-port');
	});

	it('blocks framework-core plans when maintainer tools are unavailable', () => {
		const plan = engineeringPlanFor({ scope: 'framework-core', changeKind: 'bug' });

		expect(plan.requiredSkills).toEqual(['build-octane-software']);
		expect(plan.blockingConditions).toContain(
			'Framework-core work requires the MCP server to run against an Octane monorepo checkout. Set OCTANE_REPO_ROOT, reconnect, and request this plan again so maintainer skills and repository validation are available.',
		);
		expect(plan.gates.correctness).toContain(
			'Reproduce the bug through a realistic public boundary and verify that the test has a credible pre-fix failure.',
		);
	});

	it('keeps performance gates and validation commands aligned', () => {
		const performancePlan = engineeringPlanFor(
			{ scope: 'application', changeKind: 'performance' },
			true,
		);
		const flaggedPlan = engineeringPlanFor(
			{ scope: 'library', changeKind: 'feature', performanceSensitive: true },
			true,
		);

		for (const plan of [performancePlan, flaggedPlan]) {
			expect(plan.performanceSensitive).toBe(true);
			expect(plan.gates.performance).toContain(
				'Identify hot paths and record a relevant baseline before editing.',
			);
			expect(plan.validationCommands).toContain('node benchmarks/bench.mjs --quick --ratios');
		}
	});

	it('routes to the engineering gates without restating them at initialization', async () => {
		// Initialization instructions are injected into every session, so they stay
		// short and point at the tool. The gates themselves must still be reachable
		//: that is the contract, not any particular wording.
		const server = createServer({ repoRoot: resolve(PACKAGE_ROOT, '../..') });
		const client = new Client({ name: 'octane-mcp-test', version: '1.0.0' });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

		try {
			await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
			const instructions = client.getInstructions();
			expect(instructions).toContain('octane_engineering_plan');
			expect(instructions.length).toBeLessThan(600);

			const tools = await client.listTools();
			expect(tools.tools.map((tool) => tool.name)).toContain('octane_engineering_plan');

			const plan = await client.callTool({
				name: 'octane_engineering_plan',
				arguments: { scope: 'framework-core', changeKind: 'performance' },
			});
			const body = plan.content[0].text;
			expect(body).toContain('Identify hot paths and record a relevant baseline before editing.');
			expect(body).toContain('build-octane-software');
		} finally {
			await client.close();
			await server.close();
		}
	});

	it('serves the project map from both generated, CI-gated sources', async () => {
		// A hand-written map is the copy free to drift, which is why the old one
		// did. Both halves here are regenerated and checked by CI.
		const server = createServer({ repoRoot: resolve(PACKAGE_ROOT, '../..') });
		const client = new Client({ name: 'octane-mcp-test', version: '1.0.0' });
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

		try {
			await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
			const map = (await client.callTool({ name: 'octane_project_map', arguments: {} })).content[0]
				.text;
			expect(map).toContain('Your React instincts are the main failure mode here');
			expect(map).toContain('Package inventory (generated)');
			expect(map).toContain('framework binding');
		} finally {
			await client.close();
			await server.close();
		}
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

	it('serves every bundled skill on disk, and only skills that exist', () => {
		// The one-directional check above catches a dangling entry; this one
		// catches a skill file added without registering it.
		const onDisk = readdirSync(resolve(PACKAGE_ROOT, 'skills'))
			.filter((file) => file.endsWith('.md'))
			.map((file) => file.replace(/\.md$/, ''))
			.sort();
		expect(Object.keys(BUNDLED_SKILLS).sort()).toEqual(onDisk);
		for (const [name, file] of Object.entries(BUNDLED_SKILLS)) {
			expect(file).toBe(`skills/${name}.md`);
		}
	});

	it('serves the Strong migration skill to projects outside the monorepo', async () => {
		const { client, close } = await connectUserServer();
		try {
			const { tools } = await client.listTools();
			const skill = tools.find((tool) => tool.name === 'octane_skill');
			expect(skill?.inputSchema.properties?.name?.enum).toContain('migrate-to-strong');
			expect(skill?.description).toContain('migrate-to-strong');
			const result = await client.callTool({
				name: 'octane_skill',
				arguments: { name: 'migrate-to-strong' },
			});
			const body = result.content[0].text;
			expect(body).toMatch(/^# Skill:/);
			for (const step of [
				'octane analyze --strong-preview',
				'octane analyze --strong-preview --fix',
				'"use strong"',
				'octane_strong_explain',
				'--strong-baseline init',
				'compiler: { strong: true }',
			]) {
				expect(body).toContain(step);
			}
		} finally {
			await close();
		}
	});

	it('keeps the Strong migration table in step with the recipe catalog', async () => {
		// The skill's React-idiom table names each recipe by id so an agent can
		// fetch it with octane_strong_explain. Every id it names must exist, and
		// every recipe must have a row.
		const body = await readFile(resolve(PACKAGE_ROOT, 'skills/migrate-to-strong.md'), 'utf8');
		const recipeIds = new Set(STRONG_RECIPES.map((recipe) => recipe.id));
		const named = new Set(
			[...body.matchAll(/^\|.*\(`([a-z][a-z-]*)`\) \|/gm)].map((match) => match[1]),
		);
		expect(named).toEqual(recipeIds);
		for (const recipe of STRONG_RECIPES) {
			const row = body.split('\n').find((line) => line.includes(`(\`${recipe.id}\`)`));
			for (const code of recipe.codes) expect(row).toContain(code);
		}
	});

	it('names only diagnostic codes the compiler or the Strong catalog defines', async () => {
		// A skill that names a renamed or invented code sends an agent hunting
		// for a diagnostic that never fires. Strong codes must be catalogued;
		// any other code must still be raised by the compiler or CLI.
		const catalogued = new Set(STRONG_DIAGNOSTICS.map((entry) => entry.code));
		const emitterSource = [
			...filesUnder(resolve(REPO_ROOT, 'packages/octane/src'), /\.(?:js|ts)$/),
			...filesUnder(resolve(REPO_ROOT, 'packages/cli/src'), /\.js$/),
		]
			.filter((file) => !file.endsWith('strong-diagnostics.js'))
			.map((file) => readFileSync(file, 'utf8'))
			.join('\n');
		const unknown = [];
		for (const file of Object.values(BUNDLED_SKILLS)) {
			const body = await readFile(resolve(PACKAGE_ROOT, file), 'utf8');
			for (const [code] of body.matchAll(DIAGNOSTIC_CODE)) {
				const known = code.startsWith('OCTANE_STRONG_')
					? catalogued.has(code)
					: catalogued.has(code) || emitterSource.includes(`'${code}'`);
				if (!known) unknown.push(`${file}: ${code}`);
			}
		}
		expect(unknown).toEqual([]);
	});

	it('serves every RuleSync skill, and only skills that exist', async () => {
		// Checking that each mapped path resolves catches a dangling entry but not
		// a missing one, which is how authoring-tsrx was added to .rulesync and
		// stayed unreachable through octane_skill. Compare both directions.
		const repoRoot = resolve(PACKAGE_ROOT, '../..');
		const onDisk = readdirSync(resolve(repoRoot, '.rulesync/skills'), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();

		expect(REPO_SKILLS['react-library-port']).toBe('.rulesync/skills/react-library-port/SKILL.md');
		expect(Object.keys(REPO_SKILLS).sort()).toEqual(onDisk);

		for (const file of Object.values(REPO_SKILLS)) {
			expect(file.startsWith('.rulesync/skills/')).toBe(true);
			expect(existsSync(resolve(repoRoot, file))).toBe(true);
			const body = await readFile(resolve(repoRoot, file), 'utf8');
			expect(body).toMatch(/^---\n[\s\S]*?\ndescription: /);
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

describe('octane_strong_explain', () => {
	it('is registered outside the monorepo with a trigger description', async () => {
		const { client, close } = await connectUserServer();
		try {
			const { tools } = await client.listTools();
			const tool = tools.find((entry) => entry.name === 'octane_strong_explain');
			expect(tool).toBeDefined();
			expect(tool.description).toContain('OCTANE_STRONG_');
			expect(tool.description).toContain('octane analyze');
			expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(['code', 'recipe']);
			expect(tool.inputSchema.required ?? []).toEqual([]);
			expect(tool.description).toBe(STRONG_EXPLAIN_TOOL.description);
		} finally {
			await close();
		}
	});

	it('explains every code the compiler catalog defines', async () => {
		// The catalog source, not the generated JSON, is the list a stale copy
		// would miss.
		expect(STRONG_CATALOG.diagnostics.map((entry) => entry.code)).toEqual(
			STRONG_DIAGNOSTICS.map((entry) => entry.code),
		);
		const { client, close } = await connectUserServer();
		try {
			for (const entry of STRONG_DIAGNOSTICS) {
				const result = await client.callTool({
					name: 'octane_strong_explain',
					arguments: { code: entry.code },
				});
				expect(result.isError).toBeFalsy();
				const body = result.content[0].text;
				expect(body.startsWith(`# ${entry.code}\n`)).toBe(true);
				expect(body).toContain(`Severity: ${entry.severity}`);
				expect(body).toContain(entry.detects);
				expect(body).toContain(entry.replacement);
				expect(body).toContain(
					`https://octanejs.dev/docs/strong-mode#${entry.code.toLowerCase().replaceAll('_', '-')}`,
				);
				for (const primitive of entry.primitives ?? []) expect(body).toContain(`\`${primitive}\``);
				for (const recipe of STRONG_RECIPES) {
					const listed = body.includes(`(\`${recipe.id}\`)`);
					expect(listed).toBe(recipe.codes.includes(entry.code));
				}
			}
		} finally {
			await close();
		}
	});

	it('shows each recipe as React idiom, Strong replacement, and both sources', () => {
		const { ok, text: body } = explainStrong({ code: 'OCTANE_STRONG_RENDER_REF_WRITE' });
		expect(ok).toBe(true);
		for (const id of ['lazy-ref', 'latest-ref']) {
			const recipe = STRONG_RECIPES.find((entry) => entry.id === id);
			expect(body).toContain(recipe.react);
			expect(body).toContain(recipe.strong);
			expect(body).toContain(recipe.note);
			expect(body).toContain(`https://octanejs.dev/docs/strong-mode#recipe-${id}`);
			// The served sources carry the directive that makes the example Strong.
			expect(body).toContain(`\`\`\`tsx\n"use strong";\n${recipe.before.trimEnd()}\n\`\`\``);
			expect(body).toContain(`\`\`\`tsx\n"use strong";\n${recipe.after.trimEnd()}\n\`\`\``);
		}
	});

	it('accepts the short, lowercase, bracketed, and linked forms of a code', () => {
		const expected = explainStrong({ code: 'OCTANE_STRONG_RENDER_REF_READ' }).text;
		for (const code of [
			'RENDER_REF_READ',
			'render_ref_read',
			'  octane_strong_render_ref_read ',
			'[OCTANE_STRONG_RENDER_REF_READ]',
			'https://octanejs.dev/docs/strong-mode#octane-strong-render-ref-read',
		]) {
			expect(explainStrong({ code })).toEqual({ ok: true, text: expected });
		}
		// The one catalogued code without the Strong prefix.
		expect(explainStrong({ code: 'native_text_onchange' }).text).toMatch(
			/^# OCTANE_NATIVE_TEXT_ONCHANGE\n/,
		);
	});

	it('returns one recipe by id', async () => {
		const { client, close } = await connectUserServer();
		try {
			const result = await client.callTool({
				name: 'octane_strong_explain',
				arguments: { recipe: 'Layout-Measurement' },
			});
			expect(result.isError).toBeFalsy();
			const body = result.content[0].text;
			expect(body).toMatch(/^# Render from a DOM measurement \(`layout-measurement`\)/);
			expect(body).toContain('useLayoutSnapshot');
			expect(body).toContain('OCTANE_STRONG_EFFECT_STATE_UPDATE');
		} finally {
			await close();
		}
	});

	it('returns the index of codes by section and the recipes with no arguments', async () => {
		const { client, close } = await connectUserServer();
		try {
			const result = await client.callTool({ name: 'octane_strong_explain', arguments: {} });
			const body = result.content[0].text;
			for (const section of STRONG_CATALOG.sections) expect(body).toContain(`## ${section.title}`);
			for (const entry of STRONG_DIAGNOSTICS) expect(body).toContain(`\`${entry.code}\``);
			for (const recipe of STRONG_RECIPES) expect(body).toContain(`\`${recipe.id}\``);
			expect(body).toContain('migrate-to-strong');
		} finally {
			await close();
		}
	});

	it('reports an unknown code as an error that lists the closest codes', async () => {
		const { client, close } = await connectUserServer();
		try {
			const typo = await client.callTool({
				name: 'octane_strong_explain',
				arguments: { code: 'RENDER_REF_RAED' },
			});
			expect(typo.isError).toBe(true);
			const body = typo.content[0].text;
			expect(body).toContain('Unknown Strong diagnostic code `RENDER_REF_RAED`');
			const suggested = [...body.matchAll(/^- `(OCTANE_[A-Z_]+)`$/gm)].map((match) => match[1]);
			expect(suggested[0]).toBe('OCTANE_STRONG_RENDER_REF_READ');
			expect(suggested.length).toBeLessThanOrEqual(5);

			const recipe = await client.callTool({
				name: 'octane_strong_explain',
				arguments: { recipe: 'lazy-init' },
			});
			expect(recipe.isError).toBe(true);
			expect(recipe.content[0].text).toContain('`lazy-ref`');
		} finally {
			await close();
		}
	});
});
