#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { bridgeReport, KNOWN_BINDINGS, KNOWN_BINDING_PACKAGE_DIRS } from './bridge.js';

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(__filename), '..');

// Bundled skills ship with the npm package and work in ANY project using
// octane. Repo skills live in the octane monorepo's .ai/skills and are only
// available when the server runs against a checkout (they cover maintainer
// workflows: triage, PRs, core changes).
export const BUNDLED_SKILLS = {
	'bridge-react-package': 'skills/bridge-react-package.md',
	'build-octane-software': 'skills/build-octane-software.md',
	'migrate-react-component': 'skills/migrate-react-component.md',
	'react-divergences': 'skills/react-divergences.md',
	'setup-ssr': 'skills/setup-ssr.md',
};

export const REPO_SKILLS = {
	'bug-hunter': '.ai/skills/bug-hunter.md',
	'create-a-pr': '.ai/skills/create-a-pr.md',
	'handle-issue': '.ai/skills/handle-issue.md',
	'octane-core-extend': '.ai/skills/octane-core-extend.md',
	'performance-audit': '.ai/skills/performance-audit.md',
	'react-library-port': '.ai/skills/react-library-port.md',
	triage: '.ai/skills/triage.md',
};

// Suite names from the unified runner manifest (`SUITES` in
// benchmarks/bench.mjs; `node benchmarks/bench.mjs --list` prints the same
// set). index.test.js keeps this list in sync with the runner.
export const BENCHMARK_SUITES = [
	'js-framework',
	'js-framework-reorder',
	'todomvc',
	'weather-app',
	'weather-app-lighthouse',
	'chat-stream',
	'dbmon',
	'recursive-context',
	'signal-favoring',
	'news',
	'effectful-list',
	'memo-wall',
	'portal-swarm',
	'react-hosted-islands',
	'ssr-throughput',
	'streaming-ssr',
	'ssr-http',
	'ssr-workerd',
	'tanstack-start',
	'dbmon-deopt',
	'js-framework-deopt',
	'async-waterfall',
	'async-composition',
	'lynx-list',
	'lynx-bundle-size',
	'codegen-size',
	'bundle-size',
	'three-renderer',
	'three-bundle-size',
];

const DEFAULT_TIMEOUT_MS = 120_000;

export function instructionsFor(repoMode) {
	const common =
		'Before creating or materially changing Octane software, call octane_engineering_plan and load the build-octane-software skill. Treat its correctness, performance evidence, and adversarial self-review gates as required. Load the task-specific migration, binding, divergence, or SSR skill in addition when relevant. Do not claim a performance improvement without comparable measurements.';
	return repoMode
		? `${common} For Octane framework-fundamental work, also load octane-core-extend and performance-audit, establish a relevant baseline before editing, and use octane_validate_plan for the final changed paths.`
		: common;
}

export function text(content) {
	return { content: [{ type: 'text', text: content }] };
}

export function isOctaneRepo(root) {
	return existsSync(resolve(root, 'packages/octane/src/runtime.ts'));
}

