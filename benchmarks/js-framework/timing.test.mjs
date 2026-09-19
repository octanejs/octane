import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { timeSample } from './run-reorder.mjs';

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
