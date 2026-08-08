// Untimed production-work gate for the Octane streaming-chat fixture.
// Chromium precise coverage observes generated row helpers without adding
// source-level probes that would invalidate the compiler's purity proof.

import fs from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.TARGET_URL || 'http://localhost:5250/';
const METRICS = ['ChatApp', 'renderBlockInner', 'forBlock', 'updateSurvivor', 'segText', 'setText'];
const OPS = [
	{
		name: 'history_pump',
		streaming: true,
		exact: { ChatApp: 1, setText: 1 },
		max: {
			renderBlockInner: 7,
			itemBodies: 4,
			forBlock: 3,
			updateSurvivor: 206,
			segText: 2,
		},
	},
	{
		name: 'history_type',
		streaming: false,
		exact: { ChatApp: 1 },
		max: {
			renderBlockInner: 1,
			itemBodies: 0,
			forBlock: 0,
			updateSurvivor: 0,
			segText: 0,
			setText: 0,
		},
	},
];

function callCounts(coverage) {
	const counts = Object.fromEntries(METRICS.map((metric) => [metric, 0]));
	counts.itemBodies = 0;
	for (const script of coverage.result) {
		if (!script.url.includes('/assets/')) continue;
		for (const fn of script.functions) {
			const calls = fn.ranges[0]?.count ?? 0;
			if (fn.functionName.startsWith('__item$')) counts.itemBodies += calls;
			if (Object.prototype.hasOwnProperty.call(counts, fn.functionName)) {
				counts[fn.functionName] += calls;
			}
		}
	}
	if (counts.ChatApp === 0 || counts.renderBlockInner === 0) {
		throw new Error('Missing named production call coverage; rebuild with CHAT_STREAM_WORK=1.');
	}
	return counts;
}

async function prepare(page, streaming) {
	await page.goto(URL, { waitUntil: 'load' });
	await page.waitForSelector('.prompt', { timeout: 10_000 });
	await page.evaluate((needsStreaming) => {
		window.__reset();
		document.querySelector('.conv-tab[data-conv="1"]').click();
		if (document.querySelectorAll('.messages .message').length !== 200) {
			throw new Error('Expected the 200-message conversation.');
		}
		if (!needsStreaming) return;
		const input = document.querySelector('.prompt');
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
			input,
			'Benchmark: stream into long history',
		);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		document.querySelector('.send').click();
		if (document.querySelectorAll('.messages .message').length !== 202) {
			throw new Error('Expected one user message and one streaming reply.');
		}
		if (document.querySelectorAll('.messages .streaming').length !== 1) {
			throw new Error('Expected exactly one streaming reply.');
		}
	}, streaming);
}

async function measure(browser, op) {
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
		await prepare(page, op.streaming);
		await cdp.send('Profiler.takePreciseCoverage');
		await page.evaluate((streaming) => {
			const rows = Array.from(document.querySelectorAll('.messages .message'));
			const texts = rows.map((row) => row.textContent);
			if (streaming) {
				const remaining = window.__pump(8);
				if (remaining <= 0) throw new Error('Token pump unexpectedly settled the reply.');
			} else {
				const input = document.querySelector('.prompt');
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'x');
				input.dispatchEvent(new Event('input', { bubbles: true }));
				if (input.value !== 'x') throw new Error('Controlled composer lost its updated value.');
			}

			const nextRows = Array.from(document.querySelectorAll('.messages .message'));
			if (nextRows.length !== rows.length) throw new Error('Message count changed.');
			for (let index = 0; index < rows.length; index++) {
				if (nextRows[index] !== rows[index]) {
					throw new Error(`Message ${index} unexpectedly lost its DOM identity.`);
				}
				if (streaming && index === rows.length - 1) {
					if (nextRows[index].textContent === texts[index]) {
						throw new Error('Streaming reply did not receive its new tokens.');
					}
				} else if (nextRows[index].textContent !== texts[index]) {
					throw new Error(`Untouched message ${index} unexpectedly changed.`);
				}
			}
		}, op.streaming);
		return callCounts(await cdp.send('Profiler.takePreciseCoverage'));
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
	for (const op of OPS) {
		const counts = await measure(browser, op);
		results[op.name] = counts;
		for (const [metric, expected] of Object.entries(op.exact)) {
			if (counts[metric] !== expected) {
				failures.push(`${op.name}.${metric}: ${counts[metric]} !== ${expected}`);
			}
		}
		for (const [metric, ceiling] of Object.entries(op.max)) {
			if (counts[metric] > ceiling) {
				failures.push(`${op.name}.${metric}: ${counts[metric]} exceeds ${ceiling}`);
			}
		}
	}
} finally {
	await browser.close();
}

console.log(
	'Operation     | app | render | item bodies | lists | survivors | text helpers | writes',
);
console.log(
	'--------------+-----+--------+-------------+-------+-----------+--------------+-------',
);
for (const op of OPS) {
	const counts = results[op.name];
	console.log(
		`${op.name.padEnd(13)} | ${String(counts.ChatApp).padStart(3)} | ${String(counts.renderBlockInner).padStart(6)} | ${String(counts.itemBodies).padStart(11)} | ${String(counts.forBlock).padStart(5)} | ${String(counts.updateSurvivor).padStart(9)} | ${String(counts.segText).padStart(12)} | ${String(counts.setText).padStart(5)}`,
	);
}

if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify({ suite: 'chat-stream-work', target: URL, results, failures }, null, '\t') +
			'\n',
	);
}

if (failures.length > 0) {
	console.error(`\n${failures.length} deterministic work gate failure(s):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log('\nAll deterministic streaming-chat work gates passed.');
