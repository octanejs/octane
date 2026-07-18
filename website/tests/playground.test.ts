// Playground tests — the in-browser compile pipeline (the same
// `octane/compiler` call the page makes), the sandbox boundary's static shape,
// and the /playground route's static shell. The full editor/preview stack
// (CodeMirror + Shiki + sandboxed-iframe execution) is browser-only; the real
// browser hydration suite runs the default program and clicks its Increment
// button inside the opaque-origin frame.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from '../src/app/router.ts';
import {
	compilePlayground,
	createPreview,
	DEFAULT_SOURCES,
	PREVIEW_READY_TIMEOUT_MS,
	PREVIEW_RUN_TIMEOUT_MS,
} from '../src/lib/playground.ts';
import { PROTOCOL_KEY, sandboxSrcdoc } from '../src/lib/playground-sandbox.ts';
import {
	decodePlaygroundHash,
	encodePlaygroundHash,
	MAX_PLAYGROUND_HASH_LENGTH,
	MAX_PLAYGROUND_SOURCE_LENGTH,
	PLAYGROUND_SOURCE_LIMIT_ERROR,
} from '../src/lib/playground-hash.ts';

afterEach(cleanup);

async function renderRoute(url: string) {
	const router = makeRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return { router, ...utils };
}

describe('playground compile pipeline', () => {
	it('compiles the default TSRX source to client runtime code', () => {
		const result = compilePlayground(DEFAULT_SOURCES.tsrx, 'tsrx');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.warnings).toEqual([]);
			expect(result.code).toContain("from 'octane'");
			// The snippet's @for lowers to the runtime's keyed list block.
			expect(result.code).toContain('forBlock');
			// The scoped <style> block emits a CSS injection.
			expect(result.code).toContain('injectStyle');
		}
	});

	it('compiles the default TSX source to client runtime code', () => {
		const result = compilePlayground(DEFAULT_SOURCES.tsx, 'tsx');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.warnings).toEqual([]);
			expect(result.code).toContain("from 'octane'");
			// TS annotations must be gone — the playground executes this directly.
			expect(result.code).not.toContain('useState<');
		}
	});

	it('reports compile errors instead of throwing', () => {
		const result = compilePlayground('export function App() @{ <div>{oops</div> }', 'tsrx');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
	});

	it('returns nonfatal text-event diagnostics alongside runnable code', () => {
		const result = compilePlayground(
			`export function App() @{ <input onChange={() => {}} /> }`,
			'tsrx',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code.length).toBeGreaterThan(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({
			code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
			severity: 'warning',
			filename: 'playground.tsrx',
		});
	});

	it('keeps deliberate native text commits quiet when explicitly marked', () => {
		const result = compilePlayground(
			`export function App() @{ <input onChange={() => {}} suppressNativeChangeWarning /> }`,
			'tsrx',
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.warnings).toEqual([]);
	});
});

describe('playground shared-hash bounds', () => {
	it('round-trips a bounded source payload', () => {
		const source = 'export default function App() { return "✓"; }';
		const encoded = encodePlaygroundHash(source, 'tsx');
		expect(encoded.length).toBeGreaterThan(0);
		expect(decodePlaygroundHash(encoded)).toEqual({
			ok: true,
			value: { source, lang: 'tsx' },
		});
	});

	it('rejects an oversized encoded payload before base64 decoding', () => {
		const atobSpy = vi.spyOn(globalThis, 'atob');
		try {
			expect(decodePlaygroundHash('A'.repeat(MAX_PLAYGROUND_HASH_LENGTH + 1))).toEqual({
				ok: false,
				error: PLAYGROUND_SOURCE_LIMIT_ERROR,
			});
			expect(atobSpy).not.toHaveBeenCalled();
		} finally {
			atobSpy.mockRestore();
		}
	});

	it('rejects decoded source before it can reach CodeMirror or Shiki', () => {
		const payload = JSON.stringify({
			s: 'x'.repeat(MAX_PLAYGROUND_SOURCE_LENGTH + 1),
			l: 'tsrx',
		});
		const encoded = btoa(payload);
		expect(encoded.length).toBeLessThan(MAX_PLAYGROUND_HASH_LENGTH);
		expect(decodePlaygroundHash(encoded)).toEqual({
			ok: false,
			error: PLAYGROUND_SOURCE_LIMIT_ERROR,
		});
		expect(encodePlaygroundHash('x'.repeat(MAX_PLAYGROUND_SOURCE_LENGTH + 1), 'tsrx')).toBe('');
	});
});

