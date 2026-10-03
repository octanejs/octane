// Paired base/head js-framework comparison: the pull request benchmark's timing
// and work harness.
//
// Both builds are driven by THIS harness, so a pull request that changes the
// harness cannot make its base look different. It produces two kinds of result
// for each Octane dialect and each canonical operation:
//
// - Work counters (the gate). In a --jitless Chromium, Chromium's precise call
//   coverage counts every production-bundle function call the operation makes,
//   and a MutationObserver counts its DOM mutations (inserted and removed nodes,
//   attribute writes, text writes). Both are exact for a fixed build, so any
//   increase over the base is real extra work: `calls_<op>` and `dom_<op>`.
// - Wall time (a report). Base and head pages live in one browser and alternate
//   per sample, base-first on even pairs and head-first on odd ones, so runner
//   drift moves both sides of a pair together. An operation that can repeat
//   (update, select, swap, remove, select_lots) loops until a sample takes about
//   20ms, which lifts it far off Chromium's 0.1ms timer floor. The head result
//   carries the median head/base ratio and its 95% bootstrap interval.
//
// Run from the repository root:
//   node benchmarks/js-framework/pair.mjs --base-tree=<checkout> \
//     --base-json=<file> --head-json=<file> [--pairs=30] [--no-build] [--work-only]
//
// `--work-only` collects the exact counters without timing. With the same
// checkout as both trees it is the determinism control: every counter must match.
//
// The head tree is this checkout. Each tree's fixtures are built with its own
// dependencies and served from its own dist: head on 5176/5177, base on 6176/6177.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { pairedRatio, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import {
	CANONICAL_OPS,
	DIRECT_LIST_MOUNTS,
	ensureState,
	seedRandom,
	sleep,
	timeClick,
	verifyDirectListMount,
	verifySelection,
} from './operations.mjs';

const HEAD_TREE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const options = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((arg) => arg.startsWith('--'))
		.map((arg) => {
			const eq = arg.indexOf('=');
			return eq === -1 ? [arg.slice(2), true] : [arg.slice(2, eq), arg.slice(eq + 1)];
		}),
);
if (!options['base-tree'] || !options['base-json'] || !options['head-json']) {
	console.error(
		'usage: node benchmarks/js-framework/pair.mjs --base-tree=<checkout> --base-json=<file> --head-json=<file> [--pairs=30] [--no-build] [--work-only]',
	);
	process.exit(2);
}
const BASE_TREE = path.resolve(options['base-tree']);
const PAIRS = Number(options.pairs ?? 30);
if (!Number.isSafeInteger(PAIRS) || PAIRS < 2) throw new Error('--pairs must be an integer >= 2');
const SAMPLE_MS = 20;
const WARMUP = 3;
// Upper bounds on the repetitions in one sample. Each `remove` deletes a row,
// so it stays inside the 1,000-row table. A warm selection takes a few
// microseconds, so it needs thousands of clicks to fill a sample.
const MAX_REPEAT = { remove: 800, default: 5000 };
const REPEATABLE = new Set(['update', 'select', 'swap', 'remove', 'select_lots']);
const FIXTURES = [
	{ name: 'octane-tsrx', directory: 'octane-tsrx', head: 5176, base: 6176 },
	{ name: 'octane-jsx', directory: 'octane-jsx', head: 5177, base: 6177 },
];
const SIDES = ['base', 'head'];
const exact = (value) => ({ median: value, min: value, samples: 1 });
const treeOf = { base: BASE_TREE, head: HEAD_TREE };
const urlOf = (fixture, side) => `http://localhost:${fixture[side]}/`;

class SideError extends Error {
	constructor(side, error) {
		super(`${side}: ${error?.message ?? error}`, { cause: error });
		this.side = side;
	}
}
const onSide = async (side, work) => {
	try {
		return await work();
	} catch (error) {
		throw error instanceof SideError ? error : new SideError(side, error);
	}
};

function build(side) {
	const filters = FIXTURES.flatMap(({ name }) => ['--filter', `${name}-jsbench`]);
	const result = spawnSync('pnpm', ['--dir', treeOf[side], ...filters, 'build'], {
		stdio: 'inherit',
	});
	if (result.status !== 0) throw new SideError(side, `fixture build exited ${result.status}`);
}

function waitForPort(port, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const attempt = () => {
			const socket = net.connect(port, 'localhost');
			socket.once('connect', () => {
				socket.destroy();
				resolve();
			});
			socket.once('error', () => {
				socket.destroy();
				if (Date.now() > deadline) reject(new Error(`nothing listened on :${port}`));
				else setTimeout(attempt, 200);
			});
		};
		attempt();
	});
}

async function serve(side, fixture) {
	const child = spawn(
		'pnpm',
		['exec', 'vite', 'preview', '--port', String(fixture[side]), '--strictPort'],
		{
			cwd: path.join(treeOf[side], 'benchmarks/js-framework', fixture.directory),
			detached: true,
			stdio: 'ignore',
		},
	);
	child.unref();
	await onSide(side, () => waitForPort(fixture[side]));
	return child;
}

