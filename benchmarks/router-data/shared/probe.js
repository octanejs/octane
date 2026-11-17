// In-page measurement helpers shared by every fixture. The harness calls
// window.__measure(...) through page.evaluate, so a sample starts in the same
// task as the click and ends on the exact commit that satisfies `waitFor`.
const { log, DELAY } = window.__api;

function waves(entries) {
	// A new wave starts when a request begins after the earliest completion of
	// the previous wave: it could have waited on that response.
	let count = 0;
	let waveEnd = -Infinity;
	for (const e of [...entries].sort((a, b) => a.start - b.start)) {
		if (e.start >= waveEnd - 1) {
			count++;
			waveEnd = e.end || Infinity;
		} else if (e.end && e.end < waveEnd) waveEnd = e.end;
	}
	return count;
}

function settle(t0, from, waitFor, watch) {
	return new Promise((resolve) => {
		let blank = false;
		const check = () => {
			if (watch && !document.querySelector(watch)) blank = true;
			if (document.querySelector(waitFor)) {
				obs.disconnect();
				const ms = performance.now() - t0;
				// Let background work (revalidation, SWR refreshes) start and finish
				// so it is counted, without being timed.
				setTimeout(() => {
					const entries = log.slice(from);
					resolve({
						ms,
						reads: entries.filter((e) => e.kind === 'read').length,
						writes: entries.filter((e) => e.kind === 'write').length,
						aborted: entries.filter((e) => e.aborted).length,
						waves: waves(entries.filter((e) => e.start - t0 <= ms + 1)),
						blank,
					});
				}, DELAY * 4);
			}
		};
		const obs = new MutationObserver(check);
		obs.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});
		check();
	});
}

/**
 * Click `selector` (or run `action`) and resolve when `waitFor` matches.
 * `watch` names an element that must stay on screen until then (held screen).
 */
window.__measure = ({ click, back, waitFor, watch }) => {
	const from = log.length;
	const t0 = performance.now();
	const result = settle(t0, from, waitFor, watch);
	if (back) history.back();
	else document.querySelector(click).click();
	return result;
};

/** Node identity probe: tag the element now, check it survived later. */
window.__tag = (selector) => {
	const el = document.querySelector(selector);
	if (el) el.__routerDataTag = true;
	return !!el;
};
window.__tagged = (selector) => !!document.querySelector(selector)?.__routerDataTag;
