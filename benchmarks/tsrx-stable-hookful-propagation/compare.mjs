import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const HERE = path.dirname(CURRENT_FILE);
const RUNNER = path.join(HERE, 'run.mjs');
const PROCESS_ORDER = ['main', 'candidate', 'candidate', 'main'];
const TARGETS = [
	'dependent-first-high-1000',
	'dependency-first-high-1000',
	'dependent-first-low-40',
	'dependency-first-low-40',
];

function parseArguments(argv) {
	const values = { candidateRoot: '.', iterations: 7, maxScoreRme: 10, output: null };
	for (const argument of argv) {
		const separator = argument.indexOf('=');
		if (!argument.startsWith('--') || separator === -1) {
			throw new Error(`Expected --name=value, received ${argument}`);
		}
		const name = argument.slice(2, separator);
		const value = argument.slice(separator + 1);
		switch (name) {
			case 'reference-root':
				values.referenceRoot = value;
				break;
			case 'reference-revision':
				values.referenceRevision = value;
				break;
			case 'candidate-root':
				values.candidateRoot = value;
				break;
			case 'iterations':
				values.iterations = Number(value);
				break;
			case 'max-score-rme':
				values.maxScoreRme = Number(value);
				break;
			case 'output':
				values.output = value;
				break;
			default:
				throw new Error(`Unknown comparator argument --${name}`);
		}
	}
	if (!values.referenceRoot) throw new Error('--reference-root is required');
	if (!values.referenceRevision) throw new Error('--reference-revision is required');
	if (!/^[0-9a-f]{40}$/i.test(values.referenceRevision)) {
		throw new Error('--reference-revision must be a full 40-character commit SHA');
	}
	if (!Number.isSafeInteger(values.iterations) || values.iterations < 1) {
		throw new Error('--iterations must be a positive integer');
	}
	if (!Number.isFinite(values.maxScoreRme) || values.maxScoreRme < 0) {
		throw new Error('--max-score-rme must be non-negative');
	}
	values.referenceRoot = validateRoot(values.referenceRoot, '--reference-root');
	values.candidateRoot = validateRoot(values.candidateRoot, '--candidate-root');
	if (values.output !== null) values.output = path.resolve(values.output);
	return values;
}

function validateRoot(root, option) {
	const resolved = path.resolve(root);
	const compiler = path.join(resolved, 'packages/octane/src/compiler/index.js');
	if (!fs.existsSync(compiler)) throw new Error(`${option} has no Octane compiler: ${resolved}`);
	return resolved;
}

function gitOutput(root, args) {
	const child = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
	if (child.error) throw child.error;
	if (child.status !== 0) {
		throw new Error(
			`git ${args.join(' ')} failed for ${root}: ${(child.stderr || child.stdout).trim()}`,
		);
	}
	return child.stdout.trim();
}

function checkoutState(root) {
	const changes = gitOutput(root, ['status', '--short']);
	return {
		head: gitOutput(root, ['rev-parse', 'HEAD']),
		branch: gitOutput(root, ['branch', '--show-current']) || null,
		dirty: changes.length > 0,
		changes: changes === '' ? [] : changes.split('\n'),
	};
}

export function assertReferenceState(state, expectedRevision) {
	if (state.head !== expectedRevision) {
		throw new Error(
			`--reference-root is at ${state.head}, expected --reference-revision=${expectedRevision}`,
		);
	}
	if (state.dirty) {
		throw new Error(`--reference-root has changes:\n${state.changes.join('\n')}`);
	}
}

function confidenceStat(samples) {
	return timingStatForJson(summarizeSamples(samples, { scoreMode: 'mean' }), { p99: true });
}

