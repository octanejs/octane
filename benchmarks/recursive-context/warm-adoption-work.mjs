// Untimed production-bundle work guard. Detailed Chromium coverage measures
// the real memo-adoption helper and its parent step after compilation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import ts from 'typescript';

const fixture = new URL('./octane-tsrx/', import.meta.url);
const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const metrics = ['adoptWarmEntry', 'adoptWarmCacheEntry', 'useMemo', 'memoTake2'];

async function invoke(page, hook) {
	const { name, arg } = typeof hook === 'string' ? { name: hook } : hook;
	await page.evaluate(
		async ({ name, arg }) => {
			if (typeof window[name] !== 'function') throw new Error(`missing ${name}`);
			await window[name](arg);
		},
		{ name, arg },
	);
}

function parentStepOffset(source, start, end) {
	const ast = ts.createSourceFile('production.js', source, ts.ScriptTarget.Latest, true);
	const positions = [];
	function visit(node) {
		if (node.end < start || node.pos > end) return;
		if (ts.isPropertyAccessExpression(node) && node.name.text === 'parentBlock')
			positions.push(node.getStart(ast));
		ts.forEachChild(node, visit);
	}
	visit(ast);
	assert.equal(positions.length, 1, 'adoption helper has one parent advance');
	return positions[0];
}

async function observe(browser, url, before, operation, after) {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		const cdp = await context.newCDPSession(page);
		await cdp.send('Debugger.enable');
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
		await page.goto(url);
		await page.waitForFunction(() => window.__ready === true);
		for (const hook of before) await invoke(page, hook);
		await cdp.send('Profiler.takePreciseCoverage');
		await invoke(page, operation);
		const coverage = await cdp.send('Profiler.takePreciseCoverage');
		const counts = Object.fromEntries(metrics.map((name) => [name, 0]));
		let parentSteps = 0;
		let productionCalls = 0;
		let helperSeen = false;
		let helperHash;
		for (const script of coverage.result) {
			if (!script.url.includes('/assets/')) continue;
			for (const fn of script.functions) {
				productionCalls += fn.ranges[0].count;
				if (metrics.includes(fn.functionName)) counts[fn.functionName] += fn.ranges[0].count;
				if (fn.functionName !== 'adoptWarmEntry') continue;
				helperSeen = true;
				const { scriptSource } = await cdp.send('Debugger.getScriptSource', {
					scriptId: script.scriptId,
				});
				const { startOffset, endOffset } = fn.ranges[0];
				helperHash = sha256(scriptSource.slice(startOffset, endOffset));
				const offset = parentStepOffset(scriptSource, startOffset, endOffset);
				// Coverage ranges nest. The narrowest enclosing block supplies the
				// exact execution count for this property read; the enclosing function
				// count is insufficient because each call may walk many ancestors.
				const enclosing = fn.ranges
					.filter((range) => range.startOffset <= offset && offset < range.endOffset)
					.sort((a, b) => a.endOffset - a.startOffset - (b.endOffset - b.startOffset));
				assert.ok(enclosing.length > 0, 'parent read is covered');
				parentSteps += enclosing[0].count;
			}
		}
		assert.ok(productionCalls > 0, 'live production asset coverage is present');
		if (before.includes('__primeWarm')) assert.ok(helperSeen, 'primed adoption helper is covered');
		for (const hook of after) await invoke(page, hook);
		assert.deepEqual(errors, [], 'production page errors');
		return { ...counts, parentSteps, helperHash };
	} finally {
		await context.close();
	}
}

export async function collectWarmAdoptionWork(browser, url, { measureOnly = false } = {}) {
	const results = {};
	for (const depth of [32, 128]) {
		const mount = { name: '__mountDeep', arg: depth };
		const verify = ['__verifyDeep', '__unmountDeep'];
		results[`cold_mount_${depth}`] = await observe(browser, url, [], mount, verify);
		results[`primed_mount_${depth}`] = await observe(browser, url, ['__primeWarm'], mount, verify);
		results[`primed_update_${depth}`] = await observe(
			browser,
			url,
			['__primeWarm', mount],
			'__updateDeep',
			verify,
		);
	}
	results.pending_mount = await observe(browser, url, [], '__mountPendingWarm', []);
	results.pending_retry = await observe(
		browser,
		url,
		['__mountPendingWarm'],
		'__resolvePendingWarm',
		['__verifyPendingWarm'],
	);
	for (const depth of [32, 128]) {
		assert.equal(results[`cold_mount_${depth}`].adoptWarmEntry, 0, 'cold memo misses do not adopt');
		for (const operation of ['mount', 'update']) {
			const row = results[`primed_${operation}_${depth}`];
			assert.equal(
				row.adoptWarmEntry,
				depth + 1,
				'every ordinary memo miss still consults adoption',
			);
			if (!measureOnly)
				assert.equal(row.parentSteps, 0, 'no ancestor cache can match a new ordinary episode');
		}
	}
	assert.equal(results.pending_retry.adoptWarmEntry, 1, 'pending retry exercises adoption');
	assert.equal(
		results.pending_retry.adoptWarmCacheEntry,
		1,
		'pending retry consults its warm cache',
	);
	assert.ok(
		results.pending_retry.parentSteps > 0 && results.pending_retry.parentSteps <= 2,
		'pending retry retains the live ancestor-cache path',
	);
	return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const requireFixture = createRequire(new URL('package.json', fixture));
	const { preview } = await import(requireFixture.resolve('vite'));
	execFileSync('pnpm', ['exec', 'vite', 'build', '--minify', 'false'], {
		cwd: fileURLToPath(fixture),
		stdio: 'inherit',
	});
	const server = await preview({
		root: fileURLToPath(fixture),
		configFile: fileURLToPath(new URL('vite.config.js', fixture)),
		preview: { host: '127.0.0.1', port: 0, strictPort: false },
	});
	let browser;
	try {
		browser = await chromium.launch({
			headless: true,
			args: ['--no-sandbox', '--js-flags=--jitless'],
		});
		const url = `http://127.0.0.1:${server.httpServer.address().port}/warm-adoption.html`;
		const results = await collectWarmAdoptionWork(browser, url, {
			measureOnly: process.argv.includes('--measure'),
		});
		const payload = {
			suite: 'warm-adoption',
			node: process.version,
			browser: browser.version(),
			runtimeHash: sha256(
				readFileSync(new URL('../../packages/octane/src/runtime.ts', import.meta.url)),
			),
			results,
		};
		console.log(JSON.stringify(payload, null, 2));
		if (process.env.BENCH_JSON)
			writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	} finally {
		await browser?.close();
		await server.close();
	}
}
