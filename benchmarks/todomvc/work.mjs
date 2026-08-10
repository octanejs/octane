// Deterministic production work for the existing TodoMVC application.
// Chromium coverage observes its original filter predicates without wrapping
// Array.prototype or adding source probes that could invalidate provenance.

import fs from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.TARGET_URL || 'http://localhost:5240/';
const TODOS = 100;
const COMPLETED = 25;
const ACTIVE = TODOS - COMPLETED;
const METRICS = ['TodoApp', 'setCheckedCheckable', 'setClassAttr', 'setText'];
const OPS = [
	{
		name: 'edit_start',
		exact: {
			TodoApp: 1,
			filterPredicates: 0,
			filterClassWrites: 0,
			setCheckedCheckable: ACTIVE + 1,
			setClassAttr: ACTIVE,
			setText: 0,
		},
	},
	{
		name: 'edit_cancel',
		exact: {
			TodoApp: 1,
			filterPredicates: 0,
			filterClassWrites: 0,
			setCheckedCheckable: ACTIVE + 1,
			setClassAttr: ACTIVE,
			setText: 0,
		},
	},
	{
		name: 'filter_completed',
		exact: {
			TodoApp: 1,
			filterPredicates: TODOS,
			filterClassWrites: 2,
			setCheckedCheckable: COMPLETED + 1,
			setClassAttr: COMPLETED + 2,
			setText: 0,
		},
	},
	{
		name: 'toggle_active',
		exact: {
			TodoApp: 1,
			filterPredicates: TODOS * 2,
			filterClassWrites: 0,
			setCheckedCheckable: 1,
			setClassAttr: 0,
			setText: 1,
		},
	},
];

async function countCalls(cdp, coverage) {
	const counts = Object.fromEntries(METRICS.map((name) => [name, 0]));
	counts.filterPredicates = 0;
	for (const script of coverage.result) {
		if (!script.url.includes('/assets/')) continue;
		let source;
		for (const fn of script.functions) {
			const range = fn.ranges[0];
			if (!range?.count) continue;
			if (Object.prototype.hasOwnProperty.call(counts, fn.functionName)) {
				counts[fn.functionName] += range.count;
				continue;
			}
			if (fn.functionName !== '') continue;
			source ??= (await cdp.send('Debugger.getScriptSource', { scriptId: script.scriptId }))
				.scriptSource;
			const body = source.slice(range.startOffset, range.endOffset);
			if (/^\(?([\w$]+)\)?\s*=>\s*!?\1\.completed$/.test(body)) {
				counts.filterPredicates += range.count;
			}
		}
	}
	if (counts.TodoApp !== 1) {
		throw new Error('Missing named production call coverage; rebuild with vite --minify false.');
	}
	return counts;
}

async function prepare(page, operation) {
	await page.goto(URL, { waitUntil: 'load' });
	await page.waitForSelector('.new-todo', { timeout: 10_000 });
	await page.evaluate(
		({ name, total, completed }) => {
			const input = document.querySelector('.new-todo');
			for (let index = 0; index < total; index++) {
				input.value = 'Todo ' + index;
				input.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
				);
			}
			const toggles = [...document.querySelectorAll('.todo-list .toggle')];
			for (let index = 0; index < completed; index++) toggles[index * 4].click();
			document.querySelector('.filters [data-filter="active"]').click();
			if (document.querySelectorAll('.todo-list li').length !== total - completed) {
				throw new Error('Expected the active TodoMVC list.');
			}
			if (name === 'edit_cancel') {
				document
					.querySelector('.todo-list li label')
					.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
				document.querySelector('.edit').value = 'Uncommitted edit';
			}
		},
		{ name: operation.name, total: TODOS, completed: COMPLETED },
	);
}

