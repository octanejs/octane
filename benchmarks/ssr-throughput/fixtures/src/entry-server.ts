import { prerender } from 'octane/static';
import { WaterfallApp } from './Waterfall.tsrx';
import { DeoptPageFast } from './DeoptFast.tsrx';
import { DeoptPagePlain } from './deopt-plain';
import { EscapeApp } from './Escape.tsrx';

// SSR entry for the Part-2 fixtures — the harness (../run.mjs) imports the
// BUILT bundle of this module and times these render fns (crib of the
// benchmarks/news entry-server pattern, one entry for all three fixtures).
// Everything the harness gates need (expected chain value, escape probe) is
// re-exported so the analytic expectations live next to the fixture data.
export { expectedChainValue } from './waterfall-data';
export { ESCAPE_PROBE } from './escape-data';

// The harness reads `.body`; prerender returns { html, css } (head folded into
// html — these fixtures render no <head>), so map html → body.
type BodyResult = { body: string; css: string };
const toBody = (r: { html: string; css: string }): BodyResult => ({ body: r.html, css: r.css });

export async function renderWaterfall(depth: number): Promise<BodyResult> {
	return toBody(await prerender(WaterfallApp, { depth }));
}

export async function renderDeoptFast(): Promise<BodyResult> {
	return toBody(await prerender(DeoptPageFast));
}

export async function renderDeoptPlain(): Promise<BodyResult> {
	// prerender normalizes a descriptor-returning root through ssrChild (same as
	// ssrComponent does for children), so the plain-.ts page renders directly.
	return toBody(await prerender(DeoptPagePlain as any));
}

export async function renderEscapeHeavy(): Promise<BodyResult> {
	return toBody(await prerender(EscapeApp));
}
