// UIbench desktop workload harness. The public case names and dimensions come
// from localvoid/uibench-base; the fixtures and deterministic model are fresh
// implementations because upstream does not ship usable license text.
//
// Correctness is a precondition for every timing:
//   - all 96 case endpoints are serialized from the live DOM and compared with
//     the independent shared model;
//   - keyed survivors must retain DOM identity for every transition;
//   - Octane, React, Preact, and Solid must render the same semantic signatures and
//     element counts (framework marker comments are deliberately outside the
//     oracle).
//
// Servers must be running first (production preview recommended):
//   pnpm --filter octane-tsrx-uibench-bench preview  # :5315
//   pnpm --filter react-uibench-bench preview        # :5316
//   pnpm --filter solid-uibench-bench preview        # :5317
//   pnpm --filter preact-uibench-bench preview       # :5318
//
// Usage: node run.mjs [iterations]
// Env: TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5315/"}]'
//      BENCH_JSON=/path/out.json

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CASES, elementCount, modelSignature } from './shared/workloads.js';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

const ITERATIONS = Number.parseInt(process.argv[2] || '10', 10);
if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1) {
	throw new Error(`iterations must be a positive integer, received ${process.argv[2]}`);
}
const WARMUP = ITERATIONS >= 5 ? 2 : 1;

function repetitionsFor(name) {
	if (name.startsWith('anim/')) return 64;
	if (name.endsWith('/no_change')) return name.includes('[10,10,10,10]') ? 1 : 4;
	if (name.includes('/[2,2,2,2,2,2,2,2,2,2]/')) return 2;
	if (name.endsWith('/render') || name.endsWith('/removeAll')) {
		return name.startsWith('table/') ? 8 : 4;
	}
	if (name.includes('worst_case')) return 16;
	return 32;
}

const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5315/' },
			{ name: 'react', url: 'http://localhost:5316/' },
			{ name: 'solid', url: 'http://localhost:5317/' },
			{ name: 'preact', url: 'http://localhost:5318/' },
		];

const EXPECTED = new Map(
	CASES.map((entry) => [
		entry.name,
		{
			signature: modelSignature(entry.after),
			elements: elementCount(entry.after),
		},
	]),
);