describe('playground sandbox boundary', () => {
	it('srcdoc pins the security posture: opaque-origin CSP, no network, no form submission', () => {
		const srcdoc = sandboxSrcdoc();
		// One CSP meta owning the whole document.
		const csp = srcdoc.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
		expect(csp).toBeTruthy();
		// default-src 'none' is the deny-all baseline — user code can neither
		// fetch nor exfiltrate; blob: + inline scripts are the only execution.
		expect(csp).toContain("default-src 'none'");
		expect(csp).toContain("script-src 'unsafe-inline' blob:");
		expect(csp).toContain("form-action 'none'");
		expect(csp).toContain("base-uri 'none'");
	});

	it('createPreview mounts a sandboxed iframe WITHOUT allow-same-origin', () => {
		const host = document.createElement('div');
		document.body.appendChild(host);
		const preview = createPreview(host, () => {});
		try {
			const iframe = host.querySelector('iframe');
			expect(iframe).toBeTruthy();
			const sandbox = iframe!.getAttribute('sandbox') ?? '';
			// allow-scripts is required to run user code; allow-same-origin would
			// nullify the boundary entirely and must never appear.
			expect(sandbox.split(/\s+/)).toContain('allow-scripts');
			expect(sandbox).not.toContain('allow-same-origin');
			expect(iframe!.getAttribute('srcdoc')).toContain('Content-Security-Policy');
		} finally {
			preview.destroy();
			host.remove();
		}
		expect(host.querySelector('iframe')).toBeNull();
	});

	it('reports when the iframe never boots instead of leaving run pending', async () => {
		vi.useFakeTimers();
		const host = document.createElement('div');
		document.body.appendChild(host);
		const preview = createPreview(host, () => {});
		try {
			const result = preview.run('export default function App() {}');
			await vi.advanceTimersByTimeAsync(PREVIEW_READY_TIMEOUT_MS);
			await expect(result).resolves.toEqual({
				error:
					'Preview sandbox did not boot before the timeout (iframe scripts may be unavailable).',
			});
		} finally {
			preview.destroy();
			host.remove();
			vi.useRealTimers();
		}
	});

	it('reports when a ready iframe never returns a render result', async () => {
		vi.useFakeTimers();
		const host = document.createElement('div');
		document.body.appendChild(host);
		const preview = createPreview(host, () => {});
		try {
			const iframe = host.querySelector('iframe')!;
			window.dispatchEvent(
				new MessageEvent('message', {
					source: iframe.contentWindow,
					data: { [PROTOCOL_KEY]: true, type: 'ready' },
				}),
			);
			const result = preview.run('export default function App() {}');
			await vi.advanceTimersByTimeAsync(PREVIEW_RUN_TIMEOUT_MS);
			await expect(result).resolves.toEqual({
				error: 'Preview sandbox did not return a render result before the timeout.',
			});
		} finally {
			preview.destroy();
			host.remove();
			vi.useRealTimers();
		}
	});
});

describe('/playground route', () => {
	it('renders the shell: mode switch, view switch, and both panels', async () => {
		const { container } = await renderRoute('/playground');

		// Source-language switch (disabled until the editor stack boots).
		const langGroup = container.querySelector('[aria-label="Source language"]');
		const langButtons = Array.from(langGroup?.querySelectorAll('button') ?? []);
		expect(langButtons.map((b) => b.textContent?.trim())).toEqual(['TSRX', 'TSX']);

		// Result view switch — live preview vs compiled output.
		const viewGroup = container.querySelector('[aria-label="Result view"]');
		const viewButtons = Array.from(viewGroup?.querySelectorAll('button') ?? []);
		expect(viewButtons.map((b) => b.textContent?.trim())).toEqual(['Preview', 'Compiled output']);

		// Both panels exist; preview is the visible one by default.
		expect(container.querySelector('.pg-preview')).toBeTruthy();
		expect(container.querySelector('.pg-result')?.classList.contains('hidden')).toBe(false);
		expect(container.querySelectorAll('.pg-editor').length).toBe(2);

		// The mobile pane toggle exists (CSS shows it only under 980px).
		const paneGroup = container.querySelector('.pg-mobile-toggle');
		const paneButtons = Array.from(paneGroup?.querySelectorAll('button') ?? []);
		expect(paneButtons.map((b) => b.textContent?.trim())).toEqual(['Editor', 'Result']);

		// The nav carries the playground link.
		const navLink = Array.from(container.querySelectorAll('a.nav-link')).find(
			(a) => a.getAttribute('href') === '/playground',
		);
		expect(navLink).toBeTruthy();

		// The playground fills the viewport — the layout renders no footer here.
		expect(container.querySelector('footer')).toBeNull();
	});

	it('other routes keep the footer', async () => {
		const { container } = await renderRoute('/');
		expect(container.querySelector('footer')).toBeTruthy();
	});
});