function runProcess(kind, root, iterations, position, temporaryDirectory) {
	const output = path.join(temporaryDirectory, `${position + 1}-${kind}.json`);
	const child = spawnSync(process.execPath, [RUNNER, String(iterations), '--raw-samples'], {
		cwd: HERE,
		encoding: 'utf8',
		env: { ...process.env, BENCH_JSON: output, OCTANE_STABLE_HOOKFUL_ROOT: root },
		maxBuffer: 10 * 1024 * 1024,
	});
	if (child.error) throw child.error;
	if (child.status !== 0) {
		throw new Error(
			`${kind} runner at position ${position + 1} exited ${child.status ?? child.signal}: ${(child.stderr || child.stdout).trim()}`,
		);
	}
	const payload = JSON.parse(fs.readFileSync(output, 'utf8'));
	if (payload.failed) throw new Error(`${kind} runner failed: ${payload.failed}`);
	if (
		!Array.isArray(payload.semanticControls) ||
		payload.semanticControls.length === 0 ||
		payload.semanticControls.some((control) => control.correctness !== 'pass')
	) {
		throw new Error(`${kind} runner did not pass semantic controls`);
	}
	const semanticControlHashes = {};
	for (const control of payload.semanticControls) {
		if (
			typeof control.name !== 'string' ||
			Object.hasOwn(semanticControlHashes, control.name) ||
			typeof control.outputHash !== 'string' ||
			control.outputHash.length === 0
		) {
			throw new Error(`${kind} runner emitted invalid semantic control hashes`);
		}
		semanticControlHashes[control.name] = control.outputHash;
	}
	const targets = {};
	for (const name of TARGETS) {
		const target = payload.targets?.find((entry) => entry.name === name);
		const samples = target?.rawSamples?.compile;
		if (target?.meta?.correctness !== 'pass') throw new Error(`${kind}/${name} failed semantics`);
		if (
			!Array.isArray(samples) ||
			samples.length !== iterations ||
			samples.some((sample) => !Number.isFinite(sample))
		) {
			throw new Error(`${kind}/${name} did not emit ${iterations} finite samples`);
		}
		targets[name] = samples;
	}
	return {
		position: position + 1,
		implementation: kind,
		root,
		targets,
		outputHashes: Object.fromEntries(
			payload.targets.map((target) => [target.name, target.meta?.outputHash]),
		),
		semanticControlHashes,
	};
}

export function aggregateProcesses(processes, kind) {
	const matching = processes.filter((process) => process.implementation === kind);
	if (matching.length !== 2) throw new Error(`expected two ${kind} processes`);
	return Object.fromEntries(
		TARGETS.map((name) => [
			name,
			confidenceStat(matching.flatMap((process) => process.targets[name])),
		]),
	);
}

function assertMatchingHashes(processes, property, label) {
	const names = new Set(processes.flatMap((process) => Object.keys(process[property] ?? {})));
	for (const name of names) {
		const hashes = processes.map((process) => process[property]?.[name]);
		if (
			hashes.some((hash) => typeof hash !== 'string' || hash.length === 0) ||
			new Set(hashes).size !== 1
		) {
			throw new Error(`${label} ${name} emitted different code across main and candidate`);
		}
	}
}

export function assertEquivalentOutputs(processes) {
	assertMatchingHashes(processes, 'outputHashes', 'target');
	assertMatchingHashes(processes, 'semanticControlHashes', 'semantic control');
}

function bounds(stat) {
	const margin = (stat.score * stat.scoreRme) / 100;
	return { lower: stat.score - margin, upper: stat.score + margin };
}