async function measure(browser, operation) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	let profiling = false;
	try {
		await cdp.send('Debugger.enable');
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: true,
			detailed: true,
			allowTriggeredUpdates: false,
		});
		profiling = true;
		await prepare(page, operation);
		await cdp.send('Profiler.takePreciseCoverage');
		const observed = await page.evaluate(
			({ name, active, completed }) => {
				const previous = [...document.querySelectorAll('.todo-list li')];
				const labels = new Map(
					previous.map((row) => [row, row.querySelector('label').textContent]),
				);
				const filterObserver = new MutationObserver(() => {});
				filterObserver.observe(document.querySelector('.filters'), {
					attributes: true,
					attributeFilter: ['class'],
					subtree: true,
				});
				try {
					if (name === 'edit_start') {
						// Controlled values must be restored even when all derived inputs hold.
						document.querySelector('.toggle-all').checked = true;
						previous[0].querySelector('.toggle').checked = true;
						previous[0]
							.querySelector('label')
							.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
					} else if (name === 'edit_cancel') {
						document
							.querySelector('.edit')
							.dispatchEvent(
								new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
							);
					} else if (name === 'filter_completed') {
						document.querySelector('.filters [data-filter="completed"]').click();
					} else {
						previous[0].querySelector('.toggle').click();
					}

					const rows = [...document.querySelectorAll('.todo-list li')];
					const nextFilter = name === 'filter_completed' ? 'completed' : 'active';
					const count =
						name === 'filter_completed' ? completed : active - Number(name === 'toggle_active');
					if (rows.length !== count) throw new Error(`Expected ${count} rows, got ${rows.length}.`);
					if (document.querySelector('.filters a.selected')?.dataset.filter !== nextFilter) {
						throw new Error('The selected filter does not match the interaction.');
					}
					const expectedRemaining = active - Number(name === 'toggle_active');
					if (
						document.querySelector('.todo-count strong').textContent !== String(expectedRemaining)
					) {
						throw new Error('The remaining-todo count did not update.');
					}
					if (document.querySelector('.toggle-all').checked) {
						throw new Error('The controlled toggle-all checkbox was not restored.');
					}
					if (name === 'edit_start') {
						if (document.querySelector('.edit')?.value !== labels.get(previous[0])) {
							throw new Error('The uncontrolled editor did not receive its original title.');
						}
						if (rows[0].querySelector('.toggle').checked) {
							throw new Error('The controlled todo checkbox was not restored.');
						}
					} else if (document.querySelector('.edit') !== null) {
						throw new Error('An obsolete editor survived the interaction.');
					}
					for (const row of rows) {
						if (name !== 'filter_completed' && !labels.has(row)) {
							throw new Error('A surviving todo lost its keyed DOM identity.');
						}
						if (labels.has(row) && row.querySelector('label').textContent !== labels.get(row)) {
							throw new Error('An unchanged todo title was rewritten.');
						}
						if (row.classList.contains('completed') !== (nextFilter === 'completed')) {
							throw new Error('A todo does not match the selected filter.');
						}
					}
					return { filterClassWrites: filterObserver.takeRecords().length, rows: rows.length };
				} finally {
					filterObserver.disconnect();
				}
			},
			{ name: operation.name, active: ACTIVE, completed: COMPLETED },
		);
		const coverage = await cdp.send('Profiler.takePreciseCoverage');
		return { ...(await countCalls(cdp, coverage)), ...observed };
	} finally {
		if (profiling) {
			await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await cdp.send('Profiler.disable').catch(() => {});
		}
		await cdp.send('Debugger.disable').catch(() => {});
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
		for (const [metric, expected] of Object.entries(operation.exact)) {
			if (counts[metric] !== expected) {
				failures.push(`${operation.name}.${metric}: ${counts[metric]} !== ${expected}`);
			}
		}
	}
} finally {
	await browser.close();
}

console.log('Operation        | predicates | filter writes | checked | classes | text | rows');
console.log('-----------------+------------+---------------+---------+---------+------+-----');
for (const operation of OPS) {
	const count = results[operation.name];
	console.log(
		`${operation.name.padEnd(16)} | ${String(count.filterPredicates).padStart(10)} | ${String(count.filterClassWrites).padStart(13)} | ${String(count.setCheckedCheckable).padStart(7)} | ${String(count.setClassAttr).padStart(7)} | ${String(count.setText).padStart(4)} | ${String(count.rows).padStart(4)}`,
	);
}

if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify({ suite: 'todomvc-work', target: URL, results, failures }, null, '\t') + '\n',
	);
}

if (failures.length > 0) {
	console.error(`\n${failures.length} deterministic work gate failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\nAll deterministic TodoMVC work gates passed.');
