// router-data harness: what a data router costs on the journeys a user feels.
// Every target renders the same three nested routes (org > project > task),
// each with its own loader against shared/api.js (DELAY ms per request), and
// runs the same journey on a fresh page per iteration:
//
//   cold_nested    home → /org/1/project/2/task/3   3 independent loaders
//   sibling        → task 4                         only the leaf's params change
//   search_unread  → task 4 ?tab=b                  a search key no loader reads
//   preload_intent hover, wait, click → task 7      intent preload, then navigate
//   mutation       rename task 7 through its form   write + revalidation
//   back_cached    history.back() → task 4 ?tab=b   revisit inside the fresh window
//
// For each op it records time to the committed DOM, read requests, writes and
// sequential request waves. The floors are fixed by the journey, not by any
// router: cold_nested is 1 wave (3 reads), sibling 1 read, search_unread 0,
// preload_intent 0 reads after the click, mutation 1 wave (single flight),
// back_cached 0 reads before the DOM is restored.
//
// Gates (fatal, checked every iteration): the final DOM of every op; the org
// and project layout nodes survive sibling/search navigations by identity; the
// previous task stays on screen until the next commits (no blank screen).
//
// The journey runs in two passes on fresh pages:
//   latency  DELAY 20ms, no throttle: request shape (reads, waves) and time;
//   cpu4x    DELAY 0, 4x CPU throttle: the router's own work per navigation,
//            reported as <op>_cpu4x timings (counters come from latency only).
//
// Usage: node benchmarks/router-data/run.mjs [iterations]   (default 10)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ITER = parseInt(process.argv[2] || '10', 10);
const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_TARGETS = [
	{ name: 'octane-floor', dir: 'octane-floor', port: 5341 },
	{ name: 'octane-remix-router', dir: 'octane-remix-router', port: 5342 },
	{ name: 'octane-tanstack-router', dir: 'octane-tanstack-router', port: 5343 },
	{ name: 'react-router', dir: 'react-router', port: 5344 },
	{ name: 'tanstack-router', dir: 'tanstack-router', port: 5345 },
	{ name: 'sveltekit', dir: 'sveltekit', port: 5346 },
];
const TARGETS = process.env.TARGETS ? JSON.parse(process.env.TARGETS) : DEFAULT_TARGETS;

