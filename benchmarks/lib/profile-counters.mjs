// Deterministic engine-work counters from an Octane profile build.
//
// Precise call coverage (precise-work.mjs) observes the shipped production
// program by function name. A profile build compiles the generic program
// instead, so these counters complement that lane rather than replace it:
// their names (`arm.swap`, `rollback.root`) describe the work and survive
// refactors, but they cannot see what production-only compilation saves.
//
// One sample runs in a fresh browser context. Setup hooks run first, then a
// counter snapshot, then the operation, which must resolve only once its own
// completion condition holds, then a second snapshot. Semantic verification
// hooks run after that, so verifying the result cannot inflate the counts.
import { invokeHook } from './precise-work.mjs';

function readSnapshot() {
	const profiler = window.__OCTANE_PROFILER__;
	if (profiler === undefined || typeof profiler.snapshot !== 'function') {
		throw new Error('no Octane profiler: build the fixture with profile: true');
	}
	return profiler.snapshot();
}

// The runtime validates the pair: schema, build, renderers, and an unbroken
// recording generation between the two snapshots.
function diffSnapshots([before, after]) {
	return window.__OCTANE_PROFILER__.diff(before, after);
}

/**
 * Counter changes for one operation on a freshly loaded page. Verification
 * hooks must throw or reject on failure; their return values are ignored.
 * Unhandled page errors and console errors also fail the sample. The browser
 * context is closed even when a hook fails.
 */
export async function collectProfileCounters(browser, { url, before = [], operation, after = [] }) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const browserErrors = [];
	page.on('pageerror', (error) => browserErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') browserErrors.push(message.text());
	});
	try {
		await page.goto(url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		for (const hook of before) await invokeHook(page, hook);
		const start = await page.evaluate(readSnapshot);
		await invokeHook(page, operation);
		const end = await page.evaluate(readSnapshot);
		const diff = await page.evaluate(diffSnapshots, [start, end]);
		if (Object.keys(diff.counters).length === 0) {
			throw new Error('the profile build installed no engine counters');
		}
		for (const hook of after) await invokeHook(page, hook);
		if (browserErrors.length > 0) {
			throw new Error(`profile browser errors: ${browserErrors.join('; ')}`);
		}
		return diff;
	} finally {
		await context.close();
	}
}
