import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import {
	CANONICAL_OPS,
	calibrate,
	prepare,
	selectorsFor,
	timeClick,
	verifySelection,
} from './operations.mjs';
import { timeSample } from './run-reorder.mjs';

async function tableFixture(browser, asyncCommit) {
	const page = await browser.newPage();
	await page.setContent(`
<button id="run">Run</button><button id="runlots">Run lots</button>
<button id="clear">Clear</button><button id="update">Update</button>
<button id="swaprows">Swap</button><table><tbody></tbody></table>`);
	await page.evaluate((asyncCommit) => {
		const body = document.querySelector('tbody');
		const counts = { run: 0, runlots: 0, clear: 0, update: 0, swap: 0, select: 0 };
		let pending;
		let selected;
		const commit = (work) => {
			if (asyncCommit) {
				if (pending) throw new Error('batch clicks coalesced before commit');
				pending = work;
			} else work();
		};
		if (asyncCommit) {
			window.__benchFlush = async () => {
				await Promise.resolve();
				const work = pending;
				pending = undefined;
				work?.();
			};
		}
		const fill = (count, operation) => {
			counts[operation]++;
			selected = undefined;
			body.innerHTML = Array.from(
				{ length: count },
				(_, id) => `<tr><td>${id}</td><td><a>label ${id}</a></td></tr>`,
			).join('');
		};
		document.getElementById('run').onclick = () => commit(() => fill(1000, 'run'));
		document.getElementById('runlots').onclick = () => commit(() => fill(10000, 'runlots'));
		document.getElementById('clear').onclick = () =>
			commit(() => {
				counts.clear++;
				body.replaceChildren();
				selected = undefined;
			});
		document.getElementById('update').onclick = () =>
			commit(() => {
				counts.update++;
				for (let i = 0; i < body.rows.length; i += 10) {
					body.rows[i].querySelector('a').textContent += ' !!!';
				}
			});
		document.getElementById('swaprows').onclick = () =>
			commit(() => {
				counts.swap++;
				const first = body.rows[1];
				const last = body.rows[998];
				const afterFirst = first.nextSibling;
				last.replaceWith(first);
				body.insertBefore(last, afterFirst);
			});
		body.onclick = (event) => {
			const row = event.target.closest('a')?.closest('tr');
			if (!row) return;
			commit(() => {
				if (selected === row) return;
				counts.select++;
				selected?.classList.remove('danger');
				row.classList.add('danger');
				selected = row;
			});
		};
		window.readTable = () => ({
			counts: { ...counts },
			rows: body.rows.length,
			firstLabel: body.rows[0]?.querySelector('a').textContent,
			selected: selected?.firstElementChild.textContent,
		});
		// State setup waits for committed row counts, so this fixture flushes
		// scheduled setup clicks in a microtask like the supported frameworks.
		if (asyncCommit) {
			for (const name of ['run', 'runlots', 'clear']) {
				const button = document.getElementById(name);
				const click = button.onclick;
				button.onclick = () => {
					click();
					queueMicrotask(() => window.__benchFlush());
				};
			}
		}
	}, asyncCommit);
	return page;
}

for (const asyncCommit of [false, true]) {
	test(
		`calibrated reversible batches commit every ${asyncCommit ? 'async' : 'sync'} click through warmup and measurement`,
		{ timeout: 30000 },
		async (t) => {
			const browser = await chromium.launch({ headless: true });
			t.after(() => browser.close());
			const page = await tableFixture(browser, asyncCommit);
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			for (const op of CANONICAL_OPS.filter((op) =>
				['select', 'swap', 'select_lots'].includes(op.name),
			)) {
				await prepare(page, op);
				const counter = op.name === 'swap' ? 'swap' : 'select';
				const before = await page.evaluate(() => window.readTable());
				const { repeat, trials } = await calibrate(page, op);
				assert.ok(trials.length >= 1 && trials.length <= 5);
				assert.ok(repeat > 1 && repeat <= (op.name === 'swap' ? 5001 : 5000));
				assert.equal(repeat % 2, op.name === 'swap' ? 1 : 0);
				let clicks = trials.reduce((sum, value) => sum + value, 0);
				assert.equal(
					(await page.evaluate(() => window.readTable())).counts[counter] - before.counts[counter],
					clicks,
				);
				// Warmup and subsequent measured batches must keep doing real work.
				for (let batch = 0; batch < 4; batch++) {
					await prepare(page, op);
					const selectors = selectorsFor(op, batch, repeat);
					const elapsed = await timeClick(page, op, selectors, repeat);
					if (op.alternateClick) await verifySelection(page, selectors.at(-1));
					clicks += repeat;
					const after = await page.evaluate(() => window.readTable());
					assert.equal(after.rows, op.pre === 'rows-large' ? 10000 : 1000);
					assert.equal(after.counts[counter] - before.counts[counter], clicks);
					assert.ok(Number.isFinite(elapsed) && elapsed >= 0);
				}
			}
			assert.deepEqual(errors, []);
		},
	);
}

