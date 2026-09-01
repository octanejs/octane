import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const HERE = path.dirname(CURRENT_FILE);
const RUNNER = path.join(HERE, 'run.mjs');
const ROOT_FIRST = 'anchorless-dependent-first-9600';
const LEAF_FIRST = 'anchorless-dependency-first-9600';
const PROCESS_ORDER = ['main', 'candidate', 'candidate', 'main'];

function parseArguments(argv) {
	const values = {
		candidateRoot: '.',
		iterations: 8,
		maxScoreRme: 10,
		maxOrderRatio: 1.25,
		minRootImprovementMs: 25,
		output: null,
	};
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
			case 'max-order-ratio':
				values.maxOrderRatio = Number(value);
				break;
			case 'min-root-improvement-ms':
				values.minRootImprovementMs = Number(value);
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
	for (const [name, value] of [
		['--max-score-rme', values.maxScoreRme],
		['--max-order-ratio', values.maxOrderRatio],
		['--min-root-improvement-ms', values.minRootImprovementMs],
	]) {
		if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
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

function confidenceStat(samples, options) {
	const summarized = summarizeSamples(samples, options);
	const scoreMoe = (summarized.score * summarized.scoreRme) / 100;
	return {
		...timingStatForJson(summarized, { p99: true }),
		scoreMoe,
		scoreLower95: summarized.score - scoreMoe,
		scoreUpper95: summarized.score + scoreMoe,
	};
}

function selectTarget(payload, name, iterations) {
	const target = payload.targets?.find((entry) => entry.name === name);
	if (!target) throw new Error(`runner omitted ${name}`);
	if (target.meta?.correctness !== 'pass') throw new Error(`${name} did not pass semantics`);
	const samples = target.rawSamples?.compile;
	if (
		!Array.isArray(samples) ||
		samples.length !== iterations ||
		samples.some((n) => !Number.isFinite(n))
	) {
		throw new Error(`${name} did not emit ${iterations} finite raw samples`);
	}
	return {
		samples,
		stat: confidenceStat(samples),
		meta: target.meta,
	};
}

function runProcess(kind, root, iterations, position, temporaryDirectory) {
	const outputPath = path.join(temporaryDirectory, `${position + 1}-${kind}.json`);
	const child = spawnSync(
		process.execPath,
		[RUNNER, String(iterations), '--anchorless-only', '--raw-samples'],
		{
			cwd: HERE,
			encoding: 'utf8',
			env: { ...process.env, OCTANE_GRAPH_ROOT: root, BENCH_JSON: outputPath },
			maxBuffer: 10 * 1024 * 1024,
		},
	);
	if (child.error) throw child.error;
	if (child.status !== 0) {
		throw new Error(
			`${kind} runner at position ${position + 1} exited ${child.status ?? child.signal}: ${(
				child.stderr || child.stdout
			).trim()}`,
		);
	}
	const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
	if (payload.failed) throw new Error(`${kind} runner failed: ${payload.failed}`);
	if (
		!Array.isArray(payload.semanticControls) ||
		payload.semanticControls.length === 0 ||
		payload.semanticControls.some((control) => control.correctness !== 'pass')
	) {
		throw new Error(`${kind} runner did not pass its anchorless semantic controls`);
	}
	return {
		position: position + 1,
		implementation: kind,
		root,
		rootFirst: selectTarget(payload, ROOT_FIRST, iterations),
		leafFirst: selectTarget(payload, LEAF_FIRST, iterations),
		semanticControls: {
			count: payload.semanticControls.length,
			allPassed: true,
		},
	};
}

export function aggregateProcesses(processes, kind) {
	const matching = processes.filter((process) => process.implementation === kind);
	if (matching.length !== 2) throw new Error(`expected two ${kind} processes`);
	const rootFirstSamples = matching.flatMap((process) => process.rootFirst.samples);
	const leafFirstSamples = matching.flatMap((process) => process.leafFirst.samples);
	return {
		rootFirst: {
			samples: rootFirstSamples,
			stat: confidenceStat(rootFirstSamples, { scoreMode: 'mean' }),
		},
		leafFirst: {
			samples: leafFirstSamples,
			stat: confidenceStat(leafFirstSamples, { scoreMode: 'mean' }),
		},
	};
}

function collectAttempt(config, iterations) {
	const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-tsrx-compare-'));
	try {
		const roots = { main: config.referenceRoot, candidate: config.candidateRoot };
		const processes = PROCESS_ORDER.map((kind, position) =>
			runProcess(kind, roots[kind], iterations, position, temporaryDirectory),
		);
		const aggregate = {
			main: aggregateProcesses(processes, 'main'),
			candidate: aggregateProcesses(processes, 'candidate'),
		};
		const excessiveScoreRme = [];
		for (const kind of ['main', 'candidate']) {
			for (const order of ['rootFirst', 'leafFirst']) {
				const scoreRme = aggregate[kind][order].stat.scoreRme;
				if (scoreRme > config.maxScoreRme) excessiveScoreRme.push({ kind, order, scoreRme });
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

export function evaluateGates(config, attempt) {
	const { main, candidate } = attempt.aggregate;
	const candidateOrderRatio = candidate.rootFirst.stat.score / candidate.leafFirst.stat.score;
	const conservativeRootImprovementMs =
		main.rootFirst.stat.scoreLower95 - candidate.rootFirst.stat.scoreUpper95;
	const leafScoreLimit = main.leafFirst.stat.score * 1.15;
	const leafMinLimit = main.leafFirst.stat.min * 1.1;
	const leafScoreExceeded = candidate.leafFirst.stat.score > leafScoreLimit;
	const leafMinExceeded = candidate.leafFirst.stat.min > leafMinLimit;
	const leafRegression = leafScoreExceeded && leafMinExceeded;
	return {
		candidateOrderRatio: {
			actual: candidateOrderRatio,
			maximum: config.maxOrderRatio,
			passed: candidateOrderRatio <= config.maxOrderRatio,
		},
		conservativeRootImprovementMs: {
			actual: conservativeRootImprovementMs,
			minimum: config.minRootImprovementMs,
			formula: 'main.rootFirst.scoreLower95 - candidate.rootFirst.scoreUpper95',
			passed: conservativeRootImprovementMs >= config.minRootImprovementMs,
		},
		leafFirstNonRegression: {
			candidateScore: candidate.leafFirst.stat.score,
			mainScore: main.leafFirst.stat.score,
			scoreLimit: leafScoreLimit,
			candidateMin: candidate.leafFirst.stat.min,
			mainMin: main.leafFirst.stat.min,
			minLimit: leafMinLimit,
			scoreExceeded: leafScoreExceeded,
			minExceeded: leafMinExceeded,
			formula:
				'failure iff candidate score > main score * 1.15 AND candidate min > main min * 1.10',
			passed: !leafRegression,
		},
	};
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
		if (!attempts[0].noise.passed) attempts.push(collectAttempt(config, 16));
		const finalAttempt = attempts.at(-1);
		if (!finalAttempt.noise.passed) {
			const result = {
				suite: 'tsrx-component-graph-paired',
				status: 'inconclusive',
				exitCode: 2,
				config,
				revisions,
				scorer: {
					module: 'benchmarks/lib/stats.mjs',
					aggregate: 'arithmetic mean of all samples from both process positions',
					confidenceBounds: 'score +/- (score * scoreRme / 100)',
				},
				attempts,
				reason:
					'representative scoreRme remained above the configured ceiling after one 16-iteration rerun',
			};
			emit(result, config.output);
			process.exitCode = 2;
		} else {
			const gates = evaluateGates(config, finalAttempt);
			const passed = Object.values(gates).every((gate) => gate.passed);
			const result = {
				suite: 'tsrx-component-graph-paired',
				status: passed ? 'pass' : 'fail',
				exitCode: passed ? 0 : 1,
				config,
				revisions,
				scorer: {
					module: 'benchmarks/lib/stats.mjs',
					aggregate: 'arithmetic mean of all samples from both process positions',
					confidenceBounds: 'score +/- (score * scoreRme / 100)',
				},
				attempts,
				gates,
			};
			emit(result, config.output);
			if (!passed) process.exitCode = 1;
		}
	} catch (error) {
		const result = {
			suite: 'tsrx-component-graph-paired',
			status: 'fail',
			exitCode: 1,
			...(config ? { config } : {}),
			error: error instanceof Error ? (error.stack ?? error.message) : String(error),
		};
		emit(result, config?.output ?? null);
		process.exitCode = 1;
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === CURRENT_FILE) main();
