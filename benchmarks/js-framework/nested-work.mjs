// Opt-in production browser work gate for nested implicit descriptor keys.
// Build the separate nested-work.html entry, serve it with Vite preview, then
// run WORK_MODE=nested node benchmarks/js-framework/style-work.mjs [samples].

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.TARGET_URL || 'http://127.0.0.1:5317/nested-work.html';
const SAMPLES = Math.max(4, Number(process.argv[2] ?? 30));
const UPDATES_PER_SAMPLE = 8;
const ROWS = 1000;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext();
// Install before the production module evaluates: the runtime can legitimately
// capture JSON.stringify at module initialization. Keep the wrapper stable for
// the semantic run, then use a separate clean page for timing.
await context.addInitScript(() => {
	const original = JSON.stringify;
	const counts = {
		nestedImplicitJson: 0,
		nestedExplicitJson: 0,
		explicitValueJson: 0,
		flatImplicitJson: 0,
		pathOnlyJson: 0,
	};
	JSON.stringify = function (value, ...rest) {
		if (Array.isArray(value) && value.length === 3 && Array.isArray(value[0])) {
			if (value[1] === 'index' && Number.isInteger(value[2])) {
				if (value[0].length === 0) counts.flatImplicitJson++;
				else counts.nestedImplicitJson++;
			} else if (value[0].length > 0 && value[1] === 'key') {
				counts.nestedExplicitJson++;
			}
		} else if (Array.isArray(value) && value.length === 2 && value[0] === 'wrapper') {
			counts.pathOnlyJson++;
		} else if (typeof value === 'string' && (value === '0' || /^row-\d+$/.test(value))) {
			counts.explicitValueJson++;
		}
		return Reflect.apply(original, this, [value, ...rest]);
	};
	window.__nestedJsonObserver = {
		reset() {
			for (const key of Object.keys(counts)) counts[key] = 0;
		},
		read() {
			return { ...counts };
		},
	};
});
const page = await context.newPage();
let timingContext;
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

