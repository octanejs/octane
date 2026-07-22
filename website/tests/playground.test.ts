// Playground tests — the in-browser compile pipeline (the same
// `octane/compiler` call the page makes), the sandbox boundary's static shape,
// and the /playground route's static shell. The full editor/preview stack
// (CodeMirror + Shiki + sandboxed-iframe execution) is browser-only; the real
// browser hydration suite runs the default program and clicks its Increment
// button inside the opaque-origin frame. The module-graph pipeline and the
// curated examples have their own files (playground-modules.test.ts,
// playground-examples.test.ts).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { getRouter } from '../src/router.ts';
import {
	compilePlayground,
	compileTypes,
	resolvePlaygroundError,
	createPreview,
	PREVIEW_READY_TIMEOUT_MS,
	PREVIEW_RUN_TIMEOUT_MS,
} from '../src/lib/playground.ts';
import { PROTOCOL_KEY, sandboxSrcdoc } from '../src/lib/playground-sandbox.ts';
import { DEFAULT_WORKSPACES } from '../src/lib/playground-examples.ts';
import {
	decodePlaygroundHash,
	encodePlaygroundHash,
	MAX_PLAYGROUND_FILES,
	MAX_PLAYGROUND_HASH_LENGTH,
	MAX_PLAYGROUND_SOURCE_LENGTH,
	PLAYGROUND_SOURCE_LIMIT_ERROR,
} from '../src/lib/playground-hash.ts';

afterEach(cleanup);

async function renderRoute(url: string) {
	const router = getRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return { router, ...utils };
}

describe('playground compile pipeline', () => {
	it('keeps an AST inspection error when the runnable graph succeeds', () => {
		expect(resolvePlaygroundError(null, 'AST generation failed: invalid output')).toBe(
			'AST generation failed: invalid output',
		);
		expect(resolvePlaygroundError('Module graph failed', 'AST generation failed')).toBe(
			'Module graph failed',
		);
	});

	it('compiles the default TSRX workspace to client runtime code', () => {
		const result = compilePlayground(DEFAULT_WORKSPACES.tsrx.files[0].source, 'App.tsrx');
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

	it('compiles the default TSX workspace to client runtime code', () => {
		const result = compilePlayground(DEFAULT_WORKSPACES.tsx.files[0].source, 'App.tsx');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.warnings).toEqual([]);
			expect(result.code).toContain("from 'octane'");
			// TS annotations must be gone — the playground executes this directly.
			expect(result.code).not.toContain('useState<');
		}
	});

	it('reports compile errors instead of throwing', () => {
		const result = compilePlayground('export function App() @{ <div>{oops</div> }', 'App.tsrx');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
	});

	it('returns nonfatal text-event diagnostics carrying the virtual file name', () => {
		const result = compilePlayground(
			`export function App() @{ <input onChange={() => {}} /> }`,
			'App.tsrx',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code.length).toBeGreaterThan(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({
			code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
			severity: 'warning',
			filename: 'App.tsrx',
		});
	});

	it('keeps deliberate native text commits quiet when explicitly marked', () => {
		const result = compilePlayground(
			`export function App() @{ <input onChange={() => {}} suppressNativeChangeWarning /> }`,
			'App.tsrx',
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.warnings).toEqual([]);
	});

	it('returns the source map alongside the compiled code', () => {
		const result = compilePlayground(DEFAULT_WORKSPACES.tsrx.files[0].source, 'App.tsrx');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect((result.map as { mappings?: unknown })?.mappings).toBeTypeOf('string');
		}
	});

	it('generates the typed virtual TSX for the default TSRX workspace', () => {
		const result = compileTypes(DEFAULT_WORKSPACES.tsrx.files[0].source, 'App.tsrx');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// The types view is the language-service TSX, not the runtime emit: the
		// @{ … } body desugars to an ordinary typed return.
		expect(result.code).toContain('/** @jsxImportSource octane */');
		expect(result.code).toContain('return');
		expect(result.code).not.toContain('@{');
		// Token mappings power source↔types navigation.
		expect(result.mappings.length).toBeGreaterThan(0);
	});

	it('never throws on broken sources in the types pipeline', () => {
		const result = compileTypes('export function App() @{ <div>{oops</div> }', 'App.tsrx');
		// Loose parsing may yield partial output or a reported failure — either
		// way the caller gets a result object, not an exception.
		expect(typeof result.ok).toBe('boolean');
	});
});

