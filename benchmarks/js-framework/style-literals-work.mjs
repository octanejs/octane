// Isolated production work gate for one-property, multi-property, and generic
// inline style objects. The ordinary js-framework fixture remains unchanged.

import fs from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.TARGET_URL || 'http://127.0.0.1:5233/style-literals.html';
const ROWS = 1000;
const OPTIMIZED_MULTI = process.env.WORK_EXPECT_MULTI_OPTIMIZED !== '0';
const TIMING_SAMPLES = Number(process.env.WORK_SAMPLES || 0);
const MODES = ['single', 'multi', 'generic', 'interleaved'];
const OPS = [
	{ name: 'mount_1k', setup: [], action: 'mount', changedRows: ROWS },
	{ name: 'select_one', setup: ['mount'], action: 'select4', changedRows: 1 },
	{ name: 'select_another', setup: ['mount', 'select4'], action: 'select5', changedRows: 2 },
	{ name: 'unrelated_update', setup: ['mount'], action: 'update', changedRows: 0 },
];
const METRICS = [
	'setStyle',
	'setStyleProperty',
	'setStyleProperties',
	'applyStyleValue',
	'applyStyleProperty',
	'SingleRow',
	'MultiRow',
	'GenericRow',
	'InterleavedRow',
];

async function invoke(page, action) {
	await page.evaluate(async (next) => {
		if (next === 'mount') document.getElementById('run').click();
		else if (next === 'update') document.getElementById('update').click();
		else document.querySelectorAll('tbody tr')[next === 'select4' ? 4 : 5].click();
		await window.__benchFlush();
	}, action);
}

function countCalls(coverage) {
	const counts = Object.fromEntries(METRICS.map((name) => [name, 0]));
	for (const script of coverage.result) {
		if (!script.url.includes('/assets/')) continue;
		for (const fn of script.functions) {
			if (Object.prototype.hasOwnProperty.call(counts, fn.functionName)) {
				counts[fn.functionName] += fn.ranges[0]?.count ?? 0;
			}
		}
	}
	return counts;
}

async function measure(browser, mode, operation) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	let profiling = false;
	try {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: true,
			detailed: true,
			allowTriggeredUpdates: false,
		});
		profiling = true;
		await page.goto(`${URL}?case=${mode}`, { waitUntil: 'load' });
		await page.waitForSelector('#run');
		for (const action of operation.setup) await invoke(page, action);
		await cdp.send('Profiler.takePreciseCoverage');

		const observed = await page.evaluate(
			async ({ action, mode, expectedRows }) => {
				const before = Array.from(document.querySelectorAll('tbody tr'));
				const writes = { styleSets: 0, styleRemoves: 0, fontStyleWrites: 0 };
				const set = CSSStyleDeclaration.prototype.setProperty;
				const remove = CSSStyleDeclaration.prototype.removeProperty;
				CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
					writes.styleSets++;
					if (name === 'font-style') writes.fontStyleWrites++;
					return Reflect.apply(set, this, [name, value, priority]);
				};
				CSSStyleDeclaration.prototype.removeProperty = function (name) {
					writes.styleRemoves++;
					return Reflect.apply(remove, this, [name]);
				};
				try {
					if (action === 'mount') document.getElementById('run').click();
					else if (action === 'update') document.getElementById('update').click();
					else document.querySelectorAll('tbody tr')[action === 'select4' ? 4 : 5].click();
					await window.__benchFlush();
				} finally {
					CSSStyleDeclaration.prototype.setProperty = set;
					CSSStyleDeclaration.prototype.removeProperty = remove;
				}
				const rows = Array.from(document.querySelectorAll('tbody tr'));
				if (rows.length !== expectedRows) {
					throw new Error(`${action}: expected ${expectedRows} rows, received ${rows.length}`);
				}
				if (before.length !== 0 && rows.some((row, index) => row !== before[index])) {
					throw new Error(`${action}: a surviving row lost DOM identity`);
				}
				const expectedSelection = action === 'select4' ? 4 : action === 'select5' ? 5 : -1;
				for (let index = 0; index < rows.length; index++) {
					const row = rows[index];
					const cell = row.firstElementChild;
					const selected = index === expectedSelection;
					if (
						row.classList.contains('selected') !== selected ||
						cell.textContent !== String(index)
					) {
						throw new Error(`${action}: row ${index} selection or label differs`);
					}
					if (mode === 'interleaved') {
						if (
							cell.style.left !== (selected ? '8px' : '0px') ||
							cell.style.display !== 'block' ||
							cell.style.right !== (selected ? '4px' : '0px') ||
							cell.style.opacity !== '0.5' ||
							Array.from(cell.style).join(',') !== 'left,display,right,opacity'
						) {
							throw new Error(`${action}: row ${index} lost an interleaved declaration`);
						}
					} else {
						if (
							cell.style.fontStyle !== 'normal' ||
							cell.style.fontWeight !== (selected ? 'bold' : 'normal')
						) {
							throw new Error(`${action}: row ${index} lost its inline style`);
						}
						if (mode !== 'single' && cell.style.color !== (selected ? 'red' : 'black')) {
							throw new Error(`${action}: row ${index} has the wrong color`);
						}
					}
				}
				return { rows: rows.length, ...writes };
			},
			{ action: operation.action, mode, expectedRows: ROWS },
		);
		return { ...countCalls(await cdp.send('Profiler.takePreciseCoverage')), ...observed };
	} finally {
		if (profiling) {
			await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await cdp.send('Profiler.disable').catch(() => {});
		}
		await context.close();
	}
}