export function areaForPath(path) {
	if (path.startsWith('packages/octane/src/compiler/')) return 'compiler';
	if (path.startsWith('packages/octane/src/server/') || path.includes('runtime.server'))
		return 'ssr';
	if (path.startsWith('packages/octane/src/runtime') || path === 'packages/octane/src/index.ts') {
		return 'core-runtime';
	}
	if (path.startsWith('packages/octane/tests/')) return 'core-tests';
	if (path.startsWith('packages/app-core/')) return 'metaframework-core';
	if (path.startsWith('packages/rspack-plugin-octane/')) return 'rspack-plugin';
	if (path.startsWith('packages/rsbuild-plugin-octane/')) return 'rsbuild-plugin';
	if (path.startsWith('packages/vite-plugin-octane/')) return 'vite-plugin';
	if (/^packages\/adapter-[^/]+\//.test(path)) return 'deploy-adapter';
	if (path.startsWith('packages/octane-evals/')) return 'evals';
	if (path.startsWith('packages/octane-mcp-server/')) return 'mcp-server';
	const packageMatch = path.match(/^packages\/([^/]+)\//);
	if (packageMatch && KNOWN_BINDING_PACKAGE_DIRS.has(packageMatch[1])) {
		return 'ecosystem-binding';
	}
	if (path.startsWith('benchmarks/')) return 'benchmark';
	if (path.startsWith('website/')) return 'website';
	if (path.startsWith('.rulesync/')) return 'rulesync-source';
	if (path.startsWith('.ai/') || path.startsWith('.codex/') || path.startsWith('.claude/')) {
		return 'agent-instructions';
	}
	if (path.startsWith('docs/') || path.endsWith('.md')) return 'docs';
	return 'repo-tooling';
}

export function validationFor(paths, taskKind) {
	const areas = new Set(paths.map(areaForPath));
	const commands = new Set();

	if (areas.has('rulesync-source')) commands.add('pnpm rules:generate');
	if (
		areas.has('core-runtime') ||
		areas.has('compiler') ||
		areas.has('ssr') ||
		areas.has('core-tests')
	) {
		commands.add('./node_modules/.bin/vitest run packages/octane/tests --project octane');
	}
	if (areas.has('ecosystem-binding')) {
		for (const path of paths) {
			const match = path.match(/^packages\/([^/]+)\//);
			if (match && KNOWN_BINDING_PACKAGE_DIRS.has(match[1])) {
				commands.add(
					`./node_modules/.bin/vitest run packages/${match[1]}/tests --project ${match[1]}`,
				);
			}
		}
	}
	if (areas.has('mcp-server')) {
		commands.add(
			'./node_modules/.bin/vitest run packages/octane-mcp-server --project octane-mcp-server',
		);
	}
	if (areas.has('evals')) {
		commands.add(
			'./node_modules/.bin/vitest run packages/octane-evals/tests --project octane-evals',
		);
	}
	if (areas.has('website')) {
		commands.add('./node_modules/.bin/vitest run website/tests --project website');
	}
	if (areas.has('metaframework-core')) {
		commands.add('./node_modules/.bin/vitest run packages/app-core/tests --project app-core');
	}
	if (areas.has('rspack-plugin')) {
		commands.add(
			'./node_modules/.bin/vitest run packages/rspack-plugin-octane/tests --project rspack-plugin',
		);
	}
	if (areas.has('rsbuild-plugin')) {
		commands.add(
			'./node_modules/.bin/vitest run packages/rsbuild-plugin-octane/tests --project rsbuild-plugin',
		);
	}
	if (areas.has('vite-plugin')) {
		commands.add(
			'./node_modules/.bin/vitest run packages/vite-plugin-octane/tests --project vite-plugin',
		);
	}
	if (areas.has('deploy-adapter')) {
		for (const path of paths) {
			const match = path.match(/^packages\/(adapter-[^/]+)\//);
			if (match) {
				commands.add(
					`./node_modules/.bin/vitest run packages/${match[1]}/tests --project ${match[1]}`,
				);
			}
		}
	}
	if (
		areas.has('metaframework-core') ||
		areas.has('rspack-plugin') ||
		areas.has('rsbuild-plugin') ||
		areas.has('vite-plugin') ||
		areas.has('deploy-adapter')
	) {
		commands.add('pnpm typecheck');
	}
	if (areas.has('benchmark') || taskKind === 'performance' || taskKind === 'core') {
		commands.add('node benchmarks/bench.mjs --quick --ratios');
	}
	if (taskKind === 'api' || taskKind === 'core' || taskKind === 'package')
		commands.add('pnpm typecheck');
	commands.add('pnpm format:check');

	return [...commands];
}

export function engineeringPlanFor(input, repoMode = false) {
	const paths = input.paths ?? [];
	const scope = input.scope;
	const changeKind = input.changeKind ?? 'feature';
	const performanceSensitive =
		scope === 'framework-core' ||
		changeKind === 'performance' ||
		input.performanceSensitive === true;
	const correctnessGate =
		changeKind === 'bug'
			? 'Reproduce the bug through a realistic public boundary and verify that the test has a credible pre-fix failure.'
			: 'Protect the new or changed behavior through a realistic public boundary with an assertion that would fail if the contract were absent.';
	const plan = {
		scope,
		changeKind,
		performanceSensitive,
		areas: paths.map((path) => ({ path, area: areaForPath(path) })),
		requiredSkills: ['build-octane-software'],
		gates: {
			contract: [
				'State the consumer-observable behavior, invariants, failure states, and supported execution modes.',
				'Inspect current source, callers, tests, configuration, and documented Octane divergences before editing.',
			],
			correctness: [
				correctnessGate,
				'Exercise applicable empty, large, repeated, nested, error, abort, cleanup, production, SSR, and hydration cases.',
			],
			performance: performanceSensitive
				? [
						'Identify hot paths and record a relevant baseline before editing.',
						'Compare baseline and candidate with the same environment, warmup, iterations, and semantic controls.',
						'Inspect allocations, retained memory, DOM work, compiler and generated-code cost, SSR/hydration work, and bundle size as applicable.',
						'Do not claim improvement when the delta is within noise or no trustworthy measurement exists.',
					]
				: [
						'Check that the change does not add unnecessary reactive work, retained state, dependencies, or common-path cost.',
						'Measure the important user journey when the change can materially affect it.',
					],
			selfReview: [
				'Read the complete diff adversarially and try to falsify the solution with boundary and lifecycle cases.',
				'Trace new state and allocations through invalidation, cleanup, errors, and aborts.',
				'Compare with a simpler design and remove complexity that does not justify its permanent cost.',
				'Resolve findings, rerun affected checks, and repeat the review on the final diff.',
			],
			handoff: [
				'Report the protected contract, validation commands and results, and applicable baseline/candidate measurements.',
				'Report improvements made during self-review, untested modes, inconclusive evidence, and residual risk.',
			],
		},
	};

	if (scope === 'framework-core' && repoMode) {
		plan.requiredSkills.push('octane-core-extend', 'performance-audit');
	}
	if (scope === 'framework-core' && !repoMode) {
		plan.blockingConditions = [
			'Framework-core work requires the MCP server to run against an Octane monorepo checkout. Set OCTANE_REPO_ROOT, reconnect, and request this plan again so maintainer skills and repository validation are available.',
		];
	}
	if (repoMode) {
		const taskKind =
			scope === 'framework-core' ? 'core' : performanceSensitive ? 'performance' : changeKind;
		plan.validationCommands = validationFor(paths, taskKind);
	}

	return plan;
}

export function runCommand(command, args, options = {}) {
	const cwd = options.cwd ?? process.cwd();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return new Promise((resolvePromise) => {
		const child = spawn(command, args, {
			cwd,
			env: { ...process.env, ...options.env },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill('SIGTERM');
			resolvePromise({
				code: null,
				signal: 'SIGTERM',
				stdout,
				stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms`,
			});
		}, timeoutMs);

		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolvePromise({ code: null, signal: null, stdout, stderr: `${stderr}\n${error.message}` });
		});
		child.on('close', (code, signal) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolvePromise({ code, signal, stdout, stderr });
		});
	});
}

function commandResult(result) {
	return text(JSON.stringify(result, null, 2));
}

export async function scaffoldReactPort(repoRoot, input) {
	const args = ['scripts/scaffold-react-port.mjs', input.reactTestFile];
	if (input.outFile) args.push('--out', input.outFile);
	const result = await runCommand(process.execPath, args, {
		cwd: repoRoot,
		timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});
	return { command: [process.execPath, ...args], ...result };
}

export async function runBenchmark(repoRoot, input) {
	const args = ['benchmarks/bench.mjs'];
	if (input.benchmark && input.benchmark !== 'all') args.push(input.benchmark);
	if (input.quick) args.push('--quick');
	const result = await runCommand(process.execPath, args, {
		cwd: repoRoot,
		timeoutMs: input.timeoutMs ?? 600_000,
	});
	return { command: [process.execPath, ...args], benchmark: input.benchmark, ...result };
}

export async function issueContext(repoRoot, input) {
	const fields =
		'number,title,body,author,labels,state,comments,assignees,milestone,url,createdAt,updatedAt';
	const result = await runCommand('gh', ['issue', 'view', String(input.issue), '--json', fields], {
		cwd: repoRoot,
		timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
	});
	if (result.code !== 0)
		return { command: ['gh', 'issue', 'view', String(input.issue), '--json', fields], ...result };

	let issue;
	try {
		issue = JSON.parse(result.stdout);
	} catch (error) {
		return {
			command: ['gh', 'issue', 'view', String(input.issue), '--json', fields],
			parseError: error.message,
			...result,
		};
	}

	const body = `${issue.title}\n${issue.body ?? ''}`.toLowerCase();
	const labels = issue.labels?.map((label) => label.name) ?? [];
	const suggestedArea =
		body.includes('compiler') || body.includes('tsrx')
			? 'compiler'
			: body.includes('hydration')
				? 'hydration'
				: body.includes('ssr')
					? 'ssr'
					: body.includes('performance') || body.includes('perf')
						? 'performance'
						: 'triage-needed';
	return {
		command: ['gh', 'issue', 'view', String(issue.number ?? input.issue), '--json', fields],
		issue,
		triage: {
			suggestedArea,
			labels,
			state: issue.state,
			url: issue.url,
		},
	};
}

function registerUserTools(server, repoRoot, repoMode) {
	const skills = repoMode ? { ...BUNDLED_SKILLS, ...REPO_SKILLS } : BUNDLED_SKILLS;

	server.registerTool(
		'octane_skill',
		{
			title: 'Octane skill',
			description:
				'Return an Octane agent skill by name. Load build-octane-software before creating or materially changing Octane code; other bundled skills cover React package bridges, component migration, intentional divergences, and SSR setup.' +
				(repoMode ? ' Repo skills cover octane maintainer workflows.' : ''),
			inputSchema: {
				name: z.enum(Object.keys(skills)),
			},
		},
		async ({ name }) => {
			const root = name in BUNDLED_SKILLS ? PACKAGE_ROOT : repoRoot;
			const body = await readFile(resolve(root, skills[name]), 'utf8');
			return text(body);
		},
	);

	server.registerTool(
		'octane_engineering_plan',
		{
			title: 'Plan high-quality Octane engineering work',
			description:
				'Return required correctness, performance-evidence, adversarial self-review, and handoff gates before creating or materially changing Octane software. Framework-core scope always requires baseline/candidate performance evidence and the maintainer core/performance skills.',
			inputSchema: {
				scope: z.enum(['application', 'library', 'framework-core']),
				changeKind: z
					.enum(['bug', 'feature', 'performance', 'refactor', 'api', 'docs', 'test', 'unknown'])
					.default('feature'),
				paths: z.array(z.string()).default([]).describe('Repository-relative changed paths.'),
				performanceSensitive: z
					.boolean()
					.optional()
					.describe('Force performance evidence for application or library work.'),
			},
		},
		async (input) => text(JSON.stringify(engineeringPlanFor(input, repoMode), null, 2)),
	);

	server.registerTool(
		'octane_bridge_react_package',
		{
			title: 'Bridge a React package to Octane',
			description:
				'Scan a React package (from node_modules by name, or any source directory by path) for React API usage and return an Octane compatibility report: which APIs map 1:1, which need rewrites (forwardRef, class components, React-style text-host onChange, react-dom/server imports), whether a framework-agnostic core can be reused verbatim, whether an official @octanejs binding already exists, and a step-by-step bridge plan. Follow up with the bridge-react-package skill for the full workflow.',
			inputSchema: {
				package: z
					.string()
					.optional()
					.describe('npm package name to scan, resolved from projectRoot/node_modules.'),
				path: z
					.string()
					.optional()
					.describe('Directory of source files to scan instead of an installed package.'),
				projectRoot: z
					.string()
					.optional()
					.describe('Project to resolve node_modules from. Defaults to the server cwd.'),
			},
		},
		async (input) => {
			if (!input.package && !input.path) {
				return text(JSON.stringify({ error: "Provide either 'package' or 'path'." }, null, 2));
			}
			const report = await bridgeReport({
				packageName: input.package,
				path: input.path,
				projectRoot: input.projectRoot,
			});
			return text(JSON.stringify(report, null, 2));
		},
	);

	server.registerTool(
		'octane_bindings',
		{
			title: 'List official Octane bindings',
			description:
				'Return the map of React packages that already have maintained @octanejs/* Octane ports. Check here before bridging by hand.',
			inputSchema: {},
		},
		async () => text(JSON.stringify(KNOWN_BINDINGS, null, 2)),
	);
}

function registerRepoTools(server, repoRoot) {
	server.registerTool(
		'octane_project_map',
		{
			title: 'Octane project map',
			description:
				'Return Octane repository map, source ownership, validation commands, and skill paths.',
			inputSchema: {},
		},
		async () => {
			const projectMap = await readFile(resolve(repoRoot, '.ai/project-map.md'), 'utf8');
			return text(projectMap);
		},
	);

	server.registerTool(
		'octane_triage_paths',
		{
			title: 'Triage Octane paths',
			description: 'Classify changed paths by Octane repo area.',
			inputSchema: {
				paths: z.array(z.string()).describe('Repository-relative paths'),
			},
		},
		async ({ paths }) => {
			const rows = paths.map((path) => ({ path, area: areaForPath(path) }));
			return text(JSON.stringify({ repoRoot, paths: rows }, null, 2));
		},
	);

	server.registerTool(
		'octane_validate_plan',
		{
			title: 'Octane validation plan',
			description: 'Recommend validation commands for changed paths and task kind.',
			inputSchema: {
				paths: z.array(z.string()).default([]).describe('Repository-relative changed paths'),
				taskKind: z
					.enum([
						'bug',
						'feature',
						'docs',
						'test',
						'performance',
						'core',
						'compiler',
						'package',
						'api',
						'unknown',
					])
					.default('unknown'),
			},
		},
		async ({ paths, taskKind }) => {
			return text(
				JSON.stringify({ repoRoot, taskKind, commands: validationFor(paths, taskKind) }, null, 2),
			);
		},
	);

	server.registerTool(
		'octane_scaffold_react_port',
		{
			title: 'Scaffold React test port',
			description: 'Run scripts/scaffold-react-port.mjs for a React upstream test file.',
			inputSchema: {
				reactTestFile: z
					.string()
					.describe('Path to the upstream React test file, relative to repo root or absolute.'),
				outFile: z
					.string()
					.optional()
					.describe('Optional output file for the generated Vitest skeleton.'),
				timeoutMs: z.number().int().positive().optional(),
			},
		},
		async (input) => commandResult(await scaffoldReactPort(repoRoot, input)),
	);

	server.registerTool(
		'octane_benchmark',
		{
			title: 'Run Octane benchmark',
			description:
				'Run benchmark suites through the unified runner (node benchmarks/bench.mjs): one manifest suite by name, or every suite with "all". Set quick for the reduced-iteration smoke pass.',
			inputSchema: {
				benchmark: z.enum(['all', ...BENCHMARK_SUITES]).default('all'),
				quick: z.boolean().default(false),
				timeoutMs: z.number().int().positive().optional(),
			},
		},
		async (input) => commandResult(await runBenchmark(repoRoot, input)),
	);

	server.registerTool(
		'octane_issue_context',
		{
			title: 'Fetch Octane issue context',
			description:
				'Fetch a GitHub issue with gh and return structured context plus lightweight triage hints.',
			inputSchema: {
				issue: z
					.union([z.number().int().positive(), z.string()])
					.describe('Issue number or URL accepted by gh issue view.'),
				timeoutMs: z.number().int().positive().optional(),
			},
		},
		async (input) => commandResult(await issueContext(repoRoot, input)),
	);
}

export function createServer(options = {}) {
	const repoRoot = resolve(options.repoRoot || process.env.OCTANE_REPO_ROOT || process.cwd());
	const repoMode = isOctaneRepo(repoRoot);
	const server = new McpServer(
		{ name: 'octane', version: '0.2.0' },
		{ instructions: instructionsFor(repoMode) },
	);
	registerUserTools(server, repoRoot, repoMode);
	if (repoMode) registerRepoTools(server, repoRoot);
	return server;
}

export async function main() {
	const server = createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