export function evaluateGates(attempt) {
	const main = attempt.aggregate.main;
	const candidate = attempt.aggregate.candidate;
	const mainHigh = bounds(main['dependent-first-high-1000']);
	const candidateHigh = bounds(candidate['dependent-first-high-1000']);
	const improvementRatio = mainHigh.lower / candidateHigh.upper;
	const improvementMs = mainHigh.lower - candidateHigh.upper;
	const candidateOrderRatio =
		candidate['dependent-first-high-1000'].score / candidate['dependency-first-high-1000'].score;
	const lowNames = ['dependent-first-low-40', 'dependency-first-low-40'];
	const lowRatios = lowNames.map((name) => candidate[name].score / main[name].score);
	const lowMinRatios = lowNames.map((name) => candidate[name].min / main[name].min);
	return {
		highCardinality: {
			improvementRatio,
			minimumRatio: 1.2,
			improvementMs,
			minimumMs: 25,
			formula: 'pass when conservative ratio >= 1.2 or conservative delta >= 25ms',
			passed: improvementRatio >= 1.2 || improvementMs >= 25,
		},
		declarationOrder: {
			actual: candidateOrderRatio,
			maximum: 1.25,
			passed: candidateOrderRatio <= 1.25,
		},
		ordinarySize: {
			scoreRatios: lowRatios,
			minRatios: lowMinRatios,
			maximum: 1.1,
			passed:
				lowRatios.every((ratio) => ratio <= 1.1) && lowMinRatios.every((ratio) => ratio <= 1.1),
		},
	};
}

function collectAttempt(config, iterations) {
	const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-hookful-compare-'));
	try {
		const roots = { main: config.referenceRoot, candidate: config.candidateRoot };
		const processes = PROCESS_ORDER.map((kind, position) =>
			runProcess(kind, roots[kind], iterations, position, temporaryDirectory),
		);
		assertEquivalentOutputs(processes);
		const aggregate = {
			main: aggregateProcesses(processes, 'main'),
			candidate: aggregateProcesses(processes, 'candidate'),
		};
		const excessiveScoreRme = [];
		for (const kind of ['main', 'candidate']) {
			for (const name of TARGETS) {
				const scoreRme = aggregate[kind][name].scoreRme;
				if (scoreRme > config.maxScoreRme) excessiveScoreRme.push({ kind, name, scoreRme });
			}
		}
		return {
			iterations,
			processOrder: PROCESS_ORDER,
			processes,
			aggregate,
			noise: {
				maxScoreRme: config.maxScoreRme,
				excessiveScoreRme,
				passed: excessiveScoreRme.length === 0,
			},
		};
	} finally {
		fs.rmSync(temporaryDirectory, { force: true, recursive: true });
	}
}

function emit(result, output) {
	const serialized = `${JSON.stringify(result, null, '\t')}\n`;
	if (output !== null) fs.writeFileSync(output, serialized);
	process.stdout.write(serialized);
}

function main() {
	let config;
	try {
		config = parseArguments(process.argv.slice(2));
		const revisions = {
			main: checkoutState(config.referenceRoot),
			candidate: checkoutState(config.candidateRoot),
		};
		assertReferenceState(revisions.main, config.referenceRevision);
		const attempts = [collectAttempt(config, config.iterations)];
		if (!attempts[0].noise.passed) attempts.push(collectAttempt(config, 14));
		const finalAttempt = attempts.at(-1);
		if (!finalAttempt.noise.passed) {
			emit(
				{
					suite: 'tsrx-stable-hookful-propagation-paired',
					status: 'inconclusive',
					exitCode: 2,
					config,
					revisions,
					attempts,
					reason: 'scoreRme remained above the configured ceiling after one rerun',
				},
				config.output,
			);
			process.exitCode = 2;
			return;
		}
		const gates = evaluateGates(finalAttempt);
		const passed = Object.values(gates).every((gate) => gate.passed);
		emit(
			{
				suite: 'tsrx-stable-hookful-propagation-paired',
				status: passed ? 'pass' : 'fail',
				exitCode: passed ? 0 : 1,
				config,
				revisions,
				attempts,
				gates,
			},
			config.output,
		);
		if (!passed) process.exitCode = 1;
	} catch (error) {
		emit(
			{
				suite: 'tsrx-stable-hookful-propagation-paired',
				status: 'fail',
				exitCode: 1,
				...(config ? { config } : {}),
				error: error instanceof Error ? (error.stack ?? error.message) : String(error),
			},
			config?.output ?? null,
		);
		process.exitCode = 1;
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === CURRENT_FILE) main();