const TASK = (id, tab = 'a') => `.task[data-task="${id}"][data-tab="${tab}"]`;
const OPS = [
	{ op: 'cold_nested', click: '#l-cold', waitFor: TASK(3) },
	{ op: 'sibling', click: '#l-sib', waitFor: TASK(4), watch: '.task', keep: true },
	{ op: 'search_unread', click: '#l-tab', waitFor: TASK(4, 'b'), watch: '.task', keep: true },
	{ op: 'preload_intent', click: '#l-pre', hover: '#l-pre', waitFor: TASK(7), watch: '.task' },
	{ op: 'mutation', click: 'form.rename button', fill: true, waitFor: null, watch: '.task' },
	{ op: 'back_cached', back: true, waitFor: TASK(4, 'b'), watch: '.task' },
];
const COUNTERS = ['reads', 'writes', 'waves'];
const PASSES = [
	{ suffix: '', delay: 20, cpu: 1 },
	{ suffix: '_cpu4x', delay: 0, cpu: 4 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jsGzipKb(dir) {
	const roots = ['dist', 'build'].map((d) => path.join(here, dir, d));
	let bytes = 0;
	const walk = (p) => {
		for (const name of fs.readdirSync(p)) {
			const file = path.join(p, name);
			if (fs.statSync(file).isDirectory()) walk(file);
			else if (name.endsWith('.js'))
				bytes += zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
		}
	};
	for (const root of roots) if (fs.existsSync(root)) walk(root);
	return bytes ? bytes / 1024 : null;
}

async function runTarget(t, browser, pass) {
	const url = `http://localhost:${t.port}/`;
	const samples = Object.fromEntries(
		OPS.map((o) => [o.op, { ms: [], reads: [], writes: [], waves: [] }]),
	);
	const failures = [];
	for (let i = 0; i < ITER; i++) {
		const page = await browser.newPage();
		await page.addInitScript((delay) => {
			window.__ROUTER_DATA_DELAY = delay;
		}, pass.delay);
		if (pass.cpu > 1) {
			const cdp = await page.context().newCDPSession(page);
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: pass.cpu });
		}
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		await page.goto(url, { waitUntil: 'load' });
		await page.waitForFunction(
			() => typeof window.__measure === 'function' && document.querySelector('#l-cold'),
			null,
			{ timeout: 15000 },
		);
		for (const o of OPS) {
			const title = `Renamed ${i}`;
			if (o.keep) await page.evaluate(() => window.__tag('.org') && window.__tag('.project'));
			if (o.fill) await page.fill('form.rename input[name="title"]', title);
			if (o.hover) {
				await page.hover(o.hover);
				await sleep(150);
			}
			const waitFor = o.waitFor ?? `.task-title[data-title="${title}"]`;
			const r = await page.evaluate((args) => window.__measure(args), {
				click: o.click,
				back: o.back,
				waitFor,
				watch: o.watch,
			});
			if (r.blank)
				failures.push(
					`${o.op}${pass.suffix}: previous screen went blank before the next committed`,
				);
			if (
				o.keep &&
				!(await page.evaluate(() => window.__tagged('.org') && window.__tagged('.project')))
			) {
				failures.push(`${o.op}${pass.suffix}: org/project layout was rebuilt`);
			}
			const s = samples[o.op];
			s.ms.push(r.ms);
			for (const c of COUNTERS) s[c].push(r[c]);
			await sleep(30);
		}
		if (errors.length) failures.push(`page errors: ${errors.join('; ')}`);
		await page.close();
	}
	return { samples, failures: [...new Set(failures)] };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

(async () => {
	const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
	const all = {};
	for (const t of TARGETS) {
		all[t.name] = { samples: {}, failures: [] };
		for (const pass of PASSES) {
			console.error(
				`Running ${t.name} (:${t.port}) × ${ITER}, delay ${pass.delay}ms, cpu ${pass.cpu}x…`,
			);
			try {
				const r = await runTarget(t, browser, pass);
				all[t.name].samples[pass.suffix] = r.samples;
				all[t.name].failures.push(...r.failures);
			} catch (error) {
				all[t.name].failures.push(String(error?.message ?? error));
			}
		}
	}
	await browser.close();

	const cell = (t, suffix, op) => {
		const s = all[t.name].samples?.[suffix]?.[op];
		if (!s) return 'n/a';
		const ms = summarizeSamples(s.ms, { scoreMode: 'mean' }).score;
		return suffix
			? `${ms.toFixed(2)}ms`
			: `${ms.toFixed(1)}ms r${median(s.reads)} w${median(s.waves)}`;
	};
	const header = () => {
		console.log('op             | ' + TARGETS.map((t) => t.name.padEnd(24)).join('| '));
		console.log('---------------+-' + TARGETS.map(() => '-'.repeat(24)).join('+-'));
	};
	console.log(
		`\nLatency pass, DELAY 20ms per request. Cells: time to committed DOM, reads, request waves (medians).\n`,
	);
	header();
	for (const { op } of OPS)
		console.log(op.padEnd(15) + '| ' + TARGETS.map((t) => cell(t, '', op).padEnd(24)).join('| '));
	console.log(
		`\nCPU pass, DELAY 0, 4x CPU throttle. Cells: time to committed DOM (the router's own work).\n`,
	);
	header();
	for (const { op } of OPS)
		console.log(
			op.padEnd(15) + '| ' + TARGETS.map((t) => cell(t, '_cpu4x', op).padEnd(24)).join('| '),
		);
	console.log();
	console.log(
		'js_gzip_kb     | ' +
			TARGETS.map((t) => String(jsGzipKb(t.dir)?.toFixed(1) ?? 'n/a').padEnd(24)).join('| '),
	);
	for (const t of TARGETS)
		for (const f of all[t.name].failures) console.log(`GATE ${t.name}: ${f}`);

	const failed = TARGETS.filter((t) => all[t.name].failures.length).map((t) => t.name);
	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'router-data',
			iterations: ITER,
			targets: TARGETS.map((t) => {
				const ops = {};
				for (const pass of PASSES) {
					const s = all[t.name].samples[pass.suffix];
					if (!s) continue;
					for (const { op } of OPS) {
						ops[op + pass.suffix] = timingStatForJson(
							summarizeSamples(s[op].ms, { scoreMode: 'mean' }),
						);
						if (pass.suffix) continue;
						for (const c of COUNTERS)
							ops[`${op}_${c}`] = { score: median(s[op][c]), samples: s[op][c].length };
					}
				}
				const kb = jsGzipKb(t.dir);
				if (kb != null) ops.js_gzip_kb = { score: kb, samples: 1 };
				return { name: t.name, ops, meta: { delayMs: 20, failures: all[t.name].failures } };
			}),
		};
		if (failed.length) payload.failed = `gates failed: ${failed.join(', ')}`;
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	}
	if (failed.length) process.exit(1);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