describe('playground shared-hash bounds', () => {
	it('round-trips a multi-file v2 payload', () => {
		const payload = {
			lang: 'tsrx' as const,
			entry: 'App.tsrx',
			files: [
				{ name: 'App.tsrx', source: "import { x } from './Data.tsrx';" },
				{ name: 'Data.tsrx', source: 'export const x = 1;' },
			],
		};
		const encoded = encodePlaygroundHash(payload);
		expect(encoded.length).toBeGreaterThan(0);
		expect(decodePlaygroundHash(encoded)).toEqual({ ok: true, value: payload });
	});

	it('round-trips a React-host file name', () => {
		const payload = {
			lang: 'tsrx' as const,
			entry: 'App.react.tsx',
			files: [
				{ name: 'App.react.tsx', source: 'export default function App() { return null; }' },
				{ name: 'Island.tsrx', source: 'export function Island() @{ <b>hi</b> }' },
			],
		};
		expect(decodePlaygroundHash(encodePlaygroundHash(payload))).toEqual({
			ok: true,
			value: payload,
		});
	});

	it('still decodes legacy single-file payloads as a one-file workspace', () => {
		const source = 'export default function App() { return "legacy"; }';
		const encoded = btoa(JSON.stringify({ s: source, l: 'tsx' }));
		expect(decodePlaygroundHash(encoded)).toEqual({
			ok: true,
			value: { lang: 'tsx', entry: 'App.tsx', files: [{ name: 'App.tsx', source }] },
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

	it('bounds the TOTAL source length across files', () => {
		const half = 'x'.repeat(MAX_PLAYGROUND_SOURCE_LENGTH / 2 + 1);
		const payload = {
			lang: 'tsrx' as const,
			entry: 'App.tsrx',
			files: [
				{ name: 'App.tsrx', source: half },
				{ name: 'Data.tsrx', source: half },
			],
		};
		expect(encodePlaygroundHash(payload)).toBe('');
		const encoded = btoa(
			JSON.stringify({
				v: 2,
				l: 'tsrx',
				e: 'App.tsrx',
				f: payload.files.map((f) => ({ n: f.name, s: f.source })),
			}),
		);
		expect(decodePlaygroundHash(encoded)).toEqual({
			ok: false,
			error: PLAYGROUND_SOURCE_LIMIT_ERROR,
		});
	});

	it('ignores payloads with invalid names, duplicates, a bad entry, or too many files', () => {
		const enc = (value: unknown) => btoa(JSON.stringify(value));
		const file = { n: 'App.tsrx', s: 'x' };
		// Path traversal / nested names never survive decoding.
		expect(
			decodePlaygroundHash(
				enc({ v: 2, l: 'tsrx', e: '../x.tsrx', f: [{ n: '../x.tsrx', s: '' }] }),
			),
		).toEqual({ ok: true, value: null });
		// Duplicate names.
		expect(decodePlaygroundHash(enc({ v: 2, l: 'tsrx', e: 'App.tsrx', f: [file, file] }))).toEqual({
			ok: true,
			value: null,
		});
		// Entry not among the files.
		expect(decodePlaygroundHash(enc({ v: 2, l: 'tsrx', e: 'Nope.tsrx', f: [file] }))).toEqual({
			ok: true,
			value: null,
		});
		// File-count bound.
		const many = Array.from({ length: MAX_PLAYGROUND_FILES + 1 }, (_, i) => ({
			n: `F${i}.tsrx`,
			s: '',
		}));
		expect(decodePlaygroundHash(enc({ v: 2, l: 'tsrx', e: 'F0.tsrx', f: many }))).toEqual({
			ok: true,
			value: null,
		});
	});
});

describe('playground sandbox boundary', () => {
	it('srcdoc pins the security posture: opaque-origin CSP, esm.sh-only module loads, no form submission', () => {
		const srcdoc = sandboxSrcdoc();
		// One CSP meta owning the whole document.
		const csp = srcdoc.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
		expect(csp).toBeTruthy();
		// default-src 'none' is the deny-all baseline — user code cannot fetch or
		// exfiltrate (connect-src falls back to it); the ONLY network the sandbox
		// permits is module loads from esm.sh via script-src.
		expect(csp).toContain("default-src 'none'");
		expect(csp).toContain("script-src 'unsafe-inline' blob: https://esm.sh");
		expect(csp).toContain("form-action 'none'");
		expect(csp).toContain("base-uri 'none'");
		expect(csp).not.toContain('connect-src');
	});

	it('theming the srcdoc never varies the security posture', () => {
		const dark = sandboxSrcdoc();
		const light = sandboxSrcdoc('light');
		// The theme only stamps the initial data-theme attribute on <html>…
		expect(dark).toContain('<html>');
		expect(light).toContain('<html data-theme="light">');
		// …the CSP is byte-identical either way.
		const cspOf = (srcdoc: string) =>
			srcdoc.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
		expect(cspOf(light)).toBe(cspOf(dark));
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

	const RUN_PAYLOAD = {
		entry: 'App.tsrx',
		entryKind: 'octane' as const,
		modules: [{ name: 'App.tsrx', code: 'export default function App() {}' }],
	};

	it('reports when the iframe never boots instead of leaving run pending', async () => {
		vi.useFakeTimers();
		const host = document.createElement('div');
		document.body.appendChild(host);
		const preview = createPreview(host, () => {});
		try {
			const result = preview.run(RUN_PAYLOAD);
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

	it('drops runtime errors from superseded runs but reports the current run’s', async () => {
		const runtimeErrors: string[] = [];
		const host = document.createElement('div');
		document.body.appendChild(host);
		const preview = createPreview(host, (message) => runtimeErrors.push(message));
		try {
			const iframe = host.querySelector('iframe')!;
			const fromSandbox = (data: Record<string, unknown>) => {
				window.dispatchEvent(
					new MessageEvent('message', {
						source: iframe.contentWindow,
						data: { [PROTOCOL_KEY]: true, ...data },
					}),
				);
			};
			fromSandbox({ type: 'ready' });
			const run = preview.run(RUN_PAYLOAD);
			// Let run() pass its internal ready-await before the sandbox replies.
			await new Promise((resolve) => setTimeout(resolve, 0));
			fromSandbox({ type: 'result', gen: 1, error: null });
			await expect(run).resolves.toEqual({ error: null });
			// A late error from an OLDER run (e.g. a timer firing after a
			// recompile) must not surface over the current run's clean render…
			fromSandbox({ type: 'runtime-error', gen: 0, error: 'stale island exploded' });
			expect(runtimeErrors).toEqual([]);
			// …while the current run's errors still do.
			fromSandbox({ type: 'runtime-error', gen: 1, error: 'live island exploded' });
			expect(runtimeErrors).toEqual(['live island exploded']);
		} finally {
			preview.destroy();
			host.remove();
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
			const result = preview.run(RUN_PAYLOAD);
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
	it('renders the shell: examples picker, mode/view switches, format button, and both panels', async () => {
		const { container } = await renderRoute('/playground');

		// Examples dropdown (disabled until the editor stack boots) with the
		// curated set grouped into optgroups.
		const select = container.querySelector('select.pg-select');
		expect(select).toBeTruthy();
		expect(select?.querySelectorAll('optgroup').length).toBeGreaterThan(2);
		expect(select?.querySelectorAll('option').length).toBeGreaterThan(10);

		// Source-language switch (disabled until the editor stack boots).
		const langGroup = container.querySelector('[aria-label="Source language"]');
		const langButtons = Array.from(langGroup?.querySelectorAll('button') ?? []);
		expect(langButtons.map((b) => b.textContent?.trim())).toEqual(['TSRX', 'TSX']);

		// Prettier format button.
		const format = container.querySelector('button.pg-format');
		expect(format?.textContent?.trim()).toBe('Format');

		// Result view switch — live preview vs compiled output.
		const viewGroup = container.querySelector('[aria-label="Result view"]');
		const viewButtons = Array.from(viewGroup?.querySelectorAll('button') ?? []);
		expect(viewButtons.map((b) => b.textContent?.trim())).toEqual(['Preview', 'Compiled']);

		// Both panels exist; preview is the visible one by default; the file tab
		// strip only appears for multi-file workspaces.
		expect(container.querySelector('.pg-preview')).toBeTruthy();
		expect(container.querySelector('.pg-result')?.classList.contains('hidden')).toBe(false);
		expect(container.querySelectorAll('.pg-editor').length).toBe(2);
		expect(container.querySelector('.pg-tabs')).toBeNull();

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
