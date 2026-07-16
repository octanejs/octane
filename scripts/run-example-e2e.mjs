#!/usr/bin/env node

import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
export const DEFAULT_CATALOG_PATH = path.join(REPO_ROOT, 'examples', 'catalog.json');

function requireRecord(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value;
}

function requireNonEmptyString(value, label) {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${label} must be a non-empty string`);
	}
	return value;
}

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, 'utf8'));
	} catch (error) {
		throw new Error(
			`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

function resolveInsideRepo(repoRoot, candidate, label) {
	const resolved = path.resolve(repoRoot, candidate);
	const relative = path.relative(repoRoot, resolved);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`${label} must stay inside the repository`);
	}
	return resolved;
}

/**
 * Count Playwright executions reachable from a package script. Wrapper scripts
 * such as `pnpm test:e2e:production && pnpm test:e2e:dev` count both modes.
 */
export function countPlaywrightTestRuns(scripts, scriptName) {
	const scriptMap = requireRecord(scripts, 'package scripts');

	function visit(name, ancestors) {
		if (ancestors.has(name)) {
			throw new Error(`Package script cycle while measuring ${JSON.stringify(scriptName)}`);
		}
		const command = scriptMap[name];
		if (typeof command !== 'string') return 0;

		const nextAncestors = new Set(ancestors);
		nextAncestors.add(name);
		let count = [...command.matchAll(/\bplaywright(?:\.cmd)?\s+test\b/g)].length;
		for (const match of command.matchAll(/\bpnpm\s+(?:run\s+)?([a-z0-9][a-z0-9:_-]*)\b/gi)) {
			const referencedScript = match[1];
			if (referencedScript in scriptMap) {
				count += visit(referencedScript, nextAncestors);
			}
		}
		return count;
	}

	return visit(scriptName, new Set());
}

/** Read the generated catalog and each app's source manifest/package metadata. */
export async function readExampleInventory(options = {}) {
	const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
	const catalogPath = path.resolve(
		options.catalogPath ?? path.join(repoRoot, 'examples/catalog.json'),
	);
	const catalog = requireRecord(await readJson(catalogPath), catalogPath);
	if (!Array.isArray(catalog.examples) || catalog.examples.length === 0) {
		throw new Error(`${catalogPath} must contain at least one example`);
	}

	const seenIds = new Set();
	const apps = [];
	for (const [index, catalogEntryValue] of catalog.examples.entries()) {
		const label = `${catalogPath} examples[${index}]`;
		const catalogEntry = requireRecord(catalogEntryValue, label);
		const relativeDirectory = requireNonEmptyString(catalogEntry.directory, `${label}.directory`);
		const directory = resolveInsideRepo(repoRoot, relativeDirectory, `${label}.directory`);
		const manifestPath = path.join(directory, 'example.json');
		const packagePath = path.join(directory, 'package.json');
		const manifest = requireRecord(await readJson(manifestPath), manifestPath);
		const packageManifest = requireRecord(await readJson(packagePath), packagePath);
		const id = requireNonEmptyString(manifest.id, `${manifestPath} id`);

		if (catalogEntry.id !== id) {
			throw new Error(`${manifestPath} id does not match the generated catalog`);
		}
		if (seenIds.has(id)) throw new Error(`Duplicate example id ${JSON.stringify(id)}`);
		seenIds.add(id);

		if (!Array.isArray(manifest.journeys) || manifest.journeys.length === 0) {
			throw new Error(`${manifestPath} must declare at least one journey`);
		}
		if (!Array.isArray(manifest.dialects) || manifest.dialects.length === 0) {
			throw new Error(`${manifestPath} must declare at least one dialect`);
		}

		const commands = requireRecord(manifest.commands, `${manifestPath} commands`);
		const e2eScript = requireNonEmptyString(commands.e2e, `${manifestPath} commands.e2e`);
		const scripts = requireRecord(packageManifest.scripts, `${packagePath} scripts`);
		requireNonEmptyString(scripts[e2eScript], `${packagePath} scripts.${e2eScript}`);
		const playwrightRuns = countPlaywrightTestRuns(scripts, e2eScript);
		const executionModes = Math.max(manifest.dialects.length, playwrightRuns, 1);

		apps.push({
			id,
			title: requireNonEmptyString(manifest.title, `${manifestPath} title`),
			directory,
			relativeDirectory,
			e2eScript,
			journeyCount: manifest.journeys.length,
			executionModes,
			weight: manifest.journeys.length * executionModes,
		});
	}

	return apps.sort((left, right) => left.id.localeCompare(right.id));
}

