// Speed-of-light Element PAPI probe (#49 / roadmap item 1).
//
// Bounds the platform floor for materializing the exact 10,000-row table shape
// (view.row > text.col-id/col-label/col-remove > raw-text; 40k styled elements
// + 30k raw-text nodes) with a bare loop over the public Element PAPI in the
// same main-thread realm where Octane's receiver runs. The difference between
// Octane's measured `papi_element_creation` + `mt_apply_other` stages and this
// floor is the collapsible Octane-side share; the floor itself is the part no
// main-thread-materializing framework can avoid on this host.
//
//   node stages/papi-floor.mjs [--reps 5] [--rows 10000] [--skip-build]
//
// Protocol: fresh page per sample; probe / octane-control / octane-profile
// cells interleave in AB/BA order within one window (quiet-host preflight as
// stages/run.mjs). The probe instruments nothing inside Octane: it traps only
// the host globals (`__CreatePage`, `__SetCSSId`) before web-core boots, in
// every cell identically, to learn the page node and scoped-CSS id.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

import {
	analyzeCreateSample,
	interleavedABSchedule,
	requireMinimumRepetitions,
} from './analyze.mjs';
import { realmSnapshots, resetProfiles } from './profile-realms.mjs';
import {
	WIRE_INSTRUMENT_JS,
	applyNeutralize,
	makeBenchHtml,
	stats,
} from '../web/driver-client.mjs';
import { buildTableApp } from '../scripts/build-app.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
	options: {
		reps: { type: 'string', default: '5' },
		rows: { type: 'string', default: '10000' },
		port: { type: 'string', default: '8362' },
		smoke: { type: 'boolean', default: false },
		'skip-build': { type: 'boolean', default: false },
		'allow-busy-host': { type: 'boolean', default: false },
		render: { type: 'string' },
	},
});
const repetitions = args.smoke ? 1 : requireMinimumRepetitions(args.reps);
const rows = Number(args.rows);
if (!Number.isSafeInteger(rows) || rows <= 0)
	throw new TypeError('rows must be a positive integer.');
const port = Number(args.port);
const cpuCount = os.cpus().length;
const loadPerCpu = os.loadavg()[0] / cpuCount;
if (args.render === undefined && !args['allow-busy-host'] && loadPerCpu > 0.5) {
	throw new Error(
		`quiet-host preflight failed: 1-minute load ${os.loadavg()[0].toFixed(2)} / ${cpuCount} CPUs = ${loadPerCpu.toFixed(2)}; close competing work or pass --allow-busy-host and disclose it.`,
	);
}

const createLabels = new Map([
	[1000, 'Create 1,000 rows'],
	[3000, 'Create 3,000 rows'],
	[5000, 'Create 5,000 rows'],
	[10000, 'Create 10,000 rows'],
	[20000, 'Create 20,000 rows'],
	[30000, 'Create 30,000 rows'],
]);
const createLabel = createLabels.get(rows);
if (createLabel === undefined)
	throw new Error(`the shared app has no create button for ${rows} rows.`);

const variants = {
	control: path.join(root, 'app/dist/main.web.bundle'),
	profile: path.join(root, 'app/dist-profile/main.web.bundle'),
};

function buildVariants() {
	const previousProfile = process.env.OCTANE_LYNX_PROFILE;
	const previousRows = process.env.BENCH_AUTOROWS;
	try {
		for (const profile of ['0', '1']) {
			process.env.OCTANE_LYNX_PROFILE = profile;
			process.env.BENCH_AUTOROWS = '0';
			buildTableApp({ silent: true });
		}
	} finally {
		if (previousProfile === undefined) delete process.env.OCTANE_LYNX_PROFILE;
		else process.env.OCTANE_LYNX_PROFILE = previousProfile;
		if (previousRows === undefined) delete process.env.BENCH_AUTOROWS;
		else process.env.BENCH_AUTOROWS = previousRows;
	}
}

const webCoreClientJs = require.resolve('@lynx-js/web-core/client.prod.js');
const webCoreRoot = path.resolve(path.dirname(webCoreClientJs), '../..');
const html = makeBenchHtml({ instrumentJs: WIRE_INSTRUMENT_JS });