function expected(mode, operation) {
	const changes = operation.changedRows;
	const properties = mode === 'single' ? 1 : mode === 'interleaved' ? 3 : 2;
	const changing = mode === 'interleaved' ? 2 : properties;
	const generic =
		mode === 'generic' || ((mode === 'multi' || mode === 'interleaved') && !OPTIMIZED_MULTI);
	return {
		setStyle: generic ? ROWS : 0,
		setStyleProperty:
			mode === 'single'
				? changes
				: !generic && operation.action !== 'mount'
					? changes * changing
					: 0,
		setStyleProperties:
			(mode === 'multi' || mode === 'interleaved') &&
			OPTIMIZED_MULTI &&
			operation.action === 'mount'
				? ROWS
				: 0,
		applyStyleValue: generic ? ROWS : 0,
		applyStyleProperty:
			operation.action === 'mount'
				? ROWS * (mode === 'interleaved' ? 4 : generic ? properties + 1 : properties)
				: changes * changing,
		styleSets:
			operation.action === 'mount'
				? ROWS * (mode === 'interleaved' ? 4 : generic ? properties + 1 : properties)
				: changes * changing,
		styleRemoves: 0,
		fontStyleWrites: generic && mode !== 'interleaved' && operation.action === 'mount' ? ROWS : 0,
		rows: ROWS,
	};
}

async function sampleTiming(browser, mode, operation) {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		await page.goto(`${URL}?case=${mode}`, { waitUntil: 'load' });
		await page.waitForSelector('#run');
		for (const action of operation.setup) await invoke(page, action);
		return await page.evaluate(async (action) => {
			const start = performance.now();
			if (action === 'mount') document.getElementById('run').click();
			else if (action === 'update') document.getElementById('update').click();
			else document.querySelectorAll('tbody tr')[action === 'select4' ? 4 : 5].click();
			await window.__benchFlush();
			return performance.now() - start;
		}, operation.action);
	} finally {
		await context.close();
	}
}

async function measureTiming() {
	if (!Number.isSafeInteger(TIMING_SAMPLES) || TIMING_SAMPLES < 0) {
		throw new Error('WORK_SAMPLES must be a nonnegative integer');
	}
	if (TIMING_SAMPLES === 0) return null;
	const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	const timing = {};
	try {
		for (const mode of MODES) {
			timing[mode] = {};
			for (const operation of OPS) {
				// Browser warmup is separate from measured trials; no profiler or CSSOM
				// instrumentation runs in these browser contexts.
				await sampleTiming(browser, mode, operation);
				await sampleTiming(browser, mode, operation);
				const samples = [];
				for (let i = 0; i < TIMING_SAMPLES; i++) {
					samples.push(await sampleTiming(browser, mode, operation));
				}
				samples.sort((a, b) => a - b);
				const quantile = (fraction) => samples[Math.floor(fraction * (samples.length - 1))];
				timing[mode][operation.name] = {
					medianMs: quantile(0.5),
					p25Ms: quantile(0.25),
					p75Ms: quantile(0.75),
					samplesMs: samples,
				};
			}
		}
	} finally {
		await browser.close();
	}
	return timing;
}

const browser = await chromium.launch({
	headless: true,
	args: ['--no-sandbox', '--js-flags=--jitless'],
});
const results = {};
const failures = [];
try {
	for (const mode of MODES) {
		results[mode] = {};
		for (const operation of OPS) {
			const counts = await measure(browser, mode, operation);
			results[mode][operation.name] = counts;
			for (const [metric, value] of Object.entries(expected(mode, operation))) {
				if (counts[metric] !== value) {
					failures.push(
						`${mode}.${operation.name}.${metric}: ${counts[metric]} !== expected ${value}`,
					);
				}
			}
			const rowName = `${mode[0].toUpperCase()}${mode.slice(1)}Row`;
			if (counts[rowName] !== ROWS) {
				failures.push(`${mode}.${operation.name}.${rowName}: ${counts[rowName]} !== ${ROWS}`);
			}
		}
	}
} finally {
	await browser.close();
}

const timing = failures.length === 0 ? await measureTiming() : null;

console.log('case    operation        map grouped scalar CSS writes fixed writes rows');
for (const mode of MODES) {
	for (const operation of OPS) {
		const r = results[mode][operation.name];
		console.log(
			`${mode.padEnd(7)} ${operation.name.padEnd(16)} ${String(r.setStyle).padStart(4)} ` +
				`${String(r.setStyleProperties).padStart(7)} ${String(r.setStyleProperty).padStart(6)} ` +
				`${String(r.styleSets).padStart(10)} ${String(r.fontStyleWrites).padStart(12)} ${r.rows}`,
		);
	}
}
if (timing !== null) {
	console.log('\nUninstrumented timing (median ms [p25, p75]):');
	for (const mode of MODES) {
		for (const operation of OPS) {
			const t = timing[mode][operation.name];
			console.log(
				`${mode.padEnd(7)} ${operation.name.padEnd(16)} ` +
					`${t.medianMs.toFixed(2)} [${t.p25Ms.toFixed(2)}, ${t.p75Ms.toFixed(2)}]`,
			);
		}
	}
}
if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify({ suite: 'style-literals-work', results, timing, failures }, null, '\t') + '\n',
	);
}
if (failures.length !== 0) {
	console.error(`\n${failures.length} inline style work gate failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('\nAll inline style literal work gates passed.');
