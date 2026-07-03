// De-opt authoring-cliff verifier — the correctness gate for the naive fixtures
// (octane-tsrx-naive :5213, octane-jsx-naive :5214, octane-ts :5215, and dbmon's
// octane-deopt :5209). For each naive fixture and its tuned twin it asserts BOTH:
//
//  1. DE-OPT PROOF — a DOM-observable artifact showing the naive rows are NOT on
//     the compiled template fast path. Two signatures exist (either suffices,
//     since they cover different de-opt entry points; the tuned twin must be
//     clean on both):
//       * SYMBOL: every host element the runtime de-opt reconciler builds is
//         stamped with a `Symbol('octane.deoptDesc')` expando (the descriptor
//         stash `reconcileDeoptNode`/`hostElementBody` diff against — see
//         packages/octane/src/runtime.ts, DEOPT_DESC). Template-cloned elements
//         never carry it. Fires for the plain-.ts createElement fixtures
//         (octane-ts, dbmon octane-deopt).
//       * COMMENTS: a cross-module component per row renders through
//         componentSlot/keyed item Blocks, which bracket every row with comment
//         anchors (`<!--comp-->`/`<!--it-->`/`<!--[-->` pairs) inside <tbody>.
//         The tuned fixtures' single-root `@for`/keyed-`.map` fast path is
//         marker-free per item (only the list's own `<!--for-->` pair — see
//         mountItem's singleRoot branch in runtime.ts). Fires for
//         octane-tsrx-naive / octane-jsx-naive.
//
//  2. EQUIVALENCE — the rendered rows are byte-identical tuned-vs-naive after
//     stripping comment nodes and three documented non-semantic normalizations:
//     `style="…"` attributes (the naive fixtures deliberately carry an inline
//     style object on one cell; its presence is asserted separately),
//     empty `class=""` attributes, and whitespace between tags.
//
// js-framework labels use Math.random, so before driving the app this script
// replaces Math.random on BOTH pages with the same seeded mulberry32 stream —
// identical click sequences then produce identical labels. dbmon data is
// already fully deterministic (seeded PRNG in data.js).
//
// Servers must be running first (see README-naive.md /
// ../dbmon/octane-deopt/README.md). Usage:
//
//   node verify-deopt.mjs                                  # all four default pairs
//   node verify-deopt.mjs jsf   <tunedUrl> <naiveUrl> [..] # explicit pair(s)
//   node verify-deopt.mjs dbmon <tunedUrl> <naiveUrl>
//
// kinds: jsf (js-framework button contract) | dbmon (window.__op contract).
// Exits non-zero if any assertion fails.

import { chromium } from 'playwright';

const DEFAULT_PAIRS = [
	{ kind: 'jsf', name: 'octane-tsrx-naive vs octane-tsrx', tuned: 'http://localhost:5176/', naive: 'http://localhost:5213/' },
	{ kind: 'jsf', name: 'octane-jsx-naive vs octane-jsx', tuned: 'http://localhost:5177/', naive: 'http://localhost:5214/' },
	{ kind: 'jsf', name: 'octane-ts vs octane-tsrx', tuned: 'http://localhost:5176/', naive: 'http://localhost:5215/' },
	{ kind: 'dbmon', name: 'dbmon octane-deopt vs octane-tsrx', tuned: 'http://localhost:5196/', naive: 'http://localhost:5209/' },
];