async function openPage(context, fixture, side) {
	return await onSide(side, async () => {
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.errors = errors;
		await page.goto(urlOf(fixture, side), { waitUntil: 'load' });
		await page.waitForSelector('#run', { timeout: 10_000 });
		await seedRandom(page);
		return page;
	});
}

const selectorsFor = (op, index, repeat) =>
	op.alternateClick
		? repeat > 1
			? [op.click, op.alternateClick]
			: [index % 2 === 1 ? op.alternateClick : op.click]
		: [op.click];

// Repetitions per sample, sized on the head page and shared by both sides, so
// each pair compares the same work. A looped operation runs far faster than a
// cold single one, so the count is refined on loops until a sample really takes
// about SAMPLE_MS; a shorter sample quantizes on the 0.1ms timer.
const parityFor = (op, repeat) => {
	// A selection sample ends on the alternate row, so the next one starts by
	// selecting a different row instead of re-selecting the current one.
	if (op.alternateClick && repeat % 2 === 1) repeat++;
	// An even number of swaps restores the original order, which a swap that
	// did nothing would also leave. An odd count keeps every sample verifiable.
	if (op.name === 'swap' && repeat % 2 === 0) repeat++;
	return repeat;
};

// `update` appends to every tenth label on each click, so a looped sample
// would leave longer labels for the next one. Each update sample starts from
// freshly built rows instead.
async function prepare(page, op) {
	if (op.name === 'update') {
		// Commit the rebuild before the sample and prove it replaced the rows, so
		// no stale labels or in-flight random draws reach the timed window.
		await page.evaluate(async () => {
			const before = document.querySelector('tbody tr');
			document.getElementById('run').click();
			if (window.__benchFlush) await window.__benchFlush();
			const rows = document.querySelectorAll('tbody tr');
			if (rows.length !== 1000 || rows[0] === before) {
				throw new Error('update preparation did not rebuild the 1,000 rows');
			}
		});
	}
	await ensureState(page, op.pre);
}

// Returns the repeat count and every trial count it ran. The trials are replayed
// on the base page, so both pages run the identical operation sequence and their
// seeded data streams stay in step.
async function calibrate(page, op) {
	if (!REPEATABLE.has(op.name)) return { repeat: 1, trials: [] };
	const cap = MAX_REPEAT[op.name] ?? MAX_REPEAT.default;
	const trials = [];
	let repeat = parityFor(op, 2);
	for (let round = 0; round < 5; round++) {
		await prepare(page, op);
		const elapsed = await timeClick(page, op, selectorsFor(op, 1, repeat), repeat);
		trials.push(repeat);
		await sleep(30);
		if (elapsed >= SAMPLE_MS * 0.8 || repeat >= cap) break;
		repeat = parityFor(op, Math.min(cap, Math.ceil((repeat * SAMPLE_MS) / Math.max(elapsed, 0.1))));
	}
	return { repeat: Math.min(repeat, parityFor(op, cap)), trials };
}

async function replayCalibration(page, op, trials) {
	for (const repeat of trials) {
		await prepare(page, op);
		await timeClick(page, op, selectorsFor(op, 1, repeat), repeat);
		await sleep(30);
	}
}

async function timeFixture(fixture) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--js-flags=--expose-gc'],
	});
	try {
		const context = await browser.newContext();
		const pages = {};
		for (const side of SIDES) pages[side] = await openPage(context, fixture, side);
		for (const side of SIDES) {
			await onSide(side, async () => {
				await pages[side].bringToFront();
				for (let i = 0; i < WARMUP; i++) {
					await pages[side].evaluate(() => document.getElementById('run').click());
					await sleep(120);
					await pages[side].evaluate(() => document.getElementById('clear').click());
					await sleep(80);
				}
			});
		}

		const results = { base: {}, head: {} };
		for (const op of CANONICAL_OPS) {
			const { repeat, trials } = await onSide('head', async () => {
				await pages.head.bringToFront();
				return await calibrate(pages.head, op);
			});
			await onSide('base', async () => {
				await pages.base.bringToFront();
				await replayCalibration(pages.base, op, trials);
			});
			const samples = { base: [], head: [] };
			const sampleMs = { base: [], head: [] };
			for (let index = 0; index < PAIRS; index++) {
				const order = index % 2 === 0 ? SIDES : [...SIDES].reverse();
				const selectors = selectorsFor(op, index, repeat);
				for (const side of order) {
					await onSide(side, async () => {
						// The sampled page is the active one, so its frames keep running.
						await pages[side].bringToFront();
						await prepare(pages[side], op);
						const elapsed = await timeClick(pages[side], op, selectors, repeat);
						if (op.alternateClick) await verifySelection(pages[side], selectors.at(-1));
						samples[side].push(elapsed / repeat);
						sampleMs[side].push(elapsed);
						await sleep(30);
					});
				}
			}
			for (const side of SIDES) {
				// The whole sample's median duration shows whether the loop cleared the
				// timer floor.
				const sampleMedian = [...sampleMs[side]].sort((a, b) => a - b)[sampleMs[side].length >> 1];
				results[side][op.name] = {
					...timingStatForJson(summarizeSamples(samples[side])),
					repeat,
					sampleMs: sampleMedian,
				};
			}
			results.head[op.name].paired = pairedRatio(samples.base, samples.head);
			const { ratio, low, high } = results.head[op.name].paired;
			console.error(
				`  ${fixture.name} ${op.name.padEnd(11)} ×${String(repeat).padStart(4)} ${results.head[op.name].sampleMs.toFixed(1).padStart(6)}ms  ` +
					`head/base ${ratio.toFixed(3)} [${low.toFixed(3)}, ${high.toFixed(3)}]`,
			);
		}

		for (const side of SIDES) {
			await onSide(side, async () => {
				await pages[side].bringToFront();
				for (const operation of DIRECT_LIST_MOUNTS) {
					const work = await verifyDirectListMount(pages[side], operation);
					results[side][`live_inserts_${operation.name}`] = exact(work.liveParentInsertions);
					results[side][`fragment_commits_${operation.name}`] = exact(work.fragmentCommits);
				}
				if (pages[side].errors.length) throw new Error(pages[side].errors.join('; '));
			});
		}
		return results;
	} finally {
		await browser.close();
	}
}