test(
	'shared preparation resets growing update labels while single-click controls skip calibration',
	{ timeout: 30000 },
	async (t) => {
		const browser = await chromium.launch({ headless: true });
		t.after(() => browser.close());
		const page = await tableFixture(browser, true);
		const update = CANONICAL_OPS.find((op) => op.name === 'update');
		await prepare(page, update);
		await timeClick(page, update, selectorsFor(update, 0, 3), 3);
		assert.equal((await page.evaluate(() => window.readTable())).firstLabel, 'label 0 !!! !!! !!!');
		await prepare(page, update);
		const reset = await page.evaluate(() => window.readTable());
		assert.equal(reset.firstLabel, 'label 0');
		assert.equal(reset.counts.update, 3);
		for (const op of [
			...CANONICAL_OPS.filter((op) =>
				['run', 'replace', 'add', 'runlots', 'clear'].includes(op.name),
			),
			{ name: 'clear_1k', pre: 'rows', click: '#clear' },
		]) {
			assert.deepEqual(await calibrate(page, op), { repeat: 1, trials: [] });
		}
		assert.deepEqual(await page.evaluate(() => window.readTable()), reset);
	},
);

async function finishTrace(cdp, completed) {
	await cdp.send('Tracing.end');
	const { stream } = await completed;
	let trace = '';
	try {
		for (;;) {
			const chunk = await cdp.send('IO.read', { handle: stream });
			trace += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
			if (chunk.eof) break;
		}
	} finally {
		await cdp.send('IO.close', { handle: stream });
	}
	return JSON.parse(trace).traceEvents;
}

for (const asyncCommit of [false, true]) {
	for (const alreadyLaidOut of [false, true]) {
		test(
			`reorder samples normalize ${alreadyLaidOut ? 'laid-out' : 'new'} rows before timing ${asyncCommit ? 'async' : 'sync'} commits`,
			{ timeout: 30000 },
			async (t) => {
				const browser = await chromium.launch({
					headless: true,
					args: ['--js-flags=--expose-gc'],
				});
				t.after(() => browser.close());
				const page = await browser.newPage();
				const browserErrors = [];
				page.on('pageerror', (error) => browserErrors.push(error.message));
				page.on('console', (message) => {
					if (message.type() === 'error') browserErrors.push(message.text());
				});
				await page.setContent(`
<style>table { width: 350px } td { padding: 2px; border: 1px solid }</style>
<button id="reverse">Reverse</button><table><tbody></tbody></table>`);
				await page.evaluate(
					({ asyncCommit, alreadyLaidOut }) => {
						const collectGarbage = window.gc;
						if (typeof collectGarbage !== 'function') throw new Error('browser GC unavailable');
						const body = document.querySelector('tbody');
						let commits = 0;
						let pending = 0;
						window.gc = () => {
							collectGarbage();
							body.replaceChildren();
							for (let id = 0; id < 1000; id++) {
								const row = body.insertRow();
								row.insertCell().textContent = String(id);
							}
							window.originalRows = Array.from(body.rows);
							performance.mark('sample-setup');
							// Control: a frame has already laid out the reset table.
							if (alreadyLaidOut) void document.body.offsetHeight;
						};
						const commit = () => {
							body.append(...Array.from(body.rows).reverse());
							body.parentElement.style.width = `${350 + (++commits % 2)}px`;
							// A workload may itself read geometry; that work belongs inside timing.
							void document.body.offsetHeight;
							performance.mark(`sample-commit-${commits}`);
						};
						document.querySelector('#reverse').onclick = () => {
							if (asyncCommit) pending++;
							else commit();
						};
						if (asyncCommit) {
							window.__benchFlush = async () => {
								await Promise.resolve();
								if (pending !== 1) throw new Error('reorders coalesced before commit');
								pending--;
								commit();
							};
						}
						const now = performance.now.bind(performance);
						let timerReads = 0;
						performance.now = () => {
							performance.mark(++timerReads === 1 ? 'sample-start' : 'sample-end');
							return now();
						};
					},
					{ asyncCommit, alreadyLaidOut },
				);
				const cdp = await page.context().newCDPSession(page);
				await cdp.send('Tracing.start', {
					categories: 'devtools.timeline,blink.user_timing',
					transferMode: 'ReturnAsStream',
				});
				const completed = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
				const duration = await timeSample(page, '#reverse', 3);
				const events = await finishTrace(cdp, completed);
				await cdp.detach();
				const marker = (name) => {
					const matches = events.filter(
						(event) => event.name === name && event.cat?.includes('blink.user_timing'),
					);
					assert.equal(matches.length, 1, `missing or repeated ${name} marker`);
					return matches[0].ts;
				};
				const setup = marker('sample-setup');
				const start = marker('sample-start');
				const end = marker('sample-end');
				const layouts = events.filter((event) => event.name === 'Layout');
				assert.ok(
					layouts.some((event) => event.ts >= setup && event.ts < start),
					'new table layout must complete before the sample timer starts',
				);
				assert.ok(
					layouts.some((event) => event.ts >= start && event.ts < end),
					'operation-requested layout must remain inside the sample timer',
				);
				for (let commit = 1; commit <= 3; commit++) {
					assert.ok(marker(`sample-commit-${commit}`) >= start);
					assert.ok(marker(`sample-commit-${commit}`) < end);
				}
				assert.ok(Number.isFinite(duration) && duration >= 0);
				const state = await page.evaluate(() => {
					const rows = Array.from(document.querySelector('tbody').rows);
					return {
						ids: rows.map((row) => row.firstElementChild.textContent),
						retained: rows.every((row, index) => row === window.originalRows[999 - index]),
					};
				});
				assert.deepEqual(
					state.ids,
					Array.from({ length: 1000 }, (_, index) => String(999 - index)),
				);
				assert.equal(state.retained, true, 'keyed survivor nodes must retain identity');
				assert.deepEqual(browserErrors, []);
			},
		);
	}
}