function writePayload(payload) {
	if (!process.env.BENCH_JSON) return;
	const file = resolve(process.env.BENCH_JSON);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

async function seedRandom(page) {
	await page.evaluate(() => {
		let state = 0x51be11 >>> 0;
		Math.random = () => {
			state = (state + 0x6d2b79f5) | 0;
			let value = Math.imul(state ^ (state >>> 15), 1 | state);
			value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
			return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
		};
	});
}

async function gateTarget(page) {
	return page.evaluate(
		async (names) => {
			const root = document.getElementById('main');
			if (root === null) throw new Error('missing #main');

			const semanticItems = () => {
				const view = root.firstElementChild;
				if (view === null) return [];
				if (view.dataset.kind === 'table') return [...view.querySelectorAll('tbody > tr')];
				if (view.dataset.kind === 'anim') return [...view.querySelectorAll(':scope > .box')];
				return [...view.querySelectorAll('li')];
			};

			const signature = () => {
				const view = root.firstElementChild;
				if (view === null) throw new Error('fixture rendered no view');
				if (view.dataset.kind === 'table') {
					return [
						'table',
						...[...view.querySelectorAll('tbody > tr')].map((row) =>
							[
								row.dataset.id,
								row.getAttribute('class'),
								...[...row.querySelectorAll('td')].map((cell) => cell.textContent),
							].join('|'),
						),
					].join('\n');
				}
				if (view.dataset.kind === 'anim') {
					return [
						'anim',
						...[...view.querySelectorAll(':scope > .box')].map(
							(box) => `${box.dataset.id}|${box.style.transform}`,
						),
					].join('\n');
				}

				const lines = ['tree'];
				const visit = (list, depth) => {
					for (const item of list.children) {
						if (item.localName !== 'li') continue;
						const label = [...item.children].find((child) => child.localName === 'span');
						lines.push(
							`${depth}|${item.dataset.id}|${item.getAttribute('class')}|${label.textContent}`,
						);
						const children = [...item.children].find((child) => child.localName === 'ul');
						if (children) visit(children, depth + 1);
					}
				};
				visit(view, 0);
				return lines.join('\n');
			};

			const results = [];
			for (const name of names) {
				const prepared = window.__prepare(name);
				if (prepared && typeof prepared.then === 'function') await prepared;
				const before = new Map(semanticItems().map((element) => [element.dataset.id, element]));
				const committed = window.__run(name);
				if (committed && typeof committed.then === 'function') await committed;
				const after = semanticItems();
				let identityShared = 0;
				let identityBroken = 0;
				for (const element of after) {
					const previous = before.get(element.dataset.id);
					if (previous === undefined) continue;
					identityShared++;
					if (previous !== element) identityBroken++;
				}
				const view = root.firstElementChild;
				results.push({
					name,
					signature: signature(),
					elements: view === null ? 0 : 1 + view.querySelectorAll('*').length,
					identityShared,
					identityBroken,
				});
			}
			return results;
		},
		CASES.map((entry) => entry.name),
	);
}

async function timeCase(page, name) {
	const repetitions = repetitionsFor(name);
	return page.evaluate(
		async ({ caseName, iterations, repetitionsPerSample, warmup }) => {
			const settle = () => new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
			for (let index = 0; index < warmup; index++) {
				for (let repeat = 0; repeat < repetitionsPerSample; repeat++) {
					const prepared = window.__prepare(caseName);
					if (prepared && typeof prepared.then === 'function') await prepared;
					const committed = window.__run(caseName);
					if (committed && typeof committed.then === 'function') await committed;
				}
			}

			const samples = [];
			for (let index = 0; index < iterations; index++) {
				const initial = window.__prepare(caseName);
				if (initial && typeof initial.then === 'function') await initial;
				await settle();
				if (typeof gc === 'function') gc();
				let elapsed = 0;
				for (let repeat = 0; repeat < repetitionsPerSample; repeat++) {
					if (repeat > 0) {
						const prepared = window.__prepare(caseName);
						if (prepared && typeof prepared.then === 'function') await prepared;
					}
					const start = performance.now();
					const committed = window.__run(caseName);
					if (committed && typeof committed.then === 'function') await committed;
					elapsed += performance.now() - start;
				}
				samples.push(elapsed / repetitionsPerSample);
			}
			return samples;
		},
		{
			caseName: name,
			iterations: ITERATIONS,
			repetitionsPerSample: repetitions,
			warmup: WARMUP,
		},
	);
}

async function runTarget(browser, target) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const browserErrors = [];
	page.on('pageerror', (error) => browserErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') browserErrors.push(message.text());
	});

	try {
		await page.goto(target.url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true);
		const isolated = await page.evaluate(() => window.crossOriginIsolated);
		if (!isolated)
			throw new Error(`${target.name} is not cross-origin isolated; timer precision is unsafe`);
		await seedRandom(page);
		await page.evaluate(() => window.__mount());

		const gates = await gateTarget(page);
		let identityShared = 0;
		let maxElements = 0;
		for (const result of gates) {
			const expected = EXPECTED.get(result.name);
			if (result.signature !== expected.signature) {
				throw new Error(`${target.name} semantic mismatch in ${result.name}`);
			}
			if (result.elements !== expected.elements) {
				throw new Error(
					`${target.name} element mismatch in ${result.name}: ${result.elements} != ${expected.elements}`,
				);
			}
			if (result.identityBroken !== 0) {
				throw new Error(
					`${target.name} replaced ${result.identityBroken}/${result.identityShared} keyed survivors in ${result.name}`,
				);
			}
			identityShared += result.identityShared;
			maxElements = Math.max(maxElements, result.elements);
		}

		if (browserErrors.length > 0) {
			throw new Error(`${target.name} browser errors: ${browserErrors.join(' | ')}`);
		}

		const ops = {};
		for (const entry of CASES) {
			const samples = await timeCase(page, entry.name);
			ops[entry.name] = timingStatForJson(summarizeSamples(samples));
		}
		ops.cases = deterministicStatForJson(deterministicCount(CASES.length));
		ops.elements_largest = deterministicStatForJson(deterministicCount(maxElements));
		ops.identity_shared = deterministicStatForJson(deterministicCount(identityShared));

		return {
			name: target.name,
			ops,
			meta: {
				caseCount: CASES.length,
				maxElements,
				identityShared,
				measurement: 'mean forward-commit latency from a case-sized inner batch',
				correctnessGate: 'passed',
			},
		};
	} finally {
		await context.close();
	}
}

function printResults(targets) {
	const rows = CASES.map((entry) => {
		const row = { case: entry.name };
		for (const target of targets) row[target.name] = scoreOf(target.ops[entry.name])?.toFixed(3);
		if (targets.length > 1) {
			const left = scoreOf(targets[0].ops[entry.name]);
			for (const reference of targets.slice(1)) {
				const right = scoreOf(reference.ops[entry.name]);
				row[`${targets[0].name}/${reference.name}`] = (left / right).toFixed(2);
			}
		}
		return row;
	});
	console.log(
		`\nUIbench desktop matrix (${ITERATIONS} samples, mean milliseconds per forward commit; ${CASES.length} cases)`,
	);
	console.table(rows);
}

let browser;
try {
	browser = await chromium.launch({
		headless: true,
		args: ['--js-flags=--expose-gc'],
	});
	const results = [];
	for (const target of TARGETS) results.push(await runTarget(browser, target));
	printResults(results);
	writePayload({ suite: 'uibench', iterations: ITERATIONS, targets: results });
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	console.error(message);
	writePayload({ suite: 'uibench', iterations: ITERATIONS, targets: [], failed: message });
	process.exitCode = 1;
} finally {
	if (browser) await browser.close();
}