function parsePairs(argv) {
	if (argv.length === 0) return DEFAULT_PAIRS;
	if (argv.length % 3 !== 0) {
		console.error('usage: node verify-deopt.mjs [jsf|dbmon <tunedUrl> <naiveUrl>]...');
		process.exit(2);
	}
	const pairs = [];
	for (let i = 0; i < argv.length; i += 3) {
		const kind = argv[i];
		if (kind !== 'jsf' && kind !== 'dbmon') {
			console.error(`unknown pair kind "${kind}" (expected jsf | dbmon)`);
			process.exit(2);
		}
		pairs.push({ kind, name: `${kind} ${argv[i + 2]} vs ${argv[i + 1]}`, tuned: argv[i + 1], naive: argv[i + 2] });
	}
	return pairs;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Replace Math.random with a seeded mulberry32 stream (same seed on both pages)
// so js-framework's random labels are identical across the pair. Installed AFTER
// page load (startup code can't desync the stream) and before the first click.
const seedRandom = (page) =>
	page.evaluate(() => {
		let a = 0x5eed5eed >>> 0;
		Math.random = () => {
			a = (a + 0x6d2b79f5) | 0;
			let t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	});

// Snapshot the table: row count, de-opt signatures, and normalized row HTML.
// `firstN` rows are compared byte-for-byte; `full` additionally captures the
// whole (normalized) tbody — used for dbmon, whose data is fully deterministic.
const snapshot = (page, { firstN = 10, full = false } = {}) =>
	page.evaluate(
		({ firstN, full }) => {
			const tbody = document.querySelector('tbody');
			if (!tbody) return null;
			let comments = 0;
			for (const node of tbody.childNodes) if (node.nodeType === 8) comments++;
			const trs = [...tbody.querySelectorAll('tr')];
			let deoptStamped = 0;
			let styledCells = 0;
			for (const tr of trs) {
				if (Object.getOwnPropertySymbols(tr).some((s) => String(s.description) === 'octane.deoptDesc'))
					deoptStamped++;
				if (tr.querySelector('td[style]')) styledCells++;
			}
			const norm = (html) =>
				html
					.replace(/<!--[\s\S]*?-->/g, '') // comment anchors (the de-opt artifact itself)
					.replace(/ style="[^"]*"/g, '') // naive-only inline style cell (presence asserted via styledCells)
					.replace(/ class=""/g, '') // empty-class serialization can differ template-vs-deopt
					.replace(/>\s+</g, '><') // whitespace-only text nodes between tags
					.trim();
			return {
				rows: trs.length,
				comments,
				deoptStamped,
				styledCells,
				ids: trs.map((tr) => (tr.firstElementChild ? tr.firstElementChild.textContent.trim() : '')).join(','),
				firstRows: trs.slice(0, firstN).map((tr) => norm(tr.outerHTML)).join('\n'),
				fullRows: full ? norm(tbody.innerHTML) : null,
			};
		},
		{ firstN, full },
	);

const clickSel = (page, sel) =>
	page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (!el) throw new Error('selector not found: ' + sel);
		el.click();
	}, sel);

// ── Assertions ──────────────────────────────────────────────────────────────

function assertDeoptSignature(fail, tuned, naive) {
	// The tuned twin must look compiled: no de-opt descriptor stamps, and at most
	// the list's own marker pair (+ a possible `<!>` template anchor) in <tbody>.
	if (tuned.deoptStamped !== 0)
		fail(`tuned twin has ${tuned.deoptStamped} de-opt-stamped rows (expected 0 — is TUNED url actually the compiled fixture?)`);
	if (tuned.comments > 4)
		fail(`tuned twin has ${tuned.comments} comment nodes in <tbody> (expected <= 4 for the marker-free fast path)`);
	const symbolSig = naive.rows > 0 && naive.deoptStamped === naive.rows;
	const commentSig = naive.rows > 0 && naive.comments >= naive.rows;
	if (!symbolSig && !commentSig)
		fail(
			`no de-opt signature on the naive fixture: deoptStamped=${naive.deoptStamped}/${naive.rows}, ` +
				`tbody comments=${naive.comments} — rows appear to be on the template fast path`,
		);
	return symbolSig ? 'symbol (octane.deoptDesc expando)' : 'comments (per-row block anchors)';
}

function assertEqualRows(fail, step, tuned, naive, { full = false } = {}) {
	if (tuned === null || naive === null) return fail(`${step}: missing <tbody>`);
	if (tuned.rows !== naive.rows) fail(`${step}: row count tuned=${tuned.rows} naive=${naive.rows}`);
	if (tuned.ids !== naive.ids) fail(`${step}: row id sequences differ`);
	if (tuned.firstRows !== naive.firstRows)
		fail(
			`${step}: normalized row HTML differs.\n--- tuned ---\n${tuned.firstRows}\n--- naive ---\n${naive.firstRows}`,
		);
	if (full && tuned.fullRows !== naive.fullRows) fail(`${step}: full normalized <tbody> HTML differs`);
}

// ── Pair drivers ────────────────────────────────────────────────────────────

