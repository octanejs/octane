// Production browser work for top-level implicit de-opt list keys. Run through
// style-work.mjs with WORK_MODE=unkeyed; no new benchmark suite is registered.
// The fixture's pure-host descriptors reach scopedDeoptKey only because the
// list is handed through a compiled child hole.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, 'octane-tsrx', 'dist', 'unkeyed-work', 'assets');
const URL = process.env.TARGET_URL || 'http://localhost:5316/unkeyed-work.html';
const ROWS = 1000;
const ITEMS = ROWS + 1; // one explicit key="0" beside the 1,000 implicit indices
const METRICS = ['scopedDeoptKey', 'deoptItemBody', 'reconcileKeyed'];

function sourceWork() {
	const sources = fs
		.readdirSync(ASSETS)
		.filter((name) => name.endsWith('.js'))
		.map((name) => fs.readFileSync(path.join(ASSETS, name), 'utf8'));
	const matches = sources.flatMap((source) => {
		const start = source.indexOf('function scopedDeoptKey(');
		if (start < 0) return [];
		const end = source.indexOf('\n}', start);
		if (end < 0) throw new Error('could not identify scopedDeoptKey in production output');
		return [source.slice(start, end + 2)];
	});
	if (matches.length !== 1) {
		throw new Error(`expected one readable production scopedDeoptKey, found ${matches.length}`);
	}
	const body = matches[0];
	const oldBranch =
		/if \(path\.length === 0\) return explicit \? ["']k["'] \+ String\(key\) : ["']i["'] \+ index;/.test(
			body,
		);
	const numericBranch =
		/if \(path\.length === 0\) return explicit \? ["']k["'] \+ String\(key\) : index;/.test(body);
	if (!oldBranch && !numericBranch) {
		throw new Error('top-level implicit-key branch changed; review the source work gate');
	}
	return {
		implicitKeyStringConversionsPerRender: oldBranch ? ROWS : 0,
		implicitKeyNumeric: numericBranch,
	};
}

function countCalls(coverage) {
	const counts = Object.fromEntries(METRICS.map((name) => [name, 0]));
	for (const script of coverage.result) {
		if (!script.url.includes('/assets/')) continue;
		for (const fn of script.functions) {
			if (Object.hasOwn(counts, fn.functionName)) {
				counts[fn.functionName] += fn.ranges[0]?.count ?? 0;
			}
		}
	}
	return counts;
}

async function invoke(page, operation) {
	await page.evaluate((name) => window.__unkeyedWork(name), operation);
}

async function verify(page, version, preserve) {
	return page.evaluate(
		({ count, version, preserve }) => {
			const list = document.querySelector('#unkeyed-work-rows');
			if (list?.getAttribute('data-version') !== String(version)) {
				throw new Error(`expected visible version ${version}`);
			}
			const rows = Array.from(list.children);
			if (rows.length !== count + 1)
				throw new Error(`expected ${count + 1} rows, got ${rows.length}`);
			for (let index = 0; index < count; index++) {
				const row = rows[index === 0 ? 0 : index + 1];
				if (row.getAttribute('data-work-index') !== String(index)) {
					throw new Error(`unkeyed row ${index} has incorrect content or order`);
				}
				if (!preserve && row.querySelector('input')?.value !== String(index)) {
					throw new Error(`unkeyed row ${index} has incorrect initial input value`);
				}
			}
			const plain = rows[0].querySelector('input');
			const explicit = rows[1].querySelector('input');
			if (rows[1].getAttribute('data-work-index') !== 'explicit' || plain === explicit) {
				throw new Error('implicit index zero and explicit key "0" were conflated');
			}
			if (!preserve) {
				if (explicit.value !== 'explicit') throw new Error('explicit row has wrong initial input');
				window.__unkeyedRowsBefore = rows;
				window.__unkeyedPlainBefore = plain;
				window.__unkeyedExplicitBefore = explicit;
				plain.value = 'typed plain';
				explicit.value = 'typed explicit';
				plain.focus();
			} else {
				if (rows.some((row, index) => row !== window.__unkeyedRowsBefore[index])) {
					throw new Error('an unchanged unkeyed row lost DOM identity');
				}
				if (plain !== window.__unkeyedPlainBefore || explicit !== window.__unkeyedExplicitBefore) {
					throw new Error('implicit or explicit input lost DOM identity');
				}
				if (plain.value !== 'typed plain' || explicit.value !== 'typed explicit') {
					throw new Error('uncontrolled input state was reset');
				}
				if (document.activeElement !== plain) throw new Error('focused input was replaced');
			}
			return { rows: rows.length, preserved: preserve ? rows.length : 0 };
		},
		{ count: ROWS, version, preserve },
	);
}

async function measure(browser, operation) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const cdp = await context.newCDPSession(page);
	let profiling = false;
	try {
		await page.goto(URL, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: true,
			detailed: true,
			allowTriggeredUpdates: false,
		});
		profiling = true;
		if (operation === 'update') {
			await invoke(page, 'mount');
			await verify(page, 0, false);
		}
		await cdp.send('Profiler.takePreciseCoverage');
		await invoke(page, operation === 'update' ? 'update' : 'mount');
		const coverage = await cdp.send('Profiler.takePreciseCoverage');
		const counts = countCalls(coverage);
		const visible = await verify(page, operation === 'update' ? 1 : 0, operation === 'update');
		if (errors.length !== 0) throw new Error(`browser errors: ${errors.join('; ')}`);
		await invoke(page, 'unmount');
		return { ...counts, ...visible };
	} finally {
		if (profiling) {
			await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await cdp.send('Profiler.disable').catch(() => {});
		}
		await context.close();
	}
}

const source = sourceWork();
const browser = await chromium.launch({
	headless: true,
	args: ['--no-sandbox', '--js-flags=--jitless'],
});
const results = {};
const failures = [];
try {
	for (const operation of ['mount', 'update']) {
		const observed = await measure(browser, operation);
		results[operation] = observed;
		for (const [metric, expected] of Object.entries({
			scopedDeoptKey: ITEMS,
			deoptItemBody: ITEMS,
			reconcileKeyed: operation === 'update' ? 1 : 0,
			rows: ITEMS,
			preserved: operation === 'update' ? ITEMS : 0,
		})) {
			if (observed[metric] !== expected) {
				failures.push(`${operation}.${metric}: ${observed[metric]} !== ${expected}`);
			}
		}
	}
} finally {
	await browser.close();
}

if (process.env.WORK_REQUIRE_NUMERIC === '1' && !source.implicitKeyNumeric) {
	failures.push('top-level implicit keys still use strings, expected numeric indices');
}
console.log(
	JSON.stringify({ suite: 'js-framework-style-work/unkeyed', source, results, failures }, null, 2),
);
if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify(
			{ suite: 'js-framework-style-work/unkeyed', source, results, failures },
			null,
			'\t',
		) + '\n',
	);
}
if (failures.length !== 0) {
	for (const failure of failures) console.error(`- ${failure}`);
	process.exitCode = 1;
}
