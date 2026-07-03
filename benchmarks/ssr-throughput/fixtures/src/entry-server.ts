import { render } from 'octane/server';
import type { RenderResult } from 'octane/server';
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

export function renderWaterfall(depth: number): Promise<RenderResult> {
	return render(WaterfallApp, { depth });
}

export function renderDeoptFast(): Promise<RenderResult> {
	return render(DeoptPageFast);
}

export function renderDeoptPlain(): Promise<RenderResult> {
	// render() normalizes a descriptor-returning root through ssrChild (same as
	// ssrComponent does for children), so the plain-.ts page renders directly.
	return render(DeoptPagePlain as any);
}

export function renderEscapeHeavy(): Promise<RenderResult> {
	return render(EscapeApp);
}