let result;
try {
	await page.goto(URL, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	const semantic = await page.evaluate((count) => {
		const run = (operation) => window.__nestedWork(operation);
		const kinds = ['nested', 'flat', 'explicit'];
		const lists = () => ({
			nested: document.querySelector('#nested-work-rows'),
			flat: document.querySelector('#flat-work-rows'),
			explicit: document.querySelector('#explicit-work-rows'),
		});
		function check(kind, version, before) {
			const list = lists()[kind];
			if (!list || list.getAttribute('data-version') !== String(version)) {
				throw new Error(`${kind} did not commit version ${version}`);
			}
			const rows = Array.from(list.children);
			const expected = count + 1 + Number(kind !== 'flat');
			if (rows.length !== expected)
				throw new Error(`${kind}: ${rows.length} rows, expected ${expected}`);
			for (let index = 0; index < count; index++) {
				const row = rows[index === 0 ? 0 : index + 1];
				if (row.getAttribute('data-work-index') !== String(index)) {
					throw new Error(`${kind}: wrong order/content at ${index}`);
				}
				if (row.querySelector('input')?.getAttribute('value') !== String(index)) {
					throw new Error(`${kind}: wrong input markup at ${index}`);
				}
			}
			if (rows[1].getAttribute('data-work-index') !== 'explicit') {
				throw new Error(`${kind}: explicit key "0" did not remain separate from index 0`);
			}
			if (kind !== 'flat' && rows.at(-1).getAttribute('data-work-index') !== 'tail') {
				throw new Error(`${kind} wrapper sentinel is absent`);
			}
			if (before && rows.some((row, index) => row !== before[index])) {
				throw new Error(`${kind}: unchanged child lost DOM identity`);
			}
			return rows;
		}
		function observe(action) {
			window.__nestedJsonObserver.reset();
			run(action);
			return window.__nestedJsonObserver.read();
		}

		run('mount');
		const before = Object.fromEntries(kinds.map((kind) => [kind, check(kind, 0)]));
		const html = kinds.map((kind) => lists()[kind].innerHTML).join('|');
		const inputs = kinds.flatMap((kind) =>
			[before[kind][0], before[kind][1]].map((row) => row.querySelector('input')),
		);
		for (const input of inputs) {
			if (!input) throw new Error('missing input state control');
			input.value = `typed ${input.getAttribute('aria-label')}`;
		}
		inputs[0].focus();
		const work = {};
		const versions = { nested: 0, flat: 0, explicit: 0 };
		for (const kind of kinds) {
			work[kind] = observe(`update-${kind}`);
			versions[kind] = 1;
			for (const other of kinds) check(other, versions[other], before[other]);
		}
		work.explicitReorder = observe('reorder-explicit');
		const reordered = Array.from(lists().explicit.children);
		const expectedReordered = [...before.explicit.slice(0, -1).reverse(), before.explicit.at(-1)];
		if (
			lists().explicit.getAttribute('data-version') !== '2' ||
			reordered.length !== expectedReordered.length ||
			reordered.some((row, index) => row !== expectedReordered[index])
		) {
			throw new Error('keyed reorder changed row identity or order');
		}
		work.explicitRestore = observe('restore-explicit');
		for (const kind of kinds) check(kind, versions[kind], before[kind]);
		const nextHtml = kinds.map((kind) => lists()[kind].innerHTML).join('|');
		if (html !== nextHtml) throw new Error('visible HTML changed on unrelated updates');
		for (const input of inputs) {
			if (input.value !== `typed ${input.getAttribute('aria-label')}`) {
				throw new Error('uncontrolled input state was reset');
			}
		}
		if (document.activeElement !== inputs[0]) throw new Error('focused input was replaced');
		run('unmount');
		return {
			html,
			work,
			rows: Object.fromEntries(kinds.map((kind) => [kind, before[kind].length])),
		};
	}, ROWS);

	// The observer and semantic checks have finished. Timings use a fresh mount,
	// two prepared descriptor generations, and no JSON.stringify interception.
	timingContext = await browser.newContext();
	const timingPage = await timingContext.newPage();
	timingPage.on('pageerror', (error) => errors.push(error.message));
	await timingPage.goto(URL, { waitUntil: 'load' });
	await timingPage.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	const timing = await timingPage.evaluate(
		({ samples, updatesPerSample }) => {
			const run = (operation) => window.__nestedWork(operation);
			run('mount');
			const kinds = ['nested', 'flat', 'explicit'];
			for (let i = 0; i < 12; i++) {
				for (const kind of kinds) run(`update-${kind}`);
			}
			const times = { nested: [], flat: [], explicit: [] };
			for (let i = 0; i < samples; i++) {
				for (let offset = 0; offset < kinds.length; offset++) {
					const kind = kinds[(i + offset) % kinds.length];
					const t0 = performance.now();
					for (let j = 0; j < updatesPerSample; j++) run(`update-${kind}`);
					times[kind].push((performance.now() - t0) / updatesPerSample);
				}
			}
			if (
				document.querySelector('#nested-work-rows')?.children.length !== 1002 ||
				document.querySelector('#flat-work-rows')?.children.length !== 1001 ||
				document.querySelector('#explicit-work-rows')?.children.length !== 1002
			) {
				throw new Error('timed updates changed the list shapes');
			}
			run('unmount');
			return times;
		},
		{ samples: SAMPLES, updatesPerSample: UPDATES_PER_SAMPLE },
	);
	const summarize = (values) => {
		const sorted = values.toSorted((a, b) => a - b);
		return {
			samples: sorted.length,
			medianMs: sorted[Math.floor(sorted.length / 2)],
			p95Ms: sorted[Math.floor(sorted.length * 0.95)],
		};
	};
	const htmlSha = createHash('sha256').update(semantic.html).digest('hex');
	assert.equal(semantic.rows.nested, ROWS + 2);
	assert.equal(semantic.rows.flat, ROWS + 1);
	assert.equal(semantic.rows.explicit, ROWS + 2);
	const expectedExplicitTuples = Number(process.env.WORK_EXPECT_EXPLICIT_TUPLES ?? ROWS + 1);
	const expectedExplicitValues = Number(process.env.WORK_EXPECT_EXPLICIT_VALUES ?? 0);
	const expectedExplicitPath = Number(process.env.WORK_EXPECT_EXPLICIT_PATH ?? 0);
	for (const kind of ['explicit', 'explicitReorder', 'explicitRestore']) {
		assert.equal(semantic.work[kind].nestedImplicitJson, 0);
		assert.equal(semantic.work[kind].nestedExplicitJson, expectedExplicitTuples);
		assert.equal(semantic.work[kind].explicitValueJson, expectedExplicitValues);
		assert.equal(semantic.work[kind].pathOnlyJson, expectedExplicitPath);
	}
	assert.equal(semantic.work.flat.pathOnlyJson, 0, 'flat siblings need no nested prefix');
	assert.equal(semantic.work.flat.nestedExplicitJson, 0, 'flat keys need no nested encoding');
	assert.equal(semantic.work.flat.explicitValueJson, 0, 'flat keys need no scalar encoding');
	const expectedMixedExplicitTuples = Number(process.env.WORK_EXPECT_MIXED_EXPLICIT_TUPLES ?? 1);
	const expectedMixedExplicitValues = Number(process.env.WORK_EXPECT_MIXED_EXPLICIT_VALUES ?? 0);
	assert.equal(
		semantic.work.nested.nestedExplicitJson,
		expectedMixedExplicitTuples,
		'mixed nested explicit key retains exact encoding',
	);
	assert.equal(semantic.work.nested.explicitValueJson, expectedMixedExplicitValues);
	assert.equal(semantic.work.nested.flatImplicitJson, 0);
	assert.equal(
		semantic.work.flat.nestedImplicitJson,
		0,
		'top-level control must not serialize nested keys',
	);
	assert.equal(semantic.work.flat.flatImplicitJson, 0, 'top-level implicit keys stay numeric');
	if (process.env.WORK_EXPECT_NESTED_JSON !== undefined) {
		assert.equal(
			semantic.work.nested.nestedImplicitJson,
			Number(process.env.WORK_EXPECT_NESTED_JSON),
		);
	}
	if (process.env.WORK_EXPECT_PATH_JSON !== undefined) {
		assert.equal(semantic.work.nested.pathOnlyJson, Number(process.env.WORK_EXPECT_PATH_JSON));
	}
	if (process.env.WORK_EXPECTED_HTML_SHA) assert.equal(htmlSha, process.env.WORK_EXPECTED_HTML_SHA);
	assert.deepEqual(errors, [], 'browser errors');
	result = {
		suite: 'js-framework-style-work/nested',
		target: URL,
		htmlSha,
		rows: semantic.rows,
		work: semantic.work,
		updatesPerSample: UPDATES_PER_SAMPLE,
		timing: Object.fromEntries(
			Object.entries(timing).map(([kind, values]) => [kind, summarize(values)]),
		),
	};
	console.log(JSON.stringify(result, null, 2));
	if (process.env.WORK_JSON)
		fs.writeFileSync(process.env.WORK_JSON, JSON.stringify(result, null, 2) + '\n');
} finally {
	await context.close();
	await timingContext?.close();
	await browser.close();
}
