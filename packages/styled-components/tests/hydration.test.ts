// Hydration adoption of the SSR css channel: at client boot the engine adopts
// `sc.*` chunk tags (and removes them), leaves octane-core chunks and
// createGlobalStyle chunks alone, and a subsequent client render of the same
// component reuses the adopted rules instead of injecting a second copy.
import { afterEach, describe, expect, it, vi } from 'vitest';

function seedChunk(id: string, css: string): HTMLStyleElement {
	const tag = document.createElement('style');
	tag.setAttribute('data-octane', id);
	tag.textContent = css;
	document.head.appendChild(tag);
	return tag;
}

function engineCSS(): string {
	return Array.from(document.querySelectorAll('style[data-styled]'))
		.map((s) => s.textContent ?? '')
		.join('');
}

function resetDom(): void {
	document.querySelectorAll('style').forEach((s) => s.remove());
	document.body.innerHTML = '';
}

describe('hydration: adoption of server css chunks', () => {
	afterEach(() => {
		vi.resetModules();
		resetDom();
	});

	it('adopts styled/keyframes chunks at boot, removes them, and skips global/core tags', async () => {
		seedChunk('sc.hydrate-test-cid.hydname', '.hydname{color:navy;}');
		seedChunk('sc.sc-keyframes-tkf.tkfname', '@keyframes tkfname{0%{opacity:0;}}');
		seedChunk('sc.sc-global-abc.gname', 'body{--hydrate-marker:1;}');
		seedChunk('octanecorehash1', '.octane-core{color:red;}');

		// Importing the package constructs the main sheet, which runs the one-time
		// boot rehydration against the seeded head.
		const sc = await import('@octanejs/styled-components');

		expect(document.querySelector('style[data-octane="sc.hydrate-test-cid.hydname"]')).toBeNull();
		expect(document.querySelector('style[data-octane="sc.sc-keyframes-tkf.tkfname"]')).toBeNull();
		// createGlobalStyle chunks are swapped by their owning component pre-paint,
		// not at boot; octane-core scoped styles belong to the octane runtime.
		expect(document.querySelector('style[data-octane="sc.sc-global-abc.gname"]')).not.toBeNull();
		expect(document.querySelector('style[data-octane="octanecorehash1"]')).not.toBeNull();

		expect(sc.__PRIVATE__.mainSheet.hasNameForId('hydrate-test-cid', 'hydname')).toBe(true);
		expect(sc.__PRIVATE__.mainSheet.hasNameForId('sc-keyframes-tkf', 'tkfname')).toBe(true);
		expect(engineCSS()).toContain('color:navy');
		expect(engineCSS()).toContain('@keyframes tkfname');
	});

	it('does not re-inject rules the boot adoption already owns (no duplicates)', async () => {
		// Phase 1 — LEARN: render the probe on a clean client to capture the
		// deterministic generated class and css for a pinned componentId.
		const helpersA = await import('../../octane/tests/_helpers');
		const octaneA = await import('octane');
		const scA = await import('@octanejs/styled-components');
		const ProbeA = (scA.default as any).div.withConfig({ componentId: 'probe.hydrate-cid' })`
      color: teal;
      padding: 3px;
    `;
		const mA = helpersA.mount(() => octaneA.createElement(ProbeA, { id: 'probe' }));
		const classesA = (mA.find('#probe').getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
		const generated = classesA[classesA.length - 1];
		expect(generated).toBeTruthy();
		expect(engineCSS()).toContain('color:teal');
		mA.unmount();

		// Phase 2 — fresh module graph with the "server" chunk seeded in the head.
		vi.resetModules();
		resetDom();
		seedChunk(`sc.probe.hydrate-cid.${generated}`, `.${generated}{color:teal;padding:3px;}`);

		const helpersB = await import('../../octane/tests/_helpers');
		const octaneB = await import('octane');
		const scB = await import('@octanejs/styled-components');
		const ProbeB = (scB.default as any).div.withConfig({ componentId: 'probe.hydrate-cid' })`
      color: teal;
      padding: 3px;
    `;
		const mB = helpersB.mount(() => octaneB.createElement(ProbeB, { id: 'probe' }));

		// Same deterministic class; the adopted rule serves it — exactly one copy.
		expect(mB.find('#probe').getAttribute('class')).toContain(generated);
		const css = engineCSS();
		expect(css.split('color:teal').length - 1).toBe(1);
		// and the server chunk tag was consumed
		expect(document.querySelector('style[data-octane^="sc.probe.hydrate-cid."]')).toBeNull();
		mB.unmount();
	});
});
