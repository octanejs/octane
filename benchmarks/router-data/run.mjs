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
import { pairedRatio, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

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

async function loadPage(t, browser, { delay, cpu }, measureHome = false) {
	const page = await browser.newPage();
	await page.addInitScript(
		({ delay, measureHome }) => {
			window.__ROUTER_DATA_DELAY = delay;
			if (!measureHome) return;
			const observer = new MutationObserver(() => {
				if (typeof window.__measure === 'function' && document.querySelector('.home')) {
					window.__routerDataHomeReady = performance.now();
					observer.disconnect();
				}
			});
			observer.observe(document, { subtree: true, childList: true, attributes: true });
		},
		{ delay, measureHome },
	);
	if (cpu > 1) {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	}
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await page.goto(`http://localhost:${t.port}/`, { waitUntil: 'load' });
	await page.waitForFunction(
		(measureHome) =>
			typeof window.__measure === 'function' &&
			document.querySelector('#l-cold') &&
			(!measureHome || Number.isFinite(window.__routerDataHomeReady)),
		measureHome,
		{ timeout: 15000 },
	);
	return { page, errors };
}

async function runTarget(t, browser, pass) {
	const samples = Object.fromEntries(
		OPS.map((o) => [o.op, { ms: [], reads: [], writes: [], waves: [] }]),
	);
	const failures = [];
	for (let i = 0; i < ITER; i++) {
		const { page, errors } = await loadPage(t, browser, pass);
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

async function browserScope(browser, quota, cpu) {
	const page = await browser.newPage();
	try {
		const session = await browser.newBrowserCDPSession();
		const { processInfo } = await session.send('SystemInfo.getProcessInfo');
		const groups = new Set(
			processInfo.map(
				({ id }) => fs.readFileSync(`/proc/${id}/cgroup`, 'utf8').trim().split('::')[1],
			),
		);
		const [group] = groups;
		if (!group || groups.size !== 1 || !processInfo.some(({ type }) => type === 'renderer')) {
			throw new Error('Chromium processes must share one cgroup with a renderer');
		}
		const read = (file) => fs.readFileSync(`/sys/fs/cgroup${group}/${file}`, 'utf8').trim();
		const [quotaUs, periodUs] = read('cpu.max').split(' ').map(Number);
		if (quotaUs * 100 !== periodUs * quota || read('cpuset.cpus.effective') !== cpu) {
			throw new Error(`Chromium scope must have CPU ${cpu} and quota ${quota}%`);
		}
		const usedMs = () => Number(read('cpu.stat').match(/^usage_usec (\d+)$/m)[1]) / 1000;
		return {
			usedMs,
			quotaUs,
			periodUs,
			processTypes: [...new Set(processInfo.map(({ type }) => type))],
		};
	} finally {
		await page.close();
	}
}

async function runBrowserBudget(cpu) {
	if (process.platform !== 'linux' || !/^(0|[1-9]\d*)$/.test(cpu)) {
		throw new Error('ROUTER_DATA_BUDGET_CPU needs a Linux logical CPU number');
	}
	if (!Number.isSafeInteger(ITER) || ITER < 1) throw new Error('expected at least one iteration');
	const modes = [
		{ name: 'browser100', quota: 100, cpu: 1 },
		{ name: 'browser100_cdp4x', quota: 100, cpu: 4 },
		{ name: 'browser25', quota: 25, cpu: 1 },
	];
	const targets = TARGETS.map(({ name }) => ({
		name,
		ops: {},
		meta: { delayMs: 0, browserCpu: cpu, modes: {} },
	}));
	for (const mode of modes) {
		const browser = await chromium.launch({
			headless: true,
			args: ['--disable-extensions'],
			executablePath: path.join(here, 'browser-budget.sh'),
			env: {
				...process.env,
				ROUTER_DATA_BUDGET_CPU: cpu,
				ROUTER_DATA_CHROMIUM: process.env.ROUTER_DATA_CHROMIUM ?? chromium.executablePath(),
				ROUTER_DATA_BROWSER_QUOTA: String(mode.quota),
			},
		});
		try {
			const { usedMs, ...scope } = await browserScope(browser, mode.quota, cpu);
			for (const [index, target] of TARGETS.entries()) {
				const samples = {
					home_ready: [],
					cold_nested: [],
					warm_nested: [],
					home_plus_cold: [],
					home_plus_cold_cpu: [],
				};
				for (let i = 0; i < ITER; i++) {
					const startCpu = usedMs();
					const { page, errors } = await loadPage(target, browser, { ...mode, delay: 0 }, true);
					try {
						const measure = (click, waitFor) =>
							page.evaluate((args) => window.__measure(args), { click, waitFor });
						const homeReady = await page.evaluate(() => window.__routerDataHomeReady);
						const cold = await measure('#l-cold', TASK(3));
						const cpuThroughCold = usedMs() - startCpu;
						await measure('#l-home', '.home');
						// No hover. All three loader keys are new, although the code is warm.
						const warm = await measure('#l-pre', TASK(7));
						if (errors.length || [cold, warm].some((r) => r.reads !== 3 || r.writes || r.aborted)) {
							throw new Error(
								`${target.name} ${mode.name}: invalid cold/warm pair ${JSON.stringify({ cold, warm, errors })}`,
							);
						}
						samples.home_ready.push(homeReady);
						samples.cold_nested.push(cold.ms);
						samples.warm_nested.push(warm.ms);
						samples.home_plus_cold.push(homeReady + cold.ms);
						samples.home_plus_cold_cpu.push(cpuThroughCold);
					} finally {
						await page.close();
					}
				}
				for (const [name, values] of Object.entries(samples)) {
					targets[index].ops[`${name}_${mode.name}`] = timingStatForJson(
						summarizeSamples(values, { scoreMode: 'mean' }),
					);
				}
				targets[index].meta.modes[mode.name] = {
					...scope,
					chromium: browser.version(),
					cdpRate: mode.cpu,
					coldOverWarm: ITER > 1 ? pairedRatio(samples.warm_nested, samples.cold_nested) : null,
				};
				console.log(
					`${target.name} ${mode.name} (ms)`,
					Object.fromEntries(
						Object.entries(samples).map(([name, values]) => [name, median(values).toFixed(2)]),
					),
				);
			}
		} finally {
			await browser.close();
		}
	}
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(
			process.env.BENCH_JSON,
			JSON.stringify({ suite: 'router-data', iterations: ITER, targets }, null, '\t') + '\n',
		);
	}
}

(async () => {
	if (process.env.ROUTER_DATA_BUDGET_CPU !== undefined) {
		await runBrowserBudget(process.env.ROUTER_DATA_BUDGET_CPU);
		return;
	}
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
