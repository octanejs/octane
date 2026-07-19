// Deterministic production-work instrumentation shared by browser benchmarks.
//
// Source probes can change the program a compiler sees (and, in particular,
// disqualify purity/memoization proofs). Chromium precise call coverage observes
// the emitted production bundle instead. Callers should launch Chromium with
// `--jitless` so optimized/inlined functions cannot disappear from coverage.

async function invokeHook(page, hook) {
	await page.evaluate(async (name) => {
		const fn = window[name];
		if (typeof fn !== 'function') throw new Error(`missing ${name}`);
		const result = fn();
		if (result && typeof result.then === 'function') await result;
	}, hook);
}

function countNamedFunctions(coverage, metrics) {
	const counts = Object.fromEntries(metrics.map((name) => [name, 0]));
	let productionCalls = 0;
	for (const script of coverage.result) {
		if (!script.url.includes('/assets/')) continue;
		for (const fn of script.functions) {
			productionCalls += fn.ranges[0]?.count ?? 0;
			if (Object.prototype.hasOwnProperty.call(counts, fn.functionName)) {
				counts[fn.functionName] += fn.ranges[0]?.count ?? 0;
			}
		}
	}
	if (productionCalls === 0) {
		throw new Error('operation produced no production asset call coverage');
	}
	return counts;
}

/**
 * Count named production-bundle calls for one operation after a fresh page.
 * `before` establishes committed state outside the observed coverage window.
 */
export async function collectPreciseCalls(browser, { url, before = [], operation, metrics }) {
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
		await page.goto(url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });

		// Module initialization and state setup are controls, not part of the row.
		await cdp.send('Profiler.takePreciseCoverage');
		for (const hook of before) await invokeHook(page, hook);
		await cdp.send('Profiler.takePreciseCoverage');

		await invokeHook(page, operation);
		const coverage = await cdp.send('Profiler.takePreciseCoverage');
		return countNamedFunctions(coverage, metrics);
	} finally {
		if (profiling) {
			await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await cdp.send('Profiler.disable').catch(() => {});
		}
		await context.close();
	}
}