function compareNumberArrays(left, right) {
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

function candidateScore(candidate) {
	const maximumWeight = Math.max(...candidate.weights);
	const minimumWeight = Math.min(...candidate.weights);
	const maximumCount = Math.max(...candidate.counts);
	const minimumCount = Math.min(...candidate.counts);
	return [maximumWeight, maximumWeight - minimumWeight, maximumCount, maximumCount - minimumCount];
}

/**
 * Build an exact, deterministic minimum-makespan plan. The state space is small
 * for the example catalog, and the secondary scores keep app counts balanced.
 */
export function createShardPlan(apps, shardCount = 3) {
	if (!Number.isInteger(shardCount) || shardCount < 1) {
		throw new Error('shardCount must be a positive integer');
	}
	if (!Array.isArray(apps) || apps.length === 0) {
		throw new Error('apps must contain at least one example');
	}

	const ids = new Set();
	const orderedApps = [...apps].sort((left, right) => left.id.localeCompare(right.id));
	for (const app of orderedApps) {
		if (typeof app.id !== 'string' || app.id.length === 0) {
			throw new Error('Every example must have an id');
		}
		if (ids.has(app.id)) throw new Error(`Duplicate example id ${JSON.stringify(app.id)}`);
		ids.add(app.id);
		if (!Number.isInteger(app.weight) || app.weight < 1) {
			throw new Error(`${app.id} must have a positive integer weight`);
		}
	}

	let states = new Map([
		[
			`${Array(shardCount).fill(0)}|${Array(shardCount).fill(0)}`,
			{
				weights: Array(shardCount).fill(0),
				counts: Array(shardCount).fill(0),
				assignment: [],
			},
		],
	]);

	for (const app of orderedApps) {
		const nextStates = new Map();
		for (const state of states.values()) {
			for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
				const weights = [...state.weights];
				const counts = [...state.counts];
				weights[shardIndex] += app.weight;
				counts[shardIndex] += 1;
				const assignment = [...state.assignment, shardIndex];
				const key = `${weights}|${counts}`;
				const existing = nextStates.get(key);
				if (!existing || compareNumberArrays(assignment, existing.assignment) < 0) {
					nextStates.set(key, { weights, counts, assignment });
				}
			}
		}
		states = nextStates;
	}

	let best;
	for (const candidate of states.values()) {
		if (!best) {
			best = candidate;
			continue;
		}
		const scoreComparison = compareNumberArrays(candidateScore(candidate), candidateScore(best));
		if (
			scoreComparison < 0 ||
			(scoreComparison === 0 && compareNumberArrays(candidate.assignment, best.assignment) < 0)
		) {
			best = candidate;
		}
	}

	const shards = Array.from({ length: shardCount }, (_, index) => ({
		index: index + 1,
		estimatedWeight: best.weights[index],
		apps: [],
	}));
	for (const [appIndex, app] of orderedApps.entries()) {
		shards[best.assignment[appIndex]].apps.push(app);
	}

	return {
		shardCount,
		totalWeight: orderedApps.reduce((total, app) => total + app.weight, 0),
		shards,
	};
}

function formatDuration(milliseconds) {
	if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
	return `${(milliseconds / 1000).toFixed(1)}s`;
}