function startServer() {
	const mime = {
		'.js': 'text/javascript',
		'.css': 'text/css',
		'.wasm': 'application/wasm',
		'.bundle': 'application/octet-stream',
	};
	const server = http.createServer((request, response) => {
		const url = new URL(request.url, 'http://localhost');
		if (url.pathname === '/') {
			response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
			response.end(html);
			return;
		}
		let file = null;
		if (url.pathname.startsWith('/webcore/')) file = path.join(webCoreRoot, url.pathname.slice(9));
		else if (url.pathname.startsWith('/bundle/')) file = variants[url.pathname.slice(8)];
		if (file === null || file === undefined || !fs.existsSync(file)) {
			response.writeHead(404);
			response.end('not found');
			return;
		}
		response.writeHead(200, {
			'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
			'cache-control': 'no-store',
		});
		fs.createReadStream(file).pipe(response);
	});
	return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// Installed in every frame before any page script: records the page node and
// the scoped-CSS id as web-core defines and calls the host globals. Identical
// in every cell; nothing Octane-side is patched.
const HOST_BOUNDARY_TRAP_JS = `(() => {
  const captured = (globalThis.__PAPI_FLOOR_CAPTURE__ = { page: null, cssId: null, rowsContainer: null });
  let createPage;
  Object.defineProperty(globalThis, '__CreatePage', {
    configurable: true,
    get() { return createPage; },
    set(value) {
      if (typeof value !== 'function') { createPage = value; return; }
      createPage = function (...argv) {
        const node = value.apply(this, argv);
        if (captured.page === null) {
          captured.page = node;
          captured.cssId = typeof argv[1] === 'number' ? argv[1] : null;
        }
        return node;
      };
    },
  });
  let setCssId;
  Object.defineProperty(globalThis, '__SetCSSId', {
    configurable: true,
    get() { return setCssId; },
    set(value) {
      if (typeof value !== 'function') { setCssId = value; return; }
      setCssId = function (...argv) {
        if (captured.cssId === null && typeof argv[1] === 'number') captured.cssId = argv[1];
        return value.apply(this, argv);
      };
    },
  });
  let setClasses;
  Object.defineProperty(globalThis, '__SetClasses', {
    configurable: true,
    get() { return setClasses; },
    set(value) {
      if (typeof value !== 'function') { setClasses = value; return; }
      setClasses = function (...argv) {
        if (captured.rowsContainer === null && argv[1] === 'rows') captured.rowsContainer = argv[0];
        return value.apply(this, argv);
      };
    },
  });
})()`;

// Runs inside the main-thread realm. Outer-timed phases over the public PAPI;
// no per-call timers, so the loop is the cheapest call sequence the host
// accepts for this shape.
const PROBE_JS = `(count, chunk) => {
  const capture = globalThis.__PAPI_FLOOR_CAPTURE__;
  if (!capture || capture.page === null) throw new Error('probe: page node was not captured.');
  if (capture.rowsContainer === null) throw new Error('probe: rows container was not captured.');
  const page = capture.page;
  const cssId = capture.cssId;
  const rowsContainer = capture.rowsContainer;
  const uid = globalThis.__GetElementUniqueID(page);
  const createView = globalThis.__CreateView;
  const createText = globalThis.__CreateText;
  const createRawText = globalThis.__CreateRawText;
  const setClasses = globalThis.__SetClasses;
  const addEvent = globalThis.__AddEvent;
  const append = globalThis.__AppendElement
    ?? ((parent, child) => globalThis.__InsertElementBefore(parent, child, undefined));
  const flush = globalThis.__FlushElementTree;

  // Deterministic labels (mulberry32(42), same generator family as the app).
  let seed = 42 >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const adjectives = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy'];
  const colours = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange'];
  const nouns = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse', 'keyboard'];
  const pick = (max) => Math.round(rand() * 1000) % max;
  const ids = new Array(count);
  const labels = new Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = String(i + 1);
    labels[i] = adjectives[pick(adjectives.length)] + ' ' + colours[pick(colours.length)] + ' ' + nouns[pick(nouns.length)];
  }

  const views = new Array(count);
  const idTexts = new Array(count);
  const labelTexts = new Array(count);
  const removeTexts = new Array(count);
  const idRaws = new Array(count);
  const labelRaws = new Array(count);
  const removeRaws = new Array(count);

  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    views[i] = createView(uid);
    idTexts[i] = createText(uid);
    labelTexts[i] = createText(uid);
    removeTexts[i] = createText(uid);
    idRaws[i] = createRawText(ids[i]);
    labelRaws[i] = createRawText(labels[i]);
    removeRaws[i] = createRawText('x');
  }
  const t1 = performance.now();
  // Scoped CSS resolves through the page-level cssId established at
  // __CreatePage; the app's create path never issues per-node __SetCSSId, so
  // the floor omits it too and applies exactly the per-node props octane does.
  for (let i = 0; i < count; i++) {
    setClasses(views[i], 'row');
    setClasses(idTexts[i], 'col-id');
    setClasses(labelTexts[i], 'col-label');
    setClasses(removeTexts[i], 'col-remove');
  }
  const t2 = performance.now();
  for (let i = 0; i < count; i++) {
    addEvent(labelTexts[i], 'bindEvent', 'tap', 'probe-' + i + '-select');
    addEvent(removeTexts[i], 'bindEvent', 'tap', 'probe-' + i + '-remove');
  }
  const t3 = performance.now();
  for (let i = 0; i < count; i++) {
    const view = views[i];
    append(view, idTexts[i]);
    append(idTexts[i], idRaws[i]);
    append(view, labelTexts[i]);
    append(labelTexts[i], labelRaws[i]);
    append(view, removeTexts[i]);
    append(removeTexts[i], removeRaws[i]);
    append(rowsContainer, view);
    if (chunk > 0 && (i + 1) % chunk === 0) flush(page);
  }
  const t4 = performance.now();
  flush(page);
  const t5 = performance.now();
  if (globalThis.__PAPI_FLOOR_DEBUG__) {
    globalThis.__PAPI_FLOOR_LAST__ = {
      pageCtor: page?.constructor?.name ?? null,
      rowParentIsContainer:
        typeof globalThis.__GetParent === 'function'
          ? globalThis.__GetParent(views[0]) === rowsContainer
          : null,
      pageNodeType: page?.nodeType ?? null,
      cssId,
      uid,
    };
  }
  return {
    factoriesMs: t1 - t0,
    propsMs: t2 - t1,
    eventsMs: t3 - t2,
    treeMs: t4 - t3,
    flushReturnMs: t5 - t4,
    flushEndEpochMs: performance.timeOrigin + t5,
    elements: count * 7,
  };
}`;

async function load(browser, variant) {
	const page = await browser.newPage();
	if (process.env.LYNX_BENCH_DEBUG) {
		page.on('console', (message) =>
			console.log(`[console:${variant}:${message.type()}]`, message.text().slice(0, 500)),
		);
		page.on('pageerror', (error) =>
			console.log(`[pageerror:${variant}]`, String(error).slice(0, 1000)),
		);
	}
	await applyNeutralize(page);
	await page.addInitScript(HOST_BOUNDARY_TRAP_JS);
	await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
	await page.evaluate(
		(url) => globalThis.__x.createView(url),
		`http://127.0.0.1:${port}/bundle/${variant}`,
	);
	await page.waitForFunction(() => globalThis.__x.findText('Benchmark on Lynx'), undefined, {
		timeout: 60000,
	});
	await page.evaluate(() => globalThis.__x.settle());
	return page;
}

async function mainThreadFrame(page) {
	for (const frame of page.frames()) {
		const isMain = await frame
			.evaluate(
				() =>
					typeof globalThis.__CreateView === 'function' &&
					globalThis.__PAPI_FLOOR_CAPTURE__?.page != null,
			)
			.catch(() => false);
		if (isMain) return frame;
	}
	throw new Error('main-thread realm with captured page node not found.');
}

async function runProbe(browser, chunkRows = 0) {
	const page = await load(browser, 'control');
	try {
		const frame = await mainThreadFrame(page);
		if (process.env.LYNX_BENCH_DEBUG) {
			await frame.evaluate(() => {
				globalThis.__PAPI_FLOOR_DEBUG__ = true;
			});
		}
		const armEpoch = await page.evaluate(() => performance.timeOrigin + performance.now());
		const sample = await frame.evaluate(`(${PROBE_JS})(${rows}, ${chunkRows})`);
		if (process.env.LYNX_BENCH_DEBUG) {
			const diag = await frame.evaluate(() => globalThis.__PAPI_FLOOR_LAST__ ?? null);
			const composedNow = await page.evaluate(() => ({
				content: globalThis.__x.contentCount(),
				probeContainers: globalThis.__x.findByClass('probe-rows').length,
			}));
			console.log('[papi-floor:debug]', JSON.stringify({ diag, composedNow }));
		}
		const composed = await page.evaluate(
			({ minimum }) =>
				new Promise((resolve, reject) => {
					const deadline = performance.now() + 120000;
					const tick = () => {
						if (globalThis.__x.rowCount() >= minimum) {
							resolve(performance.timeOrigin + performance.now());
							return;
						}
						if (performance.now() > deadline) {
							reject(new Error('probe rows never appeared in the composed tree.'));
							return;
						}
						requestAnimationFrame(tick);
					};
					tick();
				}),
			{ minimum: rows },
		);
		if (process.env.LYNX_BENCH_DEBUG) {
			const rowDiag = await page.evaluate(() => {
				const walk = (node, out) => {
					if (!node) return;
					if (node.nodeType === 1) {
						const cls = node.getAttribute && node.getAttribute('class');
						if (cls && cls.split(/\s+/).includes('row') && out.length < 2) out.push(node);
						if (node.shadowRoot) walk(node.shadowRoot, out);
					}
					for (const child of node.childNodes || []) walk(child, out);
				};
				const rows = [];
				walk(document.body, rows);
				return rows.map((row) => ({
					tag: row.tagName,
					attrs: [...row.attributes].map((a) => a.name + '=' + a.value.slice(0, 40)),
					rect: row.getBoundingClientRect().toJSON(),
					computedHeight: getComputedStyle(row).height,
					display: getComputedStyle(row).display,
				}));
			});
			console.log('[papi-floor:rowdiag]', JSON.stringify(rowDiag));
		}
		sample.presentMs = composed - sample.flushEndEpochMs;
		sample.totalMs =
			sample.factoriesMs +
			sample.propsMs +
			sample.eventsMs +
			sample.treeMs +
			sample.flushReturnMs +
			sample.presentMs;
		sample.armToComposedMs = composed - armEpoch;
		return sample;
	} finally {
		await page.close();
	}
}

async function runOctaneCreate(browser, variant) {
	const page = await load(browser, variant);
	try {
		if (variant === 'profile') await resetProfiles(page);
		const armed = page.evaluate((spec) => globalThis.__x.arm(spec, 120000), {
			type: 'rowCount',
			value: rows,
		});
		const rectangle = await page.evaluate((text) => globalThis.__x.buttonRect(text), createLabel);
		if (rectangle === null) throw new Error(`${createLabel} button not found.`);
		await page.mouse.click(rectangle.x, rectangle.y);
		const rawMs = (await armed).ms;
		if (variant !== 'profile') return { rawMs };
		const realms = await realmSnapshots(page);
		if (realms.background === null || realms.main === null) {
			throw new Error('profile create did not expose both Lynx realm snapshots.');
		}
		return {
			rawMs,
			attribution: analyzeCreateSample({
				wallMs: rawMs,
				background: realms.background,
				main: realms.main,
			}),
		};
	} finally {
		await page.close();
	}
}

function summarize(samples, pickValue) {
	return stats(samples.map(pickValue));
}

function round(value, digits = 1) {
	return value === null || value === undefined ? null : Number(value.toFixed(digits));
}

function renderMarkdown(report) {
	const round2 = round;
	const floorFactories = report.probe.factoriesMs?.median ?? null;
	const papi = report.octane.stages.papi_element_creation?.median ?? null;
	const floorApply =
		(report.probe.propsMs?.median ?? 0) +
		(report.probe.eventsMs?.median ?? 0) +
		(report.probe.treeMs?.median ?? 0);
	const apply = report.octane.stages.mt_apply_other?.median ?? null;
	const wall = report.octane.control?.median ?? null;
	const singleTotal = report.probe.totalMs?.median ?? null;
	const chunkedTotal = report.probeChunked.totalMs?.median ?? null;
	const lines = [
		`# Element PAPI speed-of-light floor @ ${report.meta.rows.toLocaleString('en-US')} rows`,
		'',
		`- measured: ${report.meta.date}`,
		`- host: ${report.meta.cpus}× ${report.meta.cpuModel}; ${report.meta.platform} ${report.meta.release}; Node ${report.meta.node}`,
		`- protocol: ${report.meta.protocol}`,
		`- host load: start ${report.meta.loadStart.map((v) => v.toFixed(2)).join('/')} (1/5/15m), end ${report.meta.loadEnd.map((v) => v.toFixed(2)).join('/')}`,
		`- repetitions: n=${report.meta.repetitions} per cell`,
		'',
		'## Bare-PAPI floor (outer-timed, same shape as one table row × N)',
		'',
		'Single flush vs chunked (flush every ⌈rows/10⌉ appends, mirroring the ~10',
		'incremental BTS→MTS batches octane applies).',
		'',
		'| phase | single median ms | chunked median ms |',
		'|---|---:|---:|',
	];
	const phaseNames = [
		'factoriesMs',
		'propsMs',
		'eventsMs',
		'treeMs',
		'flushReturnMs',
		'presentMs',
		'totalMs',
		'armToComposedMs',
	];
	for (const phase of phaseNames) {
		const cell = report.probe[phase];
		const chunkedCell = report.probeChunked[phase];
		if (cell === null && chunkedCell === null) continue;
		lines.push(`| ${phase} | ${round2(cell?.median)} | ${round2(chunkedCell?.median)} |`);
	}
	lines.push(
		'',
		'## Octane in the same window',
		'',
		`Raw create: control ${round2(report.octane.control?.median)} ms, profile ${round2(report.octane.profile?.median)} ms.`,
		'',
		'| octane stage | median ms |',
		'|---|---:|',
	);
	for (const [stage, cell] of Object.entries(report.octane.stages)) {
		lines.push(`| ${stage} | ${round2(cell?.median)} |`);
	}
	lines.push(
		'',
		'## Floor vs Octane',
		'',
		`- probe factories (${report.meta.rows * report.meta.elementsPerRow} elements): ${round2(floorFactories)} ms vs octane papi_element_creation ${round2(papi)} ms`,
		`- probe props+events+tree: ${round2(floorApply)} ms vs octane mt_apply_other ${round2(apply)} ms`,
		`- probe total (arm→composed): ${round2(report.probe.armToComposedMs?.median)} ms vs octane create wall ${round2(wall)} ms`,
	);
	if (floorFactories !== null && papi !== null && apply !== null && wall !== null) {
		const papiCollapsible = papi - floorFactories;
		const applyCollapsible = apply - floorApply;
		const gate = (value) => (value / wall >= 0.1 ? 'GO' : 'NO-GO');
		lines.push(
			'',
			'## Verdicts',
			'',
			`- **papi_element_creation collapsible share: ${gate(papiCollapsible)}.** Floor is ${((floorFactories / papi) * 100).toFixed(1)}% of the stage; collapsible ${round2(papiCollapsible)} ms = ${((papiCollapsible / wall) * 100).toFixed(1)}% of the create wall (owner gate: ≥10%). The factory calls themselves are host cost; only fewer calls change it.`,
			`- **mt_apply_other collapsible share: ${gate(applyCollapsible)}.** Floor-equivalent props+events+tree is ${((floorApply / apply) * 100).toFixed(1)}% of the stage; collapsible ${round2(applyCollapsible)} ms = ${((applyCollapsible / wall) * 100).toFixed(1)}% of the create wall.`,
			`- **Flush batching: ${chunkedTotal !== null && singleTotal !== null && Math.abs(chunkedTotal - singleTotal) / singleTotal >= 0.1 ? 'significant' : 'NO-GO'}.** Single-flush total ${round2(singleTotal)} ms vs chunked ${round2(chunkedTotal)} ms.`,
			`- Observation: the probe's one-shot foreign-task mutation pays ${round2(report.probe.presentMs?.median)} ms of post-flush presentation versus octane's ${round2(report.octane.stages.presentation_residual?.median)} ms message-paced residual; this is renderer scheduling, not octane machinery, and does not enter the stage-floor comparison above.`,
		);
	}
	lines.push('');
	return lines.join('\n');
}

if (args.render !== undefined) {
	const report = JSON.parse(fs.readFileSync(args.render, 'utf-8'));
	const mdPath = args.render.replace(/\.json$/, '.md');
	fs.writeFileSync(mdPath, renderMarkdown(report));
	console.log(`[papi-floor] re-rendered ${mdPath}`);
	process.exit(0);
}

if (!args['skip-build']) buildVariants();
for (const [name, file] of Object.entries(variants)) {
	if (!fs.existsSync(file)) throw new Error(`${name} bundle is missing: ${file}`);
}
const server = await startServer();
const { chromium } = require('playwright');
const browser = await chromium.launch({
	headless: true,
	// Same override convention as the shared cross-framework runner: use a
	// preinstalled Chromium instead of downloading the pinned revision.
	...(process.env.PLAYWRIGHT_CHROMIUM_PATH
		? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
		: null),
	args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const loadStart = os.loadavg();
const probeSamples = [];
const chunkedSamples = [];
const controlSamples = [];
const profileSamples = [];
try {
	const chunk = Math.ceil(rows / 10);
	const schedule = args.smoke ? [['probe', 'octane']] : interleavedABSchedule(repetitions);
	for (const [first] of schedule) {
		// Alternate which side goes first so drift hits both cells equally.
		const order =
			first === 'control'
				? ['probe', 'chunked', 'control', 'profile']
				: ['control', 'profile', 'chunked', 'probe'];
		for (const cell of order) {
			if (cell === 'probe' || cell === 'octane') probeSamples.push(await runProbe(browser));
			else if (cell === 'chunked') chunkedSamples.push(await runProbe(browser, chunk));
			else if (cell === 'control') controlSamples.push(await runOctaneCreate(browser, 'control'));
			else profileSamples.push(await runOctaneCreate(browser, 'profile'));
		}
	}
} finally {
	await browser.close();
	server.close();
}
const loadEnd = os.loadavg();

const phases = [
	'factoriesMs',
	'propsMs',
	'eventsMs',
	'treeMs',
	'flushReturnMs',
	'presentMs',
	'totalMs',
	'armToComposedMs',
];
const report = {
	meta: {
		date: new Date().toISOString(),
		rows,
		repetitions: args.smoke ? 1 : repetitions,
		cpus: os.cpus().length,
		cpuModel: os.cpus()[0]?.model ?? 'unknown',
		platform: os.platform(),
		release: os.release(),
		node: process.version,
		loadStart,
		loadEnd,
		elementsPerRow: 7,
		protocol:
			'fresh page per sample; probe and octane control/profile cells interleave AB/BA in one window; probe phases are outer-timed bare public-PAPI loops in the same main-thread realm',
	},
	probe: Object.fromEntries(
		phases.map((phase) => [phase, summarize(probeSamples, (sample) => sample[phase])]),
	),
	probeChunked: Object.fromEntries(
		phases.map((phase) => [phase, summarize(chunkedSamples, (sample) => sample[phase])]),
	),
	octane: {
		control: summarize(controlSamples, (sample) => sample.rawMs),
		profile: summarize(profileSamples, (sample) => sample.rawMs),
		stages: Object.fromEntries(
			Object.keys(profileSamples[0]?.attribution?.stages ?? {}).map((stage) => [
				stage,
				summarize(profileSamples, (sample) => sample.attribution.stages[stage]),
			]),
		),
	},
};

const resultsDir = path.join(root, 'stages/results');
fs.mkdirSync(resultsDir, { recursive: true });
const jsonPath = path.join(resultsDir, `papi-floor-${rows}.json`);
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, '\t')}\n`);

const markdown = renderMarkdown(report);
const mdPath = path.join(resultsDir, `papi-floor-${rows}.md`);
fs.writeFileSync(mdPath, markdown);
console.log(`[papi-floor] ${jsonPath}`);
console.log(`[papi-floor] ${mdPath}`);
console.log(markdown);