async function runJsfPair(browser, pair, fail) {
	const pages = {};
	for (const side of ['tuned', 'naive']) {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		await page.goto(pair[side], { waitUntil: 'load' });
		await page.waitForSelector('#run', { timeout: 10_000 });
		await seedRandom(page);
		pages[side] = { ctx, page };
	}
	const both = (fn) => Promise.all([fn(pages.tuned.page), fn(pages.naive.page)]);
	const settle = () => sleep(30);

	// 1k rows (both streams seeded identically → identical ids AND labels).
	await both((p) => clickSel(p, '#run'));
	await both((p) => p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1000));
	await settle();
	let [tuned, naive] = await both((p) => snapshot(p));
	const sig = assertDeoptSignature(fail, tuned, naive);
	// The naive fixture's inline-style cell must actually be there (the style
	// attr is normalized OUT of the byte compare, so assert it separately).
	if (naive.styledCells !== naive.rows)
		fail(`naive inline-style cell missing: ${naive.styledCells}/${naive.rows} rows carry td[style]`);
	if (tuned.styledCells !== 0) fail(`tuned twin unexpectedly has ${tuned.styledCells} td[style] cells`);
	assertEqualRows(fail, 'after #run', tuned, naive);

	// Select row 5 — drives the naive member-callee `actions.select` path.
	await both((p) => clickSel(p, 'tbody tr:nth-child(5) td:nth-child(2) a'));
	await settle();
	[tuned, naive] = await both((p) => snapshot(p));
	assertEqualRows(fail, 'after select(row 5)', tuned, naive);
	if (!naive.firstRows.includes('danger')) fail('after select(row 5): naive row 5 did not gain the danger class');

	// Update every 10th row (no RNG involved), then swap rows 2/999.
	await both((p) => clickSel(p, '#update'));
	await settle();
	[tuned, naive] = await both((p) => snapshot(p));
	assertEqualRows(fail, 'after #update', tuned, naive);

	await both((p) => clickSel(p, '#swaprows'));
	await settle();
	[tuned, naive] = await both((p) => snapshot(p));
	assertEqualRows(fail, 'after #swaprows', tuned, naive);

	await pages.tuned.ctx.close();
	await pages.naive.ctx.close();
	return sig;
}

async function runDbmonPair(browser, pair, fail) {
	const pages = {};
	for (const side of ['tuned', 'naive']) {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		await page.goto(pair[side], { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		pages[side] = { ctx, page };
	}
	const both = (fn) => Promise.all([fn(pages.tuned.page), fn(pages.naive.page)]);
	const settle = () => sleep(30);

	await both((p) => p.evaluate(() => window.__mount()));
	await settle();
	let [tuned, naive] = await both((p) => snapshot(p, { full: true }));
	const sig = assertDeoptSignature(fail, tuned, naive);
	assertEqualRows(fail, 'after __mount', tuned, naive, { full: true });

	// Same frame counter advance on both sides → identical churned data.
	await both((p) => p.evaluate(() => window.__tick()));
	await settle();
	[tuned, naive] = await both((p) => snapshot(p, { full: true }));
	assertEqualRows(fail, 'after __tick', tuned, naive, { full: true });

	// Worst-case keyed reorder (deterministic count sort, id tiebreak).
	await both((p) => p.evaluate(() => window.__sort()));
	await settle();
	[tuned, naive] = await both((p) => snapshot(p, { full: true }));
	assertEqualRows(fail, 'after __sort', tuned, naive, { full: true });

	await pages.tuned.ctx.close();
	await pages.naive.ctx.close();
	return sig;
}

// ── Main ────────────────────────────────────────────────────────────────────

const pairs = parsePairs(process.argv.slice(2));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let failed = false;

for (const pair of pairs) {
	const failures = [];
	const fail = (msg) => failures.push(msg);
	console.log(`\n=== ${pair.name}`);
	console.log(`    tuned: ${pair.tuned}   naive: ${pair.naive}`);
	let sig = null;
	try {
		sig = pair.kind === 'dbmon' ? await runDbmonPair(browser, pair, fail) : await runJsfPair(browser, pair, fail);
	} catch (err) {
		fail(`crashed: ${err && err.message ? err.message : err}`);
	}
	if (failures.length === 0) {
		console.log(`    PASS — de-opt signature: ${sig}; rows byte-identical (minus comments) at every step`);
	} else {
		failed = true;
		for (const f of failures) console.log(`    FAIL — ${f}`);
	}
}

await browser.close();
if (failed) {
	console.error('\nverify-deopt: FAILED');
	process.exit(1);
}
console.log('\nverify-deopt: all pairs passed');
