// Deterministic mixed-inline-style work over the existing naive row fixtures.
// Chromium precise coverage observes production helpers without adding probes
// to authored components or changing the compiler's optimization input.

import fs from 'node:fs';
import { chromium } from 'playwright';

const DIALECT = process.env.WORK_DIALECT || 'tsrx';
if (DIALECT !== 'tsrx' && DIALECT !== 'jsx') {
	throw new Error(`Unsupported WORK_DIALECT ${JSON.stringify(DIALECT)}; expected "tsrx" or "jsx".`);
}

const TSRX = DIALECT === 'tsrx';
const URL = process.env.TARGET_URL || `http://localhost:${TSRX ? 5213 : 5214}/`;
const ROWS = 1000;
const METRICS = [
	'setStyle',
	'applyStyleValue',
	'applyStyleProperty',
	'setStyleProperty',
	'Row',
	'renderBlockInner',
];
const OPS = [
	{ name: 'mount_1k', setup: [], action: 'mount', writes: ROWS },
	{ name: 'select_one', setup: ['mount'], action: 'select4', writes: 1 },
	{ name: 'select_another', setup: ['mount', 'select4'], action: 'select5', writes: 2 },
	{ name: 'unrelated_update', setup: ['mount'], action: 'update', writes: 0 },
];

async function invoke(page, action) {
	await page.evaluate(async (next) => {
		if (next === 'mount') {
			document.getElementById('run').click();
		} else if (next === 'update') {
			document.getElementById('update').click();
		} else {
			const row = document.querySelectorAll('tbody tr')[next === 'select4' ? 4 : 5];
			row.querySelector('td:nth-child(2) a').click();
		}
		if (window.__benchFlush) await window.__benchFlush();
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
	if (counts.Row !== ROWS || counts.renderBlockInner === 0) {
		throw new Error(
			'Missing named production call coverage; rebuild with `vite build --minify false`.',
		);
	}
	return counts;
}

async function measure(browser, operation) {
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
		await page.goto(URL, { waitUntil: 'load' });
		await page.waitForSelector('#run', { timeout: 10_000 });
		for (const action of operation.setup) await invoke(page, action);
		await cdp.send('Profiler.takePreciseCoverage');

		const observed = await page.evaluate(
			async ({ action, staticStyle, expectedRows }) => {
				const before = Array.from(document.querySelectorAll('tbody tr'));
				const labels = before.map((row) => row.querySelector('td:nth-child(2)').textContent);
				const writes = { styleSets: 0, styleRemoves: 0, fontWeightWrites: 0, fontStyleWrites: 0 };
				const set = CSSStyleDeclaration.prototype.setProperty;
				const remove = CSSStyleDeclaration.prototype.removeProperty;
				CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
					writes.styleSets++;
					if (name === 'font-weight') writes.fontWeightWrites++;
					if (name === 'font-style') writes.fontStyleWrites++;
					return Reflect.apply(set, this, [name, value, priority]);
				};
				CSSStyleDeclaration.prototype.removeProperty = function (name) {
					writes.styleRemoves++;
					return Reflect.apply(remove, this, [name]);
				};
				try {
					if (action === 'mount') {
						document.getElementById('run').click();
					} else if (action === 'update') {
						document.getElementById('update').click();
					} else {
						const index = action === 'select4' ? 4 : 5;
						document.querySelectorAll('tbody tr')[index].querySelector('td:nth-child(2) a').click();
					}
					if (window.__benchFlush) await window.__benchFlush();
				} finally {
					CSSStyleDeclaration.prototype.setProperty = set;
					CSSStyleDeclaration.prototype.removeProperty = remove;
				}

				const rows = Array.from(document.querySelectorAll('tbody tr'));
				if (rows.length !== expectedRows) {
					throw new Error(`${action}: expected ${expectedRows} rows, received ${rows.length}.`);
				}
				if (before.length !== 0 && rows.some((row, index) => row !== before[index])) {
					throw new Error(`${action}: an untouched row lost its DOM identity.`);
				}

				for (let index = 0; index < rows.length; index++) {
					const row = rows[index];
					const cell = row.querySelector('td:last-child');
					const selected = row.classList.contains('danger');
					if (cell.style.fontWeight !== (selected ? 'bold' : 'normal')) {
						throw new Error(`${action}: row ${index} rendered the wrong font weight.`);
					}
					if (cell.style.fontStyle !== (staticStyle ? 'normal' : '')) {
						throw new Error(`${action}: row ${index} lost its static style declaration.`);
					}
					if (before.length !== 0) {
						const nextLabel = row.querySelector('td:nth-child(2)').textContent;
						const expectedLabel =
							action === 'update' && index % 10 === 0 ? labels[index] + ' !!!' : labels[index];
						if (nextLabel !== expectedLabel) {
							throw new Error(`${action}: row ${index} has an unexpected label.`);
						}
					}
				}

				const selected = rows.filter((row) => row.classList.contains('danger'));
				if (action.startsWith('select')) {
					const index = action === 'select4' ? 4 : 5;
					if (selected.length !== 1 || selected[0] !== rows[index]) {
						throw new Error(`${action}: row selection did not commit.`);
					}
				} else if (selected.length !== 0) {
					throw new Error(`${action}: an unexpected row remained selected.`);
				}
				return { rows: rows.length, selected: selected.length, ...writes };
			},
			{ action: operation.action, staticStyle: TSRX, expectedRows: ROWS },
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

const browser = await chromium.launch({
	headless: true,
	args: ['--no-sandbox', '--js-flags=--jitless'],
});
const results = {};
const failures = [];
try {
	for (const operation of OPS) {
		const counts = await measure(browser, operation);
		results[operation.name] = counts;
		const expected = {
			setStyle: TSRX ? 0 : ROWS,
			applyStyleValue: TSRX ? 0 : ROWS,
			applyStyleProperty: operation.writes,
			setStyleProperty: TSRX ? operation.writes : 0,
			Row: ROWS,
			renderBlockInner: TSRX ? 2001 : 3002,
			styleSets: operation.writes,
			styleRemoves: 0,
			fontWeightWrites: operation.writes,
			fontStyleWrites: 0,
			rows: ROWS,
			selected: operation.action.startsWith('select') ? 1 : 0,
		};
		for (const [metric, value] of Object.entries(expected)) {
			if (counts[metric] !== value) {
				failures.push(`${operation.name}.${metric}: ${counts[metric]} !== expected ${value}`);
			}
		}
	}
} finally {
	await browser.close();
}

console.log('Operation        | map | scalar | property | CSS writes | static writes | rows');
console.log('-----------------+-----+--------+----------+------------+---------------+-----');
for (const operation of OPS) {
	const count = results[operation.name];
	console.log(
		`${operation.name.padEnd(16)} | ${String(count.setStyle).padStart(3)} | ${String(count.setStyleProperty).padStart(6)} | ${String(count.applyStyleProperty).padStart(8)} | ${String(count.fontWeightWrites).padStart(10)} | ${String(count.fontStyleWrites).padStart(13)} | ${String(count.Row).padStart(4)}`,
	);
}

if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify(
			{ suite: 'js-framework-style-work', dialect: DIALECT, target: URL, results, failures },
			null,
			'\t',
		) + '\n',
	);
}

if (failures.length !== 0) {
	console.error(`\n${failures.length} deterministic inline-style work gate failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\nAll deterministic inline-style work gates passed.');