function escapeMarkdown(value) {
	return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function formatStepSummary(result) {
	const rows = result.timings.map((timing) => {
		const status =
			timing.status === 'passed' ? 'Passed' : timing.status === 'failed' ? 'Failed' : 'Not run';
		const duration = timing.durationMs === null ? '—' : formatDuration(timing.durationMs);
		return `| ${escapeMarkdown(timing.app.title)} (\`${escapeMarkdown(timing.app.id)}\`) | ${timing.app.weight} | ${status} | ${duration} |`;
	});
	return [
		`### Example E2E shard ${result.shardIndex}/${result.shardCount}`,
		'',
		`Estimated weight: **${result.estimatedWeight}** · Elapsed: **${formatDuration(result.durationMs)}**`,
		'',
		'| Example | Weight | Result | Duration |',
		'| --- | ---: | --- | ---: |',
		...rows,
		'',
	].join('\n');
}

export function executeExample(app, options = {}) {
	const executable = options.pnpmExecutable ?? 'pnpm';
	return new Promise((resolve, reject) => {
		const child = spawn(executable, ['--dir', app.directory, app.e2eScript], {
			cwd: options.repoRoot ?? REPO_ROOT,
			stdio: 'inherit',
			env: options.env ?? process.env,
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			resolve({ exitCode: code ?? 1, signal });
		});
	});
}

/** Run one planned shard, one app at a time, and retain the child's exit code. */
export async function runExampleShard(options) {
	const {
		apps,
		shardIndex,
		shardCount,
		repoRoot = REPO_ROOT,
		executor = executeExample,
		now = () => performance.now(),
		logger = console,
		summaryPath = process.env.GITHUB_STEP_SUMMARY,
	} = options;
	const plan = createShardPlan(apps, shardCount);
	if (!Number.isInteger(shardIndex) || shardIndex < 1 || shardIndex > shardCount) {
		throw new Error(`shardIndex must be between 1 and ${shardCount}`);
	}
	const shard = plan.shards[shardIndex - 1];
	const appList = shard.apps.map((app) => `${app.id} (${app.weight})`).join(', ');
	logger.log(
		`Example E2E shard ${shardIndex}/${shardCount}: ${shard.apps.length} app(s), estimated weight ${shard.estimatedWeight}`,
	);
	logger.log(`Plan: ${appList || '(empty)'}`);

	const startedAt = now();
	const timings = [];
	let exitCode = 0;
	for (const [index, app] of shard.apps.entries()) {
		logger.log(`\n[${index + 1}/${shard.apps.length}] Running ${app.title} (${app.id})`);
		const appStartedAt = now();
		let outcome;
		try {
			outcome = await executor(app, { repoRoot });
		} catch (error) {
			outcome = { exitCode: 1 };
			logger.error(error instanceof Error ? error.message : String(error));
		}
		const durationMs = now() - appStartedAt;
		const childExitCode = Number.isInteger(outcome?.exitCode) ? outcome.exitCode : 1;
		const status = childExitCode === 0 ? 'passed' : 'failed';
		timings.push({ app, status, durationMs });
		logger.log(
			`${status === 'passed' ? 'Passed' : 'Failed'} ${app.id} in ${formatDuration(durationMs)}`,
		);
		if (childExitCode !== 0) {
			exitCode = childExitCode;
			for (const skippedApp of shard.apps.slice(index + 1)) {
				timings.push({ app: skippedApp, status: 'not-run', durationMs: null });
			}
			break;
		}
	}

	const result = {
		shardIndex,
		shardCount,
		estimatedWeight: shard.estimatedWeight,
		durationMs: now() - startedAt,
		exitCode,
		timings,
	};
	logger.log(
		`\nExample E2E shard ${shardIndex}/${shardCount} ${exitCode === 0 ? 'passed' : 'failed'} in ${formatDuration(result.durationMs)}`,
	);
	if (summaryPath) {
		try {
			await appendFile(summaryPath, formatStepSummary(result), 'utf8');
		} catch (error) {
			logger.error(
				`Could not write GITHUB_STEP_SUMMARY: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return result;
}

export function parseShard(value) {
	const match = /^(\d+)\/(\d+)$/.exec(value);
	if (!match) throw new Error('--shard must use the form <index>/<total>');
	const index = Number(match[1]);
	const total = Number(match[2]);
	if (
		!Number.isInteger(index) ||
		!Number.isInteger(total) ||
		total < 1 ||
		index < 1 ||
		index > total
	) {
		throw new Error('--shard index must be between 1 and its positive total');
	}
	return { index, total };
}

function usage() {
	return [
		'Usage: node scripts/run-example-e2e.mjs [--shard <index>/<total>] [--list]',
		'',
		'Without --shard, every example runs sequentially. CI uses three balanced shards.',
	].join('\n');
}

export async function main(argv = process.argv.slice(2), options = {}) {
	let shard = { index: 1, total: 1 };
	let listOnly = false;
	let repoRoot = options.repoRoot ?? REPO_ROOT;
	let catalogPath = options.catalogPath;
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === '--') continue;
		if (argument === '--help' || argument === '-h') {
			(options.logger ?? console).log(usage());
			return 0;
		}
		if (argument === '--list') {
			listOnly = true;
			continue;
		}
		if (argument === '--shard') {
			shard = parseShard(argv[++index] ?? '');
			continue;
		}
		if (argument.startsWith('--shard=')) {
			shard = parseShard(argument.slice('--shard='.length));
			continue;
		}
		if (argument === '--repo-root') {
			repoRoot = path.resolve(argv[++index] ?? '');
			continue;
		}
		if (argument === '--catalog') {
			catalogPath = path.resolve(argv[++index] ?? '');
			continue;
		}
		throw new Error(`Unknown argument ${JSON.stringify(argument)}\n${usage()}`);
	}

	const apps = await readExampleInventory({ repoRoot, catalogPath });
	const plan = createShardPlan(apps, shard.total);
	if (listOnly) {
		const logger = options.logger ?? console;
		for (const plannedShard of plan.shards) {
			logger.log(
				`Shard ${plannedShard.index}/${plan.shardCount} (weight ${plannedShard.estimatedWeight}): ${plannedShard.apps.map((app) => app.id).join(', ') || '(empty)'}`,
			);
		}
		return 0;
	}

	const result = await runExampleShard({
		apps,
		shardIndex: shard.index,
		shardCount: shard.total,
		repoRoot,
		executor: options.executor,
		now: options.now,
		logger: options.logger,
		summaryPath: options.summaryPath,
	});
	return result.exitCode;
}

const isMain =
	process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	try {
		process.exitCode = await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