// One operation's exact work: production-bundle calls and DOM mutations from
// the click through every task it schedules. Both sides run the identical
// operation sequence from a fresh, seeded page, so each count is reproducible.
async function countWork(fixture, side) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--js-flags=--jitless'],
	});
	try {
		const context = await browser.newContext();
		const page = await openPage(context, fixture, side);
		const cdp = await context.newCDPSession(page);
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: true,
			detailed: true,
			allowTriggeredUpdates: false,
		});
		const work = {};
		const breakdown = {};
		for (const op of CANONICAL_OPS) {
			await ensureState(page, op.pre);
			await page.evaluate(() => {
				const tally = { added: 0, removed: 0, attributes: 0, text: 0 };
				const count = (records) => {
					for (const record of records) {
						if (record.type === 'childList') {
							tally.added += record.addedNodes.length;
							tally.removed += record.removedNodes.length;
						} else if (record.type === 'attributes') tally.attributes++;
						else tally.text++;
					}
				};
				const observer = new MutationObserver(count);
				observer.observe(document, {
					subtree: true,
					childList: true,
					attributes: true,
					characterData: true,
				});
				window.__benchWork = { tally, count, observer };
			});
			await cdp.send('Profiler.takePreciseCoverage');
			await page.evaluate(async (selector) => {
				document.querySelector(selector).click();
				if (window.__benchFlush) await window.__benchFlush();
				// Let every task the operation scheduled run inside the window.
				await new Promise((resolve) => setTimeout(resolve, 50));
			}, op.click);
			const coverage = await cdp.send('Profiler.takePreciseCoverage');
			const dom = await page.evaluate(() => {
				const { tally, count, observer } = window.__benchWork;
				count(observer.takeRecords());
				observer.disconnect();
				return tally;
			});
			let calls = 0;
			for (const script of coverage.result) {
				if (!script.url.includes('/assets/')) continue;
				for (const fn of script.functions) calls += fn.ranges[0]?.count ?? 0;
			}
			if (calls === 0) throw new Error(`${op.name}: no production asset call coverage`);
			work[`calls_${op.name}`] = exact(calls);
			work[`dom_${op.name}`] = exact(dom.added + dom.removed + dom.attributes + dom.text);
			breakdown[op.name] = { calls, ...dom };
		}
		if (page.errors.length) throw new Error(page.errors.join('; '));
		return { work, breakdown };
	} finally {
		await browser.close();
	}
}

const payloads = Object.fromEntries(
	SIDES.map((side) => [
		side,
		{ suite: 'js-framework', iterations: PAIRS, mode: 'paired', targets: [] },
	]),
);
const servers = [];
let exitCode = 0;
try {
	if (!options['no-build']) for (const side of SIDES) build(side);
	for (const fixture of FIXTURES) {
		for (const side of SIDES) servers.push(await serve(side, fixture));
	}
	for (const fixture of FIXTURES) {
		console.error(`Pairing ${fixture.name} base/head × ${PAIRS}…`);
		const timing = options['work-only'] ? { base: {}, head: {} } : await timeFixture(fixture);
		for (const side of SIDES) {
			const { work, breakdown } = await onSide(side, () => countWork(fixture, side));
			payloads[side].targets.push({
				name: fixture.name,
				ops: { ...timing[side], ...work },
				meta: { work: breakdown },
			});
		}
	}
} catch (error) {
	const side = error instanceof SideError ? error.side : 'head';
	payloads[side].failed = error?.stack ?? String(error);
	payloads[side].harnessExit = 1;
	console.error(`PAIRED js-framework FAIL (${side}): ${payloads[side].failed}`);
	exitCode = 1;
} finally {
	for (const child of servers) {
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {
			/* already gone */
		}
	}
	for (const side of SIDES) {
		fs.mkdirSync(path.dirname(options[`${side}-json`]), { recursive: true });
		fs.writeFileSync(options[`${side}-json`], JSON.stringify(payloads[side], null, '\t') + '\n');
	}
}
process.exit(exitCode);
