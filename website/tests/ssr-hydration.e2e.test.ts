// @vitest-environment node

// Dev-SSR → real-browser hydration smoke — the seam every historical website
// breakage lived in (router-parity SSR regression, the 2026-07-08 bare-Symbol()
// slot regression) and the one the jsdom suites can't see: those client-render
// only, while `pnpm dev` server-renders each route with PROD-mode-compiled
// server modules and hydrates with DEV-mode client modules. This spec boots the
// REAL vite dev server, loads every route in headless Chromium, and fails on
// any hydration-mismatch warning or page error; then builds and repeats against
// the production Nitro preview server (prod output has no mismatch warnings
// — dev-gated — so there the gate is "no errors + routes render + client-side
// nav works + the playground compiles, runs, and handles an iframe event").
//
// Runs inside the website vitest project (playwright as a library). Chromium is
// a required prerequisite; CI installs it (see ci.yml), and local runs fail
// with the exact setup command when it is missing.
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { build } from 'esbuild';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { encodePlaygroundHash } from '../src/lib/playground-hash.ts';
import { PLAYGROUND_REACT_VERSION } from '../src/lib/playground-sandbox.ts';
import {
	getFreePort,
	spawnServer as spawnServerIn,
	stopServer,
	waitForReadyState,
	waitForServer,
} from './support/server-process.ts';

const WEBSITE = join(process.cwd(), 'website');
// The single budget for an ordinary "wait for this to appear" in this file.
//
// It is both the `page.setDefaultTimeout` value (so it covers every call that
// passes no timeout of its own — `.waitFor()`, `.textContent()`, `.click()`)
// and what the explicit waits pass, rather than each restating a literal. That
// matters because these cases run four-at-a-time against one shared preview
// server: at the old 10s, waits were measuring machine load rather than
// correctness, and a case with a 45s budget could still die after 10s because
// every wait inside it was implicitly capped.
//
// Deliberate outliers stay explicit and are NOT covered by this: waits that
// need longer than an ordinary one (30s), and the short ones that poll for a
// highlight to clear (5s) or read a single frame (1s).
const PLAYWRIGHT_ACTION_TIMEOUT = 20_000;
const PLAYWRIGHT_NAVIGATION_TIMEOUT = 15_000;
const REACT_CDN_ENTRY_PREFIX = 'octane-e2e-react-cdn:';
const REACT_CDN_ENTRIES = {
	[`react@${PLAYGROUND_REACT_VERSION}`]: 'react',
	[`react@${PLAYGROUND_REACT_VERSION}/jsx-runtime`]: 'react/jsx-runtime',
	[`react@${PLAYGROUND_REACT_VERSION}/jsx-dev-runtime`]: 'react/jsx-dev-runtime',
	[`react-dom@${PLAYGROUND_REACT_VERSION}`]: 'react-dom',
	[`react-dom@${PLAYGROUND_REACT_VERSION}/client`]: 'react-dom/client',
};
const ROUTES = [
	'/',
	'/docs',
	'/docs/cli',
	'/docs/core-apis',
	'/docs/tsrx-vs-tsx',
	'/docs/differences-from-react',
	'/docs/lynx',
	'/docs/react-compat',
	'/docs/profiling',
	'/docs/browser-support',
	'/docs/bindings',
	'/docs/bindings?q=TanStack%20Router&kind=binding#binding-tanstack-router',
	'/errors',
	'/errors/3?args%5B%5D=%22quoted%22',
	'/benchmarks',
	'/playground',
];

let reactCdnMirror: Promise<Map<string, Buffer>> | undefined;

// The playground deliberately points its opaque-origin iframe at esm.sh. Keep
// that production security boundary intact while making this behavioral test
// deterministic: Chromium still performs the real cross-origin module loads,
// but Playwright fulfills the React family from the workspace packages.
function getReactCdnMirror(): Promise<Map<string, Buffer>> {
	return (reactCdnMirror ??= buildReactCdnMirror());
}

async function buildReactCdnMirror(): Promise<Map<string, Buffer>> {
	const octaneRequire = createRequire(join(process.cwd(), 'packages/octane/package.json'));
	const outdir = join(process.cwd(), '.octane-e2e-react-cdn');
	const result = await build({
		absWorkingDir: process.cwd(),
		entryPoints: Object.fromEntries(
			Object.entries(REACT_CDN_ENTRIES).map(([cdnPath, packageSpecifier]) => [
				cdnPath,
				REACT_CDN_ENTRY_PREFIX + packageSpecifier,
			]),
		),
		bundle: true,
		chunkNames: 'chunks/[name]-[hash]',
		define: { 'process.env.NODE_ENV': '"production"' },
		entryNames: '[dir]/[name]',
		format: 'esm',
		outdir,
		platform: 'browser',
		plugins: [
			{
				name: 'workspace-react-cdn-entries',
				setup(esbuild) {
					esbuild.onResolve({ filter: /^octane-e2e-react-cdn:/ }, (args) => ({
						namespace: 'workspace-react-cdn-entry',
						path: args.path.slice(REACT_CDN_ENTRY_PREFIX.length),
					}));
					esbuild.onLoad({ filter: /.*/, namespace: 'workspace-react-cdn-entry' }, (args) => {
						const entryPath = octaneRequire.resolve(args.path);
						const exportNames = Object.keys(
							octaneRequire(args.path) as Record<string, unknown>,
						).filter((name) => /^[$A-Z_a-z][$\w]*$/.test(name) && name !== 'default');
						return {
							contents: [
								`import workspaceModule from ${JSON.stringify(entryPath)};`,
								'export default workspaceModule;',
								`export const { ${exportNames.join(', ')} } = workspaceModule;`,
							].join('\n'),
							loader: 'js',
							resolveDir: '/',
						};
					});
				},
			},
		],
		splitting: true,
		write: false,
	});

	const modules = new Map<string, Buffer>();
	for (const output of result.outputFiles) {
		const outputPath = relative(outdir, output.path).replaceAll('\\', '/');
		const requestPath = outputPath.startsWith('chunks/')
			? '/' + outputPath
			: '/' + outputPath.replace(/\.js$/, '');
		modules.set(requestPath, Buffer.from(output.contents));
	}
	return modules;
}

async function installReactCdnMirror(
	page: import('playwright').Page,
	errors: string[],
): Promise<void> {
	const modules = await getReactCdnMirror();
	await page.route('https://esm.sh/**', async (route) => {
		const url = new URL(route.request().url());
		const body = url.search === '' ? modules.get(url.pathname) : undefined;
		if (!body) {
			errors.push(`unexpected esm.sh request: ${url.pathname}${url.search}`);
			await route.abort('blockedbyclient');
			return;
		}
		await route.fulfill({
			body,
			headers: {
				'access-control-allow-origin': '*',
				'content-type': 'application/javascript; charset=utf-8',
			},
			status: 200,
		});
	});
}

// One shared browser for both the development and production passes.
let chromium: typeof import('playwright').chromium;
let browser: import('playwright').Browser;

beforeAll(async () => {
	try {
		({ chromium } = await import('playwright'));
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[ssr-hydration.e2e] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}
}, 60_000);

afterAll(async () => {
	await browser.close();
});

// This suite still owns its dev server; the production build and its preview
// server belong to the project (tests/setup/production-server.ts).
const spawnServer = (args: string[], env: NodeJS.ProcessEnv = {}): ChildProcess =>
	spawnServerIn(WEBSITE, args, env);

// Load `path`, collecting console errors and page errors. Interactive callers
// may also wait for the hydration entry's dynamic imports to go idle before the
// final two animation frames.
async function loadRoute(
	base: string,
	path: string,
	options: {
		beforeNavigation?: (page: import('playwright').Page, errors: string[]) => Promise<void>;
		waitForNetworkIdle?: boolean;
		// Deliberate outlier for a caller that knowingly pays a cold dev server's
		// on-demand compile, which is not an ordinary "wait for this to appear".
		timeout?: number;
	} = {},
) {
	const actionTimeout = options.timeout ?? PLAYWRIGHT_ACTION_TIMEOUT;
	const page = await browser!.newPage();
	page.setDefaultTimeout(actionTimeout);
	page.setDefaultNavigationTimeout(options.timeout ?? PLAYWRIGHT_NAVIGATION_TIMEOUT);
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
	try {
		await options.beforeNavigation?.(page, errors);
		await page.goto(base + path, { waitUntil: 'load' });
		// The dev server can replace the document AFTER `load`: Vite reloads the
		// page when a request resolves against a stale optimized-dependency hash,
		// which is its normal recovery, not something the caller asked about. That
		// destroys the execution context mid-read, so read the replacement instead
		// of reporting the teardown as a failure.
		for (let attempt = 0; ; attempt++) {
			try {
				if (options.waitForNetworkIdle) await page.waitForLoadState('networkidle');
				await page.waitForFunction(
					() =>
						new Promise<boolean>((resolve) =>
							requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
						),
					null,
					{ timeout: actionTimeout },
				);
				// Route preparation and a Vite recovery reload can both finish after
				// `load`. The behavioral boundary is route-owned DOM, not an arbitrary
				// two-frame delay. Wait for that boundary before reading the text; the
				// callers still assert the route rendered user-visible content.
				await page.waitForFunction(() => document.querySelector('main > *') !== null, null, {
					timeout: actionTimeout,
				});
				const main = (await page.evaluate(() => document.querySelector('main')?.textContent)) ?? '';
				return { page, errors, main };
			} catch (error) {
				const destroyed =
					error instanceof Error && error.message.includes('Execution context was destroyed');
				if (!destroyed || attempt === 2) throw error;
				await page.waitForLoadState('load');
			}
		}
	} catch (error) {
		await page.close().catch(() => {});
		throw error;
	}
}

interface RouteGeometry {
	bodyHeight: number;
	footerTop: number;
	explorerHeight: number | null;
	calloutHeight: number | null;
	calloutFollowingTop: number | null;
	searchWidth: number;
}

async function measureRouteGeometry(
	base: string,
	path: string,
	javaScriptEnabled: boolean,
): Promise<RouteGeometry> {
	const context = await browser.newContext({
		javaScriptEnabled,
		viewport: { width: 1440, height: 900 },
	});
	const page = await context.newPage();
	try {
		await page.goto(base + path, { waitUntil: 'load' });
		await page.evaluate(async (hydrated) => {
			await document.fonts.ready;
			if (!hydrated) return;
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			);
		}, javaScriptEnabled);
		return await page.evaluate(() => {
			const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
			const callout = document.querySelector('.doc-callout');
			const following = callout?.nextElementSibling?.getBoundingClientRect();
			return {
				bodyHeight: document.body.getBoundingClientRect().height,
				footerTop: rect('footer')?.top ?? -1,
				explorerHeight: rect('section.explorer .bx')?.height ?? null,
				calloutHeight: callout?.getBoundingClientRect().height ?? null,
				calloutFollowingTop: following?.top ?? null,
				searchWidth: rect('.search-trigger')?.width ?? -1,
			};
		});
	} finally {
		await context.close();
	}
}

async function waitForLocatorText(
	locator: import('playwright').Locator,
	expected: string,
	timeoutMs = PLAYWRIGHT_ACTION_TIMEOUT,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let last: string | undefined;
	// The per-read timeout must stay well under the caller's budget, and a read
	// that finds nothing yet must not end the wait. `textContent()` otherwise
	// inherits the page's default action timeout, so a caller asking for 20s died
	// after 10s with Playwright's own TimeoutError the first time the node was
	// not attached yet — the loop below never got a second iteration and the
	// extra budget was silently unreachable. Under concurrent load that is
	// exactly when a preview iframe needs the longer wait it was promised.
	while (Date.now() < deadline) {
		try {
			last = (await locator.textContent({ timeout: 1_000 }))?.trim();
			if (last === expected) return;
		} catch {
			// Not attached yet, or the frame is mid-navigation. Keep polling until
			// OUR deadline; a genuine failure still surfaces as the throw below.
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(
		`locator did not reach text ${JSON.stringify(expected)} within ${timeoutMs}ms ` +
			`(last observed: ${JSON.stringify(last)})`,
	);
}

// Exercise the same sample selector after dev and production hydration. The
// clipboard capture observes the public browser API without OS permissions.
async function assertHomepageIntegrationSamples(baseUrl: string) {
	const { page, errors } = await loadRoute(baseUrl, '/', {
		// The sample is already visible in SSR HTML. Let the hydration entry's
		// dynamic imports settle before the first single-shot interaction.
		waitForNetworkIdle: true,
		beforeNavigation: async (page) => {
			await page.addInitScript(() => {
				const writes: string[] = [];
				Object.defineProperty(window, 'integrationClipboardWrites', { value: writes });
				Object.defineProperty(navigator, 'clipboard', {
					configurable: true,
					value: {
						writeText: async (text: string) => {
							writes.push(text);
						},
					},
				});
			});
		},
	});
	try {
		const choices = page.getByRole('group', { name: 'React integration example' });
		const reactInOctane = choices.getByRole('button', { name: 'React in Octane', exact: true });
		const octaneInReact = choices.getByRole('button', { name: 'Octane in React', exact: true });
		const panel = page.locator('#compat-example');
		const code = panel.locator('pre code');
		const copy = panel.getByRole('button', { name: 'Copy the selected integration sample' });
		const copiedSamples: string[] = [];
		const pollOptions = { timeout: PLAYWRIGHT_ACTION_TIMEOUT };

		const readSelectedSample = async (reactSelected: boolean) => {
			await expect
				.poll(() => reactInOctane.getAttribute('aria-pressed'), pollOptions)
				.toBe(String(reactSelected));
			await expect
				.poll(() => octaneInReact.getAttribute('aria-pressed'), pollOptions)
				.toBe(String(!reactSelected));
			await expect
				.poll(() => panel.locator('.compat-code-name').innerText(), pollOptions)
				.toBe(reactSelected ? 'App.tsrx' : 'App.tsx');
			await code.waitFor({ state: 'visible' });
			const visibleCode = await code.innerText();
			expect(visibleCode).toContain(reactSelected ? '<ReactCompat>' : '<OctaneCompat>');
			return visibleCode;
		};
		const copySelectedSample = async () => {
			copiedSamples.push(await code.innerText());
			await copy.click();
			await expect
				.poll(
					() =>
						page.evaluate(
							() =>
								(window as Window & { integrationClipboardWrites?: string[] })
									.integrationClipboardWrites,
						),
					pollOptions,
				)
				.toEqual(copiedSamples);
			await expect.poll(() => copy.innerText(), pollOptions).toBe('Copied');
		};

		// The hero's visible console line is emitted by its mount effect, so it
		// proves this non-deferred homepage has committed instead of merely
		// displaying server markup. Do not retry the copy or selection actions.
		await expect
			.poll(() => page.getByRole('log').innerText(), pollOptions)
			.toContain('count is now 0');

		const reactSample = await readSelectedSample(true);
		await copySelectedSample();
		await octaneInReact.click();
		const octaneSample = await readSelectedSample(false);
		expect(octaneSample).not.toBe(reactSample);
		// Once the new code is visible, the old copy status must already be gone;
		// waiting for it could accidentally accept the previous sample's timer.
		expect(await copy.innerText()).toBe('Copy');
		await copySelectedSample();

		// Native buttons must activate from both keyboard gestures, not only a
		// pointer click. Returning to a sample also starts with fresh copy status.
		await reactInOctane.focus();
		await page.keyboard.press('Enter');
		expect(await readSelectedSample(true)).toBe(reactSample);
		expect(await copy.innerText()).toBe('Copy');
		await copySelectedSample();
		await octaneInReact.focus();
		await page.keyboard.press('Space');
		expect(await readSelectedSample(false)).toBe(octaneSample);
		expect(await copy.innerText()).toBe('Copy');
		// Match the adjacent interactive homepage checks: browser resource-load
		// diagnostics are separate from runtime, hydration, and page errors.
		const real = errors.filter((error) => !error.startsWith('Failed to load resource:'));
		expect(real).toEqual([]);
	} finally {
		await page.close();
	}
}

// The end-to-end contract behind the compiler's exact-origin channel, run
// against BOTH servers: the dev pipeline and the production build compile the
// playground through different toolchains, and this has to hold on each.
// Hovering a directive or clause keyword marks it in the SOURCE pane; clicking
// additionally takes the compiled pane to the code it lowered to, favouring the
// arm's implementation over the identifier that references it.
async function assertControlFlowKeywordMapping(baseUrl: string) {
	// The end-to-end contract behind the compiler's exact-origin channel:
	// hovering a directive or clause keyword in the source lights up the code
	// it lowered to. Asserted in the real browser because the mapping is only
	// half of it — the hover listener, the decoration dispatch and the
	// CodeMirror mark all have to hold up too.
	const { page, errors } = await loadRoute(baseUrl, '/playground');
	try {
		await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
		await page.locator('[aria-label="Result view"] button', { hasText: 'Compiled' }).click();
		const outputSelector = page.locator('[aria-label="Compiler output"]');

		// Hover a keyword in the SOURCE pane and read back what lit up in the
		// output pane. Offsets are found in the live document text, so this
		// tracks the example rather than hard-coded positions.
		// Put the pointer on a keyword in the SOURCE pane and report what the
		// output pane shows. `click` additionally asks to be taken there, which
		// is the only interaction allowed to move the output pane's scroll.
		// `nth` picks among repeats, negative counting from the end. An example
		// that introduces its own directives in a prose comment mentions each
		// one before using it, and a comment is correctly unmapped.
		const probeKeyword = async (keyword: string, action: 'hover' | 'click', nth = 0) => {
			const point = await page.evaluate(
				async ({ word, index }) => {
					const find = () => {
						const content = document.querySelectorAll('.pg-editor .cm-content')[0];
						const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
						const hits: { node: Node; at: number }[] = [];
						while (walker.nextNode()) {
							const node = walker.currentNode;
							const at = node.textContent!.indexOf(word);
							if (at !== -1) hits.push({ node, at });
						}
						return hits.at(index) ?? null;
					};
					const found = find();
					if (!found) return null;
					// CodeMirror renders only around its scroll position, so bring the
					// keyword into view — then let the scroll settle. CodeMirror
					// applies it in a DEFERRED measure phase, and a rect read in the
					// same tick belongs to the PRE-scroll layout, which puts the
					// pointer on whatever line has since moved into that spot.
					//
					// `behavior: 'instant'` is load-bearing: the site sets
					// `scroll-behavior: smooth` on <html> for readers who accept
					// motion (headless Chromium is one), scrollIntoView scrolls EVERY
					// ancestor scroller it touches, and an animating one is still
					// moving frames later — so the rect would be measured mid-flight.
					// It has to be `instant`, not `auto`: `auto` means "use the
					// computed scroll-behavior", which is the smooth one.
					(found.node.parentElement as HTMLElement)?.scrollIntoView({
						block: 'center',
						behavior: 'instant',
					});
					await new Promise((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(resolve)),
					);
					// Re-find after the flush: the re-render replaces the nodes the
					// first walk held.
					const hit = find();
					if (!hit) return null;
					const range = document.createRange();
					range.setStart(hit.node, hit.at + 1);
					range.setEnd(hit.node, hit.at + 2);
					const rect = range.getBoundingClientRect();
					return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
				},
				{ word: keyword, index: nth },
			);
			if (!point) return null;
			const before = await page.evaluate(
				() =>
					document.querySelectorAll('.pg-editor .cm-content')[1]?.closest('.cm-scroller')
						?.scrollTop ?? 0,
			);
			// A production output swap can finish rendering before CodeMirror's
			// hover listener is ready. Re-enter the editor on every retry so each
			// one produces a genuine pointer transition at THIS keyword.
			for (let attempt = 0; attempt < (action === 'hover' ? 3 : 1); attempt++) {
				if (action === 'click') await page.mouse.click(point.x, point.y);
				else {
					await page.mouse.move(0, 0);
					await page.mouse.move(point.x, point.y);
				}

				const highlighted = await page
					.waitForFunction(
						(text) =>
							Array.from(
								document
									.querySelectorAll('.pg-editor .cm-content')[0]
									?.querySelectorAll('.cm-mapped') ?? [],
							).some((mark) => mark.textContent === text),
						keyword,
						{ timeout: 2_000 },
					)
					.then(
						() => true,
						() => false,
					);
				if (highlighted) break;
			}
			return page.evaluate(
				({ previous, x, y }) => {
					const marks = (index: number) =>
						Array.from(
							document
								.querySelectorAll('.pg-editor .cm-content')
								[index]?.querySelectorAll('.cm-mapped') ?? [],
						).map((mark) => mark.textContent);
					const scroller = document
						.querySelectorAll('.pg-editor .cm-content')[1]
						?.closest('.cm-scroller');
					// Did the pane land on a DECLARATION of a mapped name rather than
					// on a reference to it? `null` when no mark is a declaration, so
					// the caller can skip the check.
					const content = document.querySelectorAll('.pg-editor .cm-content')[1];
					const box = scroller?.getBoundingClientRect();
					let declarationVisible: boolean | null = null;
					for (const mark of content?.querySelectorAll('.cm-mapped') ?? []) {
						const before = mark.previousSibling?.textContent ?? '';
						if (!/\b(?:function|const|let|var|class)\s+$/.test(before)) continue;
						declarationVisible ??= false;
						const rect = mark.getBoundingClientRect();
						if (box && rect.top >= box.top && rect.bottom <= box.bottom) {
							declarationVisible = true;
						}
					}
					// What the pointer actually landed on. A probe that marks nothing
					// is either a real mapping gap or a pointer that missed, and the
					// two are indistinguishable without this.
					const target = document.elementFromPoint(x, y);
					return {
						source: marks(0),
						output: marks(1),
						declarationVisible,
						scrolled: (scroller?.scrollTop ?? 0) !== previous,
						landedOn: target === null ? null : (target.textContent ?? '').slice(0, 24),
					};
				},
				{ previous: before, x: point.x, y: point.y },
			);
		};

		// CodeMirror only mounts the lines around its scroll position, and the
		// probes leave a pane deep in the document. Rewind it before waiting on
		// text from the top of the file, which is otherwise never mounted.
		// `0` is the source pane, `1` the output pane.
		const rewindPane = (pane: 0 | 1) =>
			page.evaluate((index) => {
				const scroller = document
					.querySelectorAll('.pg-editor .cm-content')
					[index]?.closest('.cm-scroller');
				if (scroller) scroller.scrollTop = 0;
			}, pane);

		for (const target of ['client', 'server']) {
			await outputSelector.selectOption(target);
			await page.waitForFunction(
				(mode) =>
					(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
						mode === 'server' ? "from 'octane/server'" : "from 'octane'",
					),
				target,
				{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
			);
			// HOVER first: the source keyword itself must light up in the left
			// pane. This is the feedback that tells you the position is mapped
			// at all, and it must not depend on where the right pane happens to
			// be scrolled.
			for (const keyword of ['@if', '@for', '@empty']) {
				const hovered = await probeKeyword(keyword, 'hover');
				expect(hovered, `${keyword} not found in the source pane`).not.toBeNull();
				expect(
					hovered!.source,
					`hovering ${keyword} in ${target} marked nothing in the SOURCE pane; the pointer landed on ${JSON.stringify(hovered!.landedOn)}`,
				).toContain(keyword);
				expect(hovered!.scrolled, `hovering ${keyword} scrolled the output pane`).toBe(false);
			}
			// A `<style>` block is erased from the markup: its CSS is scoped and
			// hoisted into a module-level injectStyle call. Hovering a rule
			// inside the block has to reach it — the whole block pairs with the
			// whole stylesheet, so a position in either one resolves.
			const styled = await probeKeyword('justify-items', 'hover');
			expect(styled, `no CSS rule found in the source pane`).not.toBeNull();
			const inside = (marks: (string | null)[]) =>
				marks.some((text) => text?.includes('justify-items'));
			expect(inside(styled!.source), `hovering a rule in ${target} marked no source`).toBe(true);
			expect(inside(styled!.output), `a rule in ${target} reached no injected CSS`).toBe(true);

			// The Counter example carries @if, @for and @empty. A directive lowers
			// to helpers far from the hovered line, so clicking is what brings
			// them into view — and is therefore what can be observed here.
			for (const keyword of ['@if', '@for', '@empty']) {
				const result = await probeKeyword(keyword, 'click');
				expect(result, `${keyword} not found in the source pane`).not.toBeNull();
				expect(
					result!.output.length,
					`${keyword} in ${target}: source ${JSON.stringify(result!.source)}, output ${JSON.stringify(result!.output)}`,
				).toBeGreaterThan(0);
				expect(result!.source).toContain(keyword);
				// Clicking navigates to the arm's IMPLEMENTATION when it has one.
				if (result!.declarationVisible !== null) {
					expect(
						result!.declarationVisible,
						`${keyword} in ${target} did not land on a declaration`,
					).toBe(true);
				}
			}
		}

		// The TYPES output is a third artifact — the type-only print's map rather
		// than the runtime emit's. A directive is lowered away there too, and the
		// transform's `inspect` flag anchors `@for` on the helper it became.
		await outputSelector.selectOption('types');
		await page.waitForFunction(
			() =>
				(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
					'@jsxImportSource',
				),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		for (const keyword of ['@if', '@for', '@empty']) {
			const typesClick = await probeKeyword(keyword, 'click');
			expect(typesClick, `${keyword} not found in the source pane`).not.toBeNull();
			expect(
				typesClick!.output.length,
				`${keyword} in types: source ${JSON.stringify(typesClick!.source)}, output ${JSON.stringify(typesClick!.output)}`,
			).toBeGreaterThan(0);
			const typesHover = await probeKeyword(keyword, 'hover');
			expect(
				typesHover!.source,
				`hovering ${keyword} in types marked nothing in the SOURCE pane`,
			).toContain(keyword);
			expect(typesHover!.scrolled, `hovering ${keyword} scrolled the types pane`).toBe(false);
		}
		await outputSelector.selectOption('client');

		// @switch / @case / @default live in a different example.
		await page.selectOption('.pg-select', 'inputs');
		await page.waitForFunction(
			() => (document.querySelectorAll('.cm-content')[0]?.textContent ?? '').includes('@switch'),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		await outputSelector.selectOption('client');
		// The clicks above left the output pane deep in the document, so rewind
		// it before waiting on the import header at the top of the emit.
		await rewindPane(1);
		await page.waitForFunction(
			() =>
				(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
					"from 'octane'",
				),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		// The same keywords in the TYPES output. `@switch`/`@case`/`@default`
		// survive the type-only transform as JavaScript, so the inspection entry
		// claims their exact keyword spans there too.
		await outputSelector.selectOption('types');
		await page.waitForFunction(
			() =>
				(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
					'@jsxImportSource',
				),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		for (const keyword of ['@case', '@default']) {
			const inTypes = await probeKeyword(keyword, 'click');
			expect(inTypes, `${keyword} not found in the source pane`).not.toBeNull();
			expect(
				inTypes!.output.length,
				`${keyword} in types: source ${JSON.stringify(inTypes!.source)}, output ${JSON.stringify(inTypes!.output)}`,
			).toBeGreaterThan(0);
			const hoveredInTypes = await probeKeyword(keyword, 'hover');
			expect(
				hoveredInTypes!.source,
				`hovering ${keyword} in types marked nothing in the SOURCE pane`,
			).toContain(keyword);
		}
		await outputSelector.selectOption('client');
		// The types probes just above scrolled the output pane past the import
		// header, and the switch back to `client` keeps that offset.
		await rewindPane(1);
		await page.waitForFunction(
			() =>
				(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
					"from 'octane'",
				),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);

		for (const keyword of ['@case', '@default']) {
			const result = await probeKeyword(keyword, 'click');
			expect(result, `${keyword} not found in the source pane`).not.toBeNull();
			expect(
				result!.output.length,
				`${keyword}: source ${JSON.stringify(result!.source)}, output ${JSON.stringify(result!.output)}`,
			).toBeGreaterThan(0);
		}

		// Hover marks the source side without moving the output pane — the
		// pointer must never steal the scroll position out from under you.
		// `@switch` is skipped: this example mentions it in a prose comment
		// first, and a comment is correctly unmapped.
		for (const keyword of ['@case', '@default']) {
			const hovered = await probeKeyword(keyword, 'hover');
			expect(hovered, `${keyword} not found`).not.toBeNull();
			expect(hovered!.scrolled, `hovering ${keyword} scrolled the output pane`).toBe(false);
			expect(hovered!.source, `hovering ${keyword} marked nothing in the source`).toContain(
				keyword,
			);
			// Diagnostic: whether the mapped output is VISIBLE without scrolling.
			console.log(
				`hover ${keyword}: source=${JSON.stringify(hovered!.source)} visibleOutput=${JSON.stringify(hovered!.output)}`,
			);
		}

		// `@try` and its clauses lower to boundary ELEMENTS in the type-only
		// output: `@try` names the boundary it became, and each clause names the
		// `fallback` prop it fills. They live in the Suspense example, whose
		// opening comment names all three before the block uses them — so probe
		// the LAST occurrence of each, which is the directive.
		await page.selectOption('.pg-select', 'suspense');
		await page.waitForFunction(
			() => (document.querySelectorAll('.cm-content')[0]?.textContent ?? '').includes('@pending'),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		await outputSelector.selectOption('types');
		await page.waitForFunction(
			() =>
				(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
					'@jsxImportSource',
				),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		for (const [keyword, expected] of [
			['@try', 'Suspense'],
			['@pending', 'fallback'],
			['@catch', 'fallback'],
		]) {
			const clicked = await probeKeyword(keyword, 'click', -1);
			expect(clicked, `${keyword} not found in the source pane`).not.toBeNull();
			expect(
				clicked!.output,
				`${keyword} in types: source ${JSON.stringify(clicked!.source)}`,
			).toContain(expected);
			const hovered = await probeKeyword(keyword, 'hover', -1);
			expect(
				hovered!.source,
				`hovering ${keyword} in types marked nothing in the SOURCE pane`,
			).toContain(keyword);
			expect(hovered!.scrolled, `hovering ${keyword} scrolled the types pane`).toBe(false);
		}

		// A STATIC attribute is baked into template markup and the template's
		// origins carry it. A dynamic one has no markup at all — `<form
		// action={fn}>` and `<input defaultValue={v}/>` survive only as a runtime
		// call, whose every token but the ones NAMING it maps to the value
		// expression. The compiler claims the authored name for those tokens, and
		// that claim is the whole reason hovering either one lights up.
		await page.selectOption('.pg-select', 'form-actions');
		await page.waitForFunction(
			() =>
				(document.querySelectorAll('.cm-content')[0]?.textContent ?? '').includes('useFormStatus'),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		// The probes above left the SOURCE pane scrolled deep into another example
		// — rewind so the whole form is inside the rendered range.
		await rewindPane(0);
		await page.waitForFunction(
			() =>
				(document.querySelectorAll('.cm-content')[0]?.textContent ?? '').includes('defaultValue'),
			null,
			{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
		);
		for (const target of ['client', 'server']) {
			await outputSelector.selectOption(target);
			await page.waitForFunction(
				(mode) =>
					(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
						mode === 'server' ? "from 'octane/server'" : "from 'octane'",
					),
				target,
				{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
			);
			// The example's opening comment writes `<form action={fn}>` before the
			// form uses it, so `action` is probed from the END; `defaultValue`
			// appears once.
			for (const [attribute, nth] of [
				['action', -1],
				['defaultValue', 0],
			] as const) {
				const hovered = await probeKeyword(attribute, 'hover', nth);
				expect(hovered, `${attribute} not found in the source pane`).not.toBeNull();
				expect(
					hovered!.source,
					`hovering ${attribute} in ${target} marked nothing in the SOURCE pane; the pointer landed on ${JSON.stringify(hovered!.landedOn)}`,
				).toContain(attribute);
				expect(hovered!.scrolled, `hovering ${attribute} scrolled the output pane`).toBe(false);

				// The call it lowered to sits far from the hovered line, so clicking
				// is what brings it into view.
				const clicked = await probeKeyword(attribute, 'click', nth);
				expect(
					clicked!.output.length,
					`${attribute} in ${target}: source ${JSON.stringify(clicked!.source)}, output ${JSON.stringify(clicked!.output)}`,
				).toBeGreaterThan(0);
			}
		}
		await outputSelector.selectOption('client');

		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}

// The SUITE is sequential but its cases are `it.concurrent`: every case opens
// its OWN page against one shared dev server, so they are independent of each
// other, while the suite boundary keeps this dev server's cold optimizeDeps boot
// from competing with the production suite's own concurrent load. (Marking the
// suites themselves concurrent runs both at once and times the dev boot out.)
// The single exception is the HMR case, which edits files on disk and is pinned
// `it.sequential` — declared last, it runs after the concurrent batch drains.
// maxConcurrency lives on the project config.
describe('website dev-SSR → hydration (real browser)', { concurrent: false }, () => {
	let server: ChildProcess;
	let DEV_PORT: number;

	beforeAll(async () => {
		if (!browser) return;
		// The production build is no longer awaited in globalSetup (it blocked the
		// whole run), so it can still be compiling right now. This boot deliberately
		// starts from a cold optimize-deps cache and is the most load-sensitive step
		// in the file — the same reason the two suites are sequential rather than
		// concurrent. Letting it race a full production build times it out. Waiting
		// restores the ordering globalSetup used to guarantee, without putting the
		// other ~90 projects back behind the build.
		await waitForReadyState(inject('productionReadyFile'), 460_000);
		DEV_PORT = await getFreePort();
		// Fresh optimize-deps cache → prove the declared dependency graph handles
		// a deterministic cold start without an "Outdated Optimize Dep" reload.
		rmSync(join(WEBSITE, 'node_modules/.vite'), { recursive: true, force: true });
		server = spawnServer([
			'exec',
			'vite',
			'--configLoader',
			'runner',
			'--port',
			String(DEV_PORT),
			'--strictPort',
		]);
		await waitForServer(server, `http://localhost:${DEV_PORT}/`, 60_000);
		// Answering a request does not mean the client module graph is compiled:
		// Vite transforms it on demand, and the route cases below run four-at-a-time.
		// Warm their route-specific graphs serially under the setup budget so the
		// assertion pass measures hydration correctness instead of concurrent dev
		// compilation. The fresh-cache contract remains covered because these loads
		// are the ones that pay for every transform before the ordinary 20s action
		// budget applies.
		for (const route of ROUTES) {
			const warmup = await loadRoute(`http://localhost:${DEV_PORT}`, route, {
				timeout: 120_000,
			});
			await warmup.page.close();
		}
		// Covers the production-build wait above, the cold dev boot, and the warm-up.
	}, 540_000);

	afterAll(async () => {
		await stopServer(server);
	});

	it.concurrent.for(ROUTES)(
		'%s hydrates with no mismatch and no page errors',
		{ timeout: 30_000 },
		async (route) => {
			const { page, errors, main } = await loadRoute(`http://localhost:${DEV_PORT}`, route);
			try {
				// Dev-compiled client warns on ANY hydration mismatch (recovery
				// rebuilds silently otherwise) — zero tolerance here.
				const real = errors.filter((e) => !e.includes('Failed to load resource'));
				expect(real).toEqual([]);
				expect(main.length).toBeGreaterThan(0);
			} finally {
				await page.close();
			}
		},
	);

	it.concurrent(
		'keeps command-palette results readable in a constrained viewport',
		{ timeout: 30_000 },
		async () => {
			const context = await browser.newContext({ viewport: { width: 746, height: 374 } });
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			page.on('pageerror', (error) => errors.push('pageerror: ' + String(error)));
			try {
				await page.goto(`http://localhost:${DEV_PORT}/docs/bindings`, {
					waitUntil: 'networkidle',
				});
				await page.keyboard.press('Control+K');
				await page.locator('.search-input').fill('tanstack');
				const firstResult = page.locator('.search-entity').first();
				await firstResult.waitFor();

				const geometry = await firstResult.evaluate((card) => {
					const cardBox = card.getBoundingClientRect();
					const contentBox = card.querySelector('.search-entity-primary')!.getBoundingClientRect();
					const board = card.parentElement!;
					return {
						boardIsScrollable: board.scrollHeight > board.clientHeight,
						cardBottom: cardBox.bottom,
						contentBottom: contentBox.bottom,
					};
				});

				expect(geometry.boardIsScrollable).toBe(true);
				expect(geometry.cardBottom).toBeGreaterThanOrEqual(geometry.contentBottom);
				expect(errors.filter((error) => !error.includes('Failed to load resource'))).toEqual([]);
			} finally {
				await context.close();
			}
		},
	);

	it.concurrent(
		'the homepage selects and copies the active React integration sample by pointer and keyboard',
		{ timeout: 45_000 },
		() => assertHomepageIntegrationSamples(`http://localhost:${DEV_PORT}`),
	);

	it.concurrent(
		'the homepage benchmark explorer preserves its complete SSR view through hydration',
		async () => {
			const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/');
			try {
				const explorer = page.locator('section.explorer .bx');
				await explorer.waitFor();

				// The bar chart and heatmap are already present in SSR output. Keeping them
				// through hydration prevents the large footer jump the fallback swap caused.
				expect(await page.locator('.bx-plot').count()).toBe(1);
				expect(await page.locator('.bx-heat').count()).toBe(1);
				expect(await page.locator('.bx-fallback-table').count()).toBe(0);

				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'the benchmark bar charts preserve their server geometry through hydration',
		async () => {
			const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/benchmarks');
			try {
				const plots = page.locator('.bench-card .bench-plot');
				const serverPlotCount = await plots.count();
				expect(serverPlotCount).toBeGreaterThan(0);
				const firstPlot = plots.first();
				const serverPlot = await firstPlot.elementHandle();
				expect(serverPlot).toBeTruthy();
				const geometry = await firstPlot.evaluate((plot) => ({
					bars: plot.querySelectorAll('.bench-fill').length,
					widths: Array.from(plot.querySelectorAll('.bench-fill'), (bar) =>
						bar.getAttribute('style'),
					),
				}));

				// Capture the server node and geometry above, then wait for the client
				// module graph and hydration commit before exercising delegated events.
				await page.waitForLoadState('networkidle');
				await page.waitForFunction(
					() =>
						new Promise<boolean>((resolve) =>
							requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
						),
					null,
					{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
				);

				expect(await page.locator('.recharts-wrapper').count()).toBe(0);
				expect(await page.locator('.bench-plot-shell').count()).toBe(0);
				expect(await plots.count()).toBe(serverPlotCount);
				// Hydration adopts the server-rendered chart node instead of replacing it.
				expect(
					await page.evaluate(
						(original) => document.querySelector('.bench-card .bench-plot') === original,
						serverPlot,
					),
				).toBe(true);
				expect(
					await firstPlot.evaluate((plot) => ({
						bars: plot.querySelectorAll('.bench-fill').length,
						widths: Array.from(plot.querySelectorAll('.bench-fill'), (bar) =>
							bar.getAttribute('style'),
						),
					})),
				).toEqual(geometry);
				expect(geometry.bars).toBeGreaterThan(0);

				// The adopted card is live: picking another operation flips the pressed
				// state of the picker it hydrated.
				const firstOps = page.locator('.bench-card').first().locator('.bench-op');
				await firstOps.nth(1).click();
				await page.waitForFunction(
					() =>
						document
							.querySelector('.bench-card .bench-op:nth-child(2)')
							?.getAttribute('aria-pressed') === 'true',
					null,
					{ timeout: 5_000 },
				);

				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'the Core APIs state, list, and search events work after hydration',
		async () => {
			const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/docs/core-apis', {
				waitForNetworkIdle: true,
			});
			try {
				const count = page.locator('.demo-count');
				await waitForLocatorText(count, '0');
				await page.getByRole('button', { name: 'Add one' }).click();
				await waitForLocatorText(count, '1');

				const packingDemo = page.locator('[data-demo="lists"]');
				const packingStatus = packingDemo.locator('.packing-summary');
				const passport = packingDemo.getByRole('checkbox', { name: 'Passport' });
				expect(await passport.isChecked()).toBe(false);
				expect(await packingDemo.getByRole('button', { name: /^(Pack|Unpack) / }).count()).toBe(0);
				await passport.check();
				await waitForLocatorText(packingStatus, '2 of 3 packed');
				expect(await passport.isChecked()).toBe(true);

				await passport.blur();
				await page.keyboard.press('/');
				expect(await page.evaluate(() => document.activeElement?.id)).toBe('core-api-search');

				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'the Core APIs async data and transition demos work after hydration',
		async () => {
			const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/docs/core-apis', {
				waitForNetworkIdle: true,
			});
			try {
				await page.getByRole('button', { name: 'Load profile' }).click();
				await waitForLocatorText(
					page.locator('[data-demo="data"] .data-loading'),
					'Loading profile…',
				);
				await waitForLocatorText(
					page.locator('[data-demo="data"] .profile-card strong'),
					'Ada Lovelace',
				);

				const transitionDemo = page.locator('[data-demo="transition"]');
				const overviewTab = transitionDemo.getByRole('tab', { name: 'Overview' });
				const activityTab = transitionDemo.getByRole('tab', { name: 'Activity' });
				const deploymentsTab = transitionDemo.getByRole('tab', { name: 'Deployments' });
				expect(await overviewTab.getAttribute('aria-selected')).toBe('true');
				expect(await overviewTab.evaluate((tab) => getComputedStyle(tab).backgroundColor)).not.toBe(
					await activityTab.evaluate((tab) => getComputedStyle(tab).backgroundColor),
				);
				await activityTab.click();
				await waitForLocatorText(
					transitionDemo.locator('.transition-status'),
					'Loading Activity — Overview stays on screen.',
				);
				expect(await transitionDemo.locator('[data-report]').getAttribute('data-report')).toBe(
					'overview',
				);
				expect(await activityTab.evaluate((tab) => getComputedStyle(tab).backgroundColor)).not.toBe(
					await deploymentsTab.evaluate((tab) => getComputedStyle(tab).backgroundColor),
				);
				await transitionDemo.locator('[data-report="activity"]').waitFor();
				await waitForLocatorText(
					transitionDemo.locator('.transition-status'),
					'Activity is ready.',
				);
				expect(await activityTab.getAttribute('aria-selected')).toBe('true');
				expect(await activityTab.evaluate((tab) => getComputedStyle(tab).backgroundColor)).not.toBe(
					await overviewTab.evaluate((tab) => getComputedStyle(tab).backgroundColor),
				);

				const deferredDemo = page.locator('[data-demo="deferred-value"]');
				await deferredDemo.getByRole('searchbox', { name: 'Search products' }).fill('camera');
				await deferredDemo.locator('.search-updating').waitFor();
				expect(await deferredDemo.locator('.product-result').count()).toBe(6);
				await page.waitForFunction(
					() =>
						document.querySelectorAll('[data-demo="deferred-value"] .product-result').length === 2,
				);
				expect(await deferredDemo.locator('.product-result').allTextContents()).toEqual([
					'Pocket cameraCategory: Photography',
					'Camera shoulder bagCategory: Photography',
				]);

				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'the Core APIs form and portal events work after hydration',
		async () => {
			const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/docs/core-apis', {
				waitForNetworkIdle: true,
			});
			try {
				await page.locator('#core-api-profile-name').fill('Grace Hopper');
				await page.getByRole('button', { name: 'Save name' }).click();
				await waitForLocatorText(
					page.locator('[data-demo="form"] button[type="submit"]'),
					'Saving…',
				);
				await waitForLocatorText(
					page.locator('[data-demo="form"] .form-result'),
					'Saved Grace Hopper.',
				);

				const portalDemo = page.locator('[data-demo="portal"]');
				await portalDemo.getByRole('button', { name: 'Show saved toast' }).click();
				const portalToast = portalDemo.locator('.portal-demo-toast');
				await portalToast.waitFor();
				expect(await portalToast.evaluate((toast) => getComputedStyle(toast).display)).toBe('flex');
				expect(
					await portalDemo.evaluate((root) => {
						const toast = root.querySelector('.portal-demo-toast');
						return {
							inTarget: root.querySelector('.portal-demo-layer')?.contains(toast) ?? false,
							inLogicalParent: root.querySelector('.portal-demo-parent')?.contains(toast) ?? false,
						};
					}),
				).toEqual({ inTarget: true, inLogicalParent: false });
				await portalToast.getByRole('button', { name: 'Dismiss' }).click();
				await waitForLocatorText(
					portalDemo.locator('.portal-demo-result'),
					'Clicks observed by the logical parent: 1',
				);

				expect(await page.locator('.api-index-card li > p').count()).toBe(0);
				const badgeColors = await page
					.locator('.api-index-card li > code')
					.evaluateAll((badges) => badges.map((badge) => getComputedStyle(badge).color));
				expect(new Set(badgeColors).size).toBe(1);

				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'the embedded View Transitions controls run native transitions after hydration',
		async () => {
			const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/docs/core-apis', {
				waitForNetworkIdle: true,
			});
			try {
				const demo = page.locator('[data-demo="view-transitions"]');
				const supported = await page.evaluate(
					() => typeof (document as any).startViewTransition === 'function',
				);
				expect(supported).toBe(true);

				// Wrap the native API before the first hydrated interaction so this observes
				// Octane's controller without replacing Chromium's snapshots or animations.
				await page.evaluate(() => {
					const original = (document as any).startViewTransition.bind(document);
					(window as any).__octaneViewTransitionCalls = 0;
					(window as any).__octaneViewTransitionFinished = Promise.resolve();
					(document as any).startViewTransition = (update: unknown) => {
						(window as any).__octaneViewTransitionCalls++;
						const transition = original(update);
						(window as any).__octaneViewTransitionFinished = transition.finished;
						return transition;
					};
				});

				const finishTransition = async (expectedCalls: number) => {
					await page.waitForFunction(
						(expected) => (window as any).__octaneViewTransitionCalls === expected,
						expectedCalls,
					);
					await page.evaluate(() => (window as any).__octaneViewTransitionFinished);
				};

				const cardToggle = demo.locator('#vt-toggle-card');
				await cardToggle.click();
				await waitForLocatorText(cardToggle, 'Add card');
				await finishTransition(1);

				await demo.locator('#vt-toggle-hero').click();
				await demo.locator('.vtdemo-hero-big').waitFor();
				await finishTransition(2);

				await demo.getByRole('tab', { name: 'Details' }).click();
				await waitForLocatorText(demo.locator('.vtdemo-panel'), 'Details');
				await finishTransition(3);

				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'resets a new documentation page to the top without animating from the old section',
		async () => {
			const { page, errors } = await loadRoute(
				`http://localhost:${DEV_PORT}`,
				'/docs/build-tools',
				{
					waitForNetworkIdle: true,
				},
			);
			try {
				await page.click('.on-this-page a[href="#renderer-targets"]');
				await page.waitForFunction(
					() =>
						location.hash === '#renderer-targets' &&
						Math.abs(
							window.scrollY - (document.documentElement.scrollHeight - window.innerHeight),
						) < 2,
					null,
					{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
				);
				expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);

				await page.click('.sidebar-link[href="/docs/quick-start"]');
				await page.waitForFunction(
					() =>
						location.pathname === '/docs/quick-start' &&
						document.querySelector('.prose h1')?.textContent === 'Quick start',
					null,
					{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
				);

				// The new document is already at its initial position on its first
				// rendered frame; it must not animate upward from the old page's anchor.
				expect(await page.evaluate(() => scrollY)).toBe(0);
				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'cancels a deferred mobile section jump when another docs page wins',
		async () => {
			const { page, errors } = await loadRoute(
				`http://localhost:${DEV_PORT}`,
				'/docs/build-tools',
				{
					waitForNetworkIdle: true,
				},
			);
			try {
				await page.setViewportSize({ width: 390, height: 667 });
				await page.click('.sidebar-mobile-toggle');
				await page.waitForFunction(
					() =>
						document.querySelector('.sidebar-mobile-toggle')?.getAttribute('aria-expanded') ===
							'true' &&
						getComputedStyle(document.querySelector('.sidebar-panel')!).visibility === 'visible',
				);

				await page.click('.on-this-page a[href="#rspack"]');
				// The first click intentionally starts collapsing the mobile panel. Fire
				// the competing Link activation through the DOM so this cancellation
				// test does not race Playwright's hit-testing against that CSS animation.
				await page.locator('.sidebar-link[href="/docs/quick-start"]').dispatchEvent('click');
				await page.waitForFunction(
					() =>
						location.pathname === '/docs/quick-start' &&
						document.querySelector('.prose h1')?.textContent === 'Quick start',
					null,
					{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
				);

				// Let the superseded panel-close promise settle. It must not append the
				// old page's section hash or move the replacement document afterward.
				await page.waitForTimeout(400);
				expect(await page.evaluate(() => location.hash)).toBe('');
				expect(await page.evaluate(() => scrollY)).toBe(0);
				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'keeps the mobile docs menu anchored and scrollable when expanded',
		async () => {
			const { page, errors } = await loadRoute(
				`http://localhost:${DEV_PORT}`,
				'/docs/build-tools',
				{
					waitForNetworkIdle: true,
				},
			);
			try {
				await page.setViewportSize({ width: 390, height: 667 });
				await page.evaluate(
					() =>
						new Promise<void>((resolve) =>
							requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
						),
				);

				await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
				const closed = await page.evaluate(() => {
					const header = document.querySelector<HTMLElement>('.topnav')!;
					const sidebar = document.querySelector<HTMLElement>('.sidebar')!;
					return {
						expanded: document
							.querySelector('.sidebar-mobile-toggle')!
							.getAttribute('aria-expanded'),
						headerBottom: header.getBoundingClientRect().bottom,
						position: getComputedStyle(sidebar).position,
						sidebarTop: sidebar.getBoundingClientRect().top,
					};
				});
				expect(closed.expanded).toBe('false');
				expect(closed.position).toBe('sticky');
				expect(Math.abs(closed.sidebarTop - closed.headerBottom)).toBeLessThanOrEqual(2);

				await page.click('.sidebar-mobile-toggle');
				await page.waitForFunction(
					() => {
						const header = document.querySelector('.topnav')!.getBoundingClientRect();
						const sidebar = document.querySelector<HTMLElement>('.sidebar')!;
						const panel = document.querySelector('.sidebar-panel')!.getBoundingClientRect();
						const panelInner = document.querySelector<HTMLElement>('.sidebar-panel-inner')!;
						const sidebarRect = sidebar.getBoundingClientRect();
						const panelMaxHeight = Number.parseFloat(getComputedStyle(panelInner).maxHeight);
						return (
							document.querySelector('.sidebar-mobile-toggle')?.getAttribute('aria-expanded') ===
								'true' &&
							getComputedStyle(sidebar).position === 'sticky' &&
							Math.abs(sidebarRect.top - header.bottom) <= 2 &&
							Math.abs(panel.top - sidebarRect.bottom) <= 2 &&
							panel.bottom <= innerHeight + 1 &&
							getComputedStyle(panelInner).overflowY === 'auto' &&
							panelInner.clientHeight >= panelMaxHeight - 2 &&
							panelInner.scrollHeight > panelInner.clientHeight
						);
					},
					null,
					{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
				);
				expect(await page.evaluate(() => scrollY)).toBe(900);

				await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
				const anchoredOpen = await page.evaluate(() => {
					const header = document.querySelector('.topnav')!.getBoundingClientRect();
					const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect();
					const panel = document.querySelector('.sidebar-panel')!.getBoundingClientRect();
					return {
						headerBottom: header.bottom,
						sidebarTop: sidebar.top,
						sidebarBottom: sidebar.bottom,
						panelTop: panel.top,
					};
				});
				expect(Math.abs(anchoredOpen.sidebarTop - anchoredOpen.headerBottom)).toBeLessThanOrEqual(
					2,
				);
				expect(Math.abs(anchoredOpen.panelTop - anchoredOpen.sidebarBottom)).toBeLessThanOrEqual(2);

				await page.click('.on-this-page a[href="#rspack"]');
				await page.waitForFunction(
					() => {
						const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect();
						const panel = document.querySelector<HTMLElement>('.sidebar-panel')!;
						const panelInner = document
							.querySelector('.sidebar-panel-inner')!
							.getBoundingClientRect();
						const target = document.querySelector('#rspack')!.getBoundingClientRect();
						return (
							location.hash === '#rspack' &&
							document.querySelector('.sidebar-mobile-toggle')?.getAttribute('aria-expanded') ===
								'false' &&
							getComputedStyle(panel).visibility === 'hidden' &&
							panelInner.height < 1 &&
							target.top >= sidebar.bottom + 8 &&
							target.top <= sidebar.bottom + 30
						);
					},
					null,
					{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
				);
				// The clicked row must remain current after the scroll-spy's post-scroll
				// settle window releases its temporary click lock.
				await page.waitForTimeout(400);
				expect(
					await page.locator('.on-this-page a[href="#rspack"]').getAttribute('aria-current'),
				).toBe('true');
				const real = errors.filter((error) => !error.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'the first router event after hydration does not remount the app',
		async () => {
			const { page, errors } = await loadRoute(`http://localhost:${DEV_PORT}`, '/', {
				waitForNetworkIdle: true,
			});
			try {
				// Let hydrateStart's post-networkidle tail (router match commit +
				// hydrateRoot) finish before firing the event.
				await page.waitForTimeout(500);
				// A hash replaceState is the smallest router event: it reloads and bumps
				// the router's loadedAt without changing matches. The hydrated tree must
				// update in place — a remount would replace every DOM node (and lose all
				// component state) on the first interaction after page load.
				const survived = await page.evaluate(async () => {
					const router = (window as any).__TSR_ROUTER__;
					const before = router.stores.loadedAt.get() as number;
					const header = document.querySelector('header');
					const main = document.querySelector('main');
					history.replaceState(history.state, '', '#post-hydration');
					// Positive control: the router must actually process the event —
					// without this the assertion could pass vacuously (event fired
					// before the router subscribed to history).
					const deadline = Date.now() + 5000;
					while (router.stores.loadedAt.get() === before && Date.now() < deadline) {
						await new Promise((resolve) => setTimeout(resolve, 25));
					}
					await new Promise((resolve) => setTimeout(resolve, 100));
					return {
						processed: router.stores.loadedAt.get() !== before,
						header: document.querySelector('header') === header,
						main: document.querySelector('main') === main,
					};
				});
				expect(survived).toEqual({ processed: true, header: true, main: true });
				const real = errors.filter((e) => !e.includes('Failed to load resource'));
				expect(real).toEqual([]);
			} finally {
				await page.close();
			}
		},
		30_000,
	);

	it.concurrent(
		'playground highlights every control-flow keyword in the compiled code',
		async () => {
			await assertControlFlowKeywordMapping(`http://localhost:${DEV_PORT}`);
		},
		45_000,
	);

	// Editing a route and the router invalidates both the client and SSR module
	// graphs. A full reload on that hot server must still hydrate through one
	// current router graph. Keep this last: Vite's cache-busting timestamps stay
	// in the server graph for the rest of its lifetime.
	//
	// `sequential` is load-bearing, not stylistic: this is the only case that
	// edits files on disk, so it would corrupt any sibling sharing the dev server.
	// Declared last, it runs once the concurrent batch above has drained.
	it(
		'hydrates cleanly on reload after HMR edits (hot server)',
		{ concurrent: false, timeout: 45_000 },
		async () => {
			const files = [
				join(WEBSITE, 'src/pages/benchmarks/Benchmarks.tsrx'),
				join(WEBSITE, 'src/router.ts'),
			];
			const originals = files.map((f) => readFileSync(f, 'utf8'));
			const restore = () => files.forEach((f, i) => writeFileSync(f, originals[i]));
			try {
				// Prime the dev server's client + SSR module graphs and keep the page —
				// with its live HMR websocket — OPEN while editing (the editing-session
				// shape: the route is on screen while its files are edited). A plain
				// navigation: this first visit may race Vite's dependency-optimization
				// reload, which is irrelevant to the assertion below.
				const primer = await browser.newPage();
				await primer.goto(`http://localhost:${DEV_PORT}/benchmarks`, { waitUntil: 'networkidle' });

				// Touch each file — every write triggers the paired `(client) hmr
				// update` / full-reload + `(ssr) page reload` invalidations.
				for (let i = 0; i < files.length; i++) {
					writeFileSync(files[i], originals[i] + `\n// e2e-hmr-touch ${i}\n`);
					await new Promise((r) => setTimeout(r, 700));
				}
				restore();
				await new Promise((r) => setTimeout(r, 700));
				await primer.close();

				// A FULL reload after the edits must hydrate the route cleanly. Let the
				// module fetches and Start router load finish before judging —
				// hydration (and its mismatch warnings) lands well after `load` here.
				const { page, errors, main } = await loadRoute(
					`http://localhost:${DEV_PORT}`,
					'/benchmarks',
				);
				try {
					await page.waitForLoadState('networkidle');
					await page.waitForTimeout(500);
					const real = errors.filter((e) => !e.includes('Failed to load resource'));
					expect(real).toEqual([]);
					expect(main).toContain('Benchmark');
				} finally {
					await page.close();
				}
			} finally {
				restore();
			}
		},
	);
});

// The build and preview server are the project's, not this suite's: see
// tests/setup/production-server.ts. One build now feeds both this pass and the
// HTTP-level ssr-smoke spec.
// Sequential suite, `it.concurrent` cases — same shape and same reason as the
// dev suite above: page-per-case against one shared server, nothing here writes
// to disk.
describe(
	'website production build → hydration (Nitro Vercel preview)',
	{ concurrent: false },
	() => {
		const PREVIEW_ORIGIN = inject('productionOrigin');
		const outputDir = inject('productionOutputDir');

		// The setup starts the build in the background so the rest of the suite does
		// not queue behind it; the origin is reserved but not yet answering when this
		// module loads, and `outputDir` is not populated either. Both the browser
		// cases and the Build Output assertions need it finished.
		beforeAll(() => waitForReadyState(inject('productionReadyFile'), 460_000));

		it.concurrent('emits the Vercel Build Output API contract', () => {
			const config = JSON.parse(readFileSync(join(outputDir, 'config.json'), 'utf8')) as {
				version?: number;
				routes?: Array<{
					src?: string;
					dest?: string;
					handle?: string;
					continue?: boolean;
					headers?: Record<string, string>;
				}>;
			};
			const routes = config.routes ?? [];
			const assetsIndex = routes.findIndex(
				(route) =>
					route.src?.startsWith('/assets/') &&
					route.headers?.['cache-control'] === 'public,max-age=31536000,immutable' &&
					route.continue === true,
			);
			const filesystemIndex = routes.findIndex((route) => route.handle === 'filesystem');
			const serverFallbackIndex = routes.findIndex(
				(route) => route.src === '/(.*)' && route.dest === '/__server',
			);

			expect(config.version).toBe(3);
			expect(assetsIndex).toBeGreaterThanOrEqual(0);
			expect(filesystemIndex).toBeGreaterThan(assetsIndex);
			expect(serverFallbackIndex).toBeGreaterThan(filesystemIndex);
			expect(existsSync(join(outputDir, 'static/playground-runtime.json'))).toBe(true);
			expect(existsSync(join(outputDir, 'functions/__server.func/index.mjs'))).toBe(true);

			const functionConfig = JSON.parse(
				readFileSync(join(outputDir, 'functions/__server.func/.vc-config.json'), 'utf8'),
			) as { runtime?: string; supportsResponseStreaming?: boolean };
			expect(functionConfig.runtime).toBe('nodejs24.x');
			expect(functionConfig.supportsResponseStreaming).toBe(true);
		});

		it.concurrent.for(ROUTES)(
			'%s renders and runs with no errors',
			{ timeout: 30_000 },
			async (route) => {
				const { page, errors, main } = await loadRoute(PREVIEW_ORIGIN, route);
				try {
					expect(errors).toEqual([]);
					expect(main.length).toBeGreaterThan(0);
				} finally {
					await page.close();
				}
			},
		);

		it.concurrent(
			'the homepage selects and copies the active React integration sample by pointer and keyboard',
			{ timeout: 45_000 },
			() => assertHomepageIntegrationSamples(PREVIEW_ORIGIN),
		);

		it.concurrent(
			'ecosystem directory preserves filter edits through browser history',
			{ timeout: 30_000 },
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/docs/bindings', {
					waitForNetworkIdle: true,
				});
				try {
					const kind = page.locator('#ecosystem-kind');
					const category = page.locator('#ecosystem-category');
					const initialHistoryLength = await page.evaluate(() => history.length);
					await kind.selectOption('binding');
					await page.waitForFunction(
						() => new URL(location.href).searchParams.get('kind') === 'binding',
					);
					expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength + 1);
					await category.selectOption('state-management');
					await page.waitForFunction(
						() => new URL(location.href).searchParams.get('category') === 'state-management',
					);
					expect(await page.evaluate(() => history.length)).toBe(initialHistoryLength + 2);
					expect(await page.locator('#binding-zustand').count()).toBe(1);

					await page.goBack();
					await page.waitForFunction(() => !new URL(location.href).searchParams.has('category'));
					expect(await kind.inputValue()).toBe('binding');
					expect(await category.inputValue()).toBe('');

					await page.goBack();
					await page.waitForFunction(() => !new URL(location.href).searchParams.has('kind'));
					expect(await kind.inputValue()).toBe('');

					await page.goForward();
					await page.waitForFunction(
						() => new URL(location.href).searchParams.get('kind') === 'binding',
					);
					expect(await kind.inputValue()).toBe('binding');

					await page.getByRole('button', { name: 'Reset search and filters' }).click();
					await page.waitForFunction(() => new URL(location.href).search === '');
					await page.goBack();
					await page.waitForFunction(
						() => new URL(location.href).searchParams.get('kind') === 'binding',
					);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
		);

		it.concurrent(
			'keeps both Lynx example panes readable beside the desktop docs sidebar',
			{ timeout: 30_000 },
			async () => {
				const context = await browser.newContext({ viewport: { width: 801, height: 900 } });
				const page = await context.newPage();
				const errors: string[] = [];
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				page.on('pageerror', (error) => errors.push('pageerror: ' + String(error)));
				try {
					await page.goto(PREVIEW_ORIGIN + '/docs/lynx', { waitUntil: 'load' });
					const panel = page.locator('.go').first();
					await panel.scrollIntoViewIfNeeded();
					const geometry = await panel.evaluate((element) => ({
						code: element.querySelector('.go-code')!.getBoundingClientRect().width,
						preview: element.querySelector('.go-preview')!.getBoundingClientRect().width,
					}));

					// At 801px the desktop docs sidebar leaves the example narrow enough
					// that it must stack before either pane falls below its readable minimum.
					expect(geometry.code).toBeGreaterThanOrEqual(200);
					expect(geometry.preview).toBeGreaterThanOrEqual(260);
					expect(errors).toEqual([]);
				} finally {
					await context.close();
				}
			},
		);

		it.concurrent(
			'keeps no-JS SSR and hydrated layout geometry identical',
			{ timeout: 30_000 },
			async () => {
				const base = PREVIEW_ORIGIN;
				for (const route of ['/', '/docs', '/docs/core-apis']) {
					const noJs = await measureRouteGeometry(base, route, false);
					const hydrated = await measureRouteGeometry(base, route, true);
					for (const key of Object.keys(noJs) as (keyof RouteGeometry)[]) {
						const serverValue = noJs[key];
						const clientValue = hydrated[key];
						if (serverValue === null || clientValue === null) {
							expect(clientValue, `${route} ${key}`).toBe(serverValue);
						} else {
							expect(Math.abs(clientValue - serverValue), `${route} ${key}`).toBeLessThan(1);
						}
					}
				}
			},
		);

		it.concurrent(
			'client-side navigation does not start resources owned by the outgoing route',
			{ timeout: 30_000 },
			async () => {
				const outgoingLynxRequests: string[] = [];
				let navigating = false;
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/', {
					beforeNavigation: async (page) => {
						await page.route(/\/assets\/benchmarks-[^/]+\.js$/, async (route) => {
							await new Promise((resolve) => setTimeout(resolve, 500));
							await route.continue();
						});
						page.on('request', (request) => {
							const pathname = new URL(request.url()).pathname;
							if (navigating && pathname.startsWith('/lynx-examples/')) {
								outgoingLynxRequests.push(pathname);
							}
						});
					},
				});
				try {
					navigating = true;
					await page.click('a.nav-link[href="/benchmarks"]');
					await page.waitForFunction(() => location.pathname === '/benchmarks', null, {
						timeout: PLAYWRIGHT_ACTION_TIMEOUT,
					});
					await page.waitForFunction(
						() => document.querySelector('main .benchpage') !== null,
						null,
						{
							timeout: PLAYWRIGHT_ACTION_TIMEOUT,
						},
					);
					expect(outgoingLynxRequests).toEqual([]);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
		);

		it.concurrent(
			'late Lynx metadata cannot mount a preview after navigation starts',
			{ timeout: 30_000 },
			async () => {
				const outgoingLynxRequests: string[] = [];
				let navigating = false;
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/', {
					beforeNavigation: async (page) => {
						await page.addInitScript(() => {
							const originalFetch = window.fetch.bind(window);
							// Return a settled metadata response, then hold its JSON completion so
							// the route can become inactive before the consumer resumes.
							const metadataReleases: Array<() => void> = [];
							const gate = window as Window & {
								pendingLynxMetadata?: () => number;
								releaseLynxMetadata?: () => void;
							};
							gate.pendingLynxMetadata = () => metadataReleases.length;
							gate.releaseLynxMetadata = () => {
								for (const release of metadataReleases.splice(0)) release();
							};
							window.fetch = (...args) => {
								const input = args[0];
								const url = input instanceof Request ? input.url : String(input);
								if (!new URL(url, location.href).pathname.endsWith('/example-metadata.json')) {
									return originalFetch(...args);
								}
								return Promise.resolve({
									ok: true,
									status: 200,
									json: () =>
										new Promise((resolve) => {
											metadataReleases.push(() =>
												resolve({
													name: 'test',
													files: [],
													templateFiles: [
														{
															name: 'main',
															file: 'dist/main.bundle',
															webFile: 'dist/main.web.bundle',
														},
													],
												}),
											);
										}),
								} as Response);
							};
						});
						await page.route(/\/assets\/benchmarks-[^/]+\.js$/, async (route) => {
							await new Promise((resolve) => setTimeout(resolve, 1_000));
							await route.continue();
						});
						page.on('request', (request) => {
							const pathname = new URL(request.url()).pathname;
							if (navigating && pathname.startsWith('/lynx-examples/')) {
								outgoingLynxRequests.push(pathname);
							}
						});
					},
				});
				try {
					await page.locator('section.lynx').scrollIntoViewIfNeeded();
					await page.waitForFunction(
						() => {
							const pending = (window as Window & { pendingLynxMetadata?: () => number })
								.pendingLynxMetadata;
							return pending !== undefined && pending() > 0;
						},
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					navigating = true;
					await page.click('a.nav-link[href="/benchmarks"]');
					await page.waitForFunction(() => location.pathname === '/benchmarks', null, {
						timeout: PLAYWRIGHT_ACTION_TIMEOUT,
					});
					await page.evaluate(() => {
						(window as Window & { releaseLynxMetadata?: () => void }).releaseLynxMetadata?.();
					});
					await page.waitForFunction(
						() => document.querySelector('main .benchpage') !== null,
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					expect(outgoingLynxRequests).toEqual([]);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
		);

		it.concurrent(
			'playground compiles, runs, and handles an event inside its sandbox',
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground');
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					const preview = page.frameLocator('iframe[title="Playground preview"]');
					const heading = preview.locator('h2');
					await waitForLocatorText(heading, 'Count: 0');
					await preview.getByRole('button', { name: 'Increment' }).click();
					await waitForLocatorText(heading, 'Count: 1');
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			30_000,
		);

		it.concurrent(
			'playground reveals and pins source AST ranges from the mobile controls',
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground');
				try {
					await page.setViewportSize({ width: 390, height: 667 });
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					const source = page.locator('.pg-panel[aria-label="Source editor"] .cm-content');
					// Mobile reflow can move fixed coordinates onto whitespace. Select
					// the visible useState call so Inspect always has a real AST range.
					await source.getByText('useState', { exact: true }).nth(1).click();
					await page.locator('.pg-mobile-toggle button', { hasText: 'Inspect' }).click();
					// Inspect opens the compiled CODE view, same as desktop; the AST is
					// one switch away, and switching reveals what the editor selected.
					await page.locator('[aria-label="Output format"] button', { hasText: 'AST' }).click();
					// Browsers may deliver the source editor's mouseleave after its mobile
					// panel is hidden. It must not clear the AST node we just revealed.
					await source.dispatchEvent('mouseleave');

					const leaf = page.locator('.pg-ast-node[data-ast-leaf="true"]');
					await leaf.waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await leaf.locator(':scope > details > summary').click();
					await page.waitForFunction(
						() => !!document.querySelector('.pg-ast-node[data-ast-pinned="true"]'),
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);

					await page.locator('.pg-mobile-toggle button', { hasText: 'Code' }).click();
					await page.locator('.pg-panel[aria-label="Source editor"]').waitFor();
					// CodeMirror may split one logical marked range across lines and
					// syntax spans. The observable contract is that the pinned source
					// range remains visibly highlighted after returning to the editor.
					await page.waitForFunction(
						() =>
							Array.from(
								document.querySelectorAll('.pg-panel[aria-label="Source editor"] .cm-mapped'),
							).some(
								(mark) => getComputedStyle(mark).backgroundColor === 'rgba(255, 234, 0, 0.42)',
							),
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			45_000,
		);

		it.concurrent(
			'playground selects client, server, types, and parsed code or AST output',
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground');
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					const outputIncludes = (needle: string) =>
						page.waitForFunction(
							(text) =>
								(
									document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? ''
								).includes(text),
							needle,
							{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
						);
					// Click the Nth occurrence of a token inside an editor pane (Shiki
					// splits tokens into their own spans, so search per text node). The
					// rect is measured after a double rAF: CodeMirror applies a prior
					// reveal's scroll in a DEFERRED measure phase, and clicking a rect
					// captured before that flush lands on whatever scrolled into the
					// stale coordinates (a CI-speed flake). A token outside the
					// scroller's visible box resolves null instead of clicking through.
					const tokenPoint = async (paneIndex: number, token: string, occurrence: number) => {
						const point = await page.evaluate(
							([index, needle, wanted]) =>
								new Promise<{ x: number; y: number } | null>((resolve) =>
									requestAnimationFrame(() =>
										requestAnimationFrame(() => {
											const content =
												document.querySelectorAll('.pg-editor .cm-content')[index as number];
											const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
											let seen = 0;
											while (walker.nextNode()) {
												const node = walker.currentNode;
												let at = -1;
												while ((at = node.textContent!.indexOf(needle as string, at + 1)) !== -1) {
													if (++seen < (wanted as number)) continue;
													const range = document.createRange();
													range.setStart(node, at + 1);
													range.setEnd(node, at + 2);
													const rect = range.getBoundingClientRect();
													const scroller = content.closest('.cm-scroller')!.getBoundingClientRect();
													if (rect.top < scroller.top || rect.bottom > scroller.bottom) {
														return resolve(null);
													}
													return resolve({
														x: rect.x + rect.width / 2,
														y: rect.y + rect.height / 2,
													});
												}
											}
											resolve(null);
										}),
									),
								),
							[paneIndex, token, occurrence] as const,
						);
						expect(
							point,
							`${token} (occurrence ${occurrence}) not visible in pane ${paneIndex}`,
						).not.toBeNull();
						return point!;
					};
					// CodeMirror renders only the lines around its scroll position, so a
					// token scrolled far out of view is not in the DOM to be found at all.
					// Rewind the pane before hunting for one.
					const rewindPane = (paneIndex: number) =>
						page.evaluate((index) => {
							const scroller = document
								.querySelectorAll('.pg-editor .cm-content')
								[index as number]?.closest('.cm-scroller');
							if (scroller) scroller.scrollTop = 0;
						}, paneIndex);
					const clickToken = async (paneIndex: number, token: string, occurrence: number) => {
						const point = await tokenPoint(paneIndex, token, occurrence);
						await page.mouse.click(point.x, point.y);
					};
					const hoverToken = async (paneIndex: number, token: string, occurrence: number) => {
						const point = await tokenPoint(paneIndex, token, occurrence);
						await page.mouse.move(point.x, point.y);
					};
					// One authored range can emit several times (a mount and an update
					// binding, an open and a close tag), so assert that the token IS
					// highlighted rather than that it is the first highlight.
					const mappedAnywhere = (paneIndex: number, token: string) =>
						page.waitForFunction(
							([index, text]) =>
								Array.from(
									document
										.querySelectorAll('.pg-editor .cm-content')
										[index as number]?.querySelectorAll('.cm-mapped') ?? [],
								).some((mark) => mark.textContent === text),
							[paneIndex, token] as const,
							{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
						);
					const mappedIn = (paneIndex: number, token: string) =>
						page.waitForFunction(
							([index, text]) =>
								document
									.querySelectorAll('.pg-editor .cm-content')
									[index as number]?.querySelector('.cm-mapped')?.textContent === text,
							[paneIndex, token] as const,
							{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
						);
					// Client code is the default compiled artifact. Server and Types use
					// the same output selector; Parsed exists only for AST inspection.
					await page.locator('[aria-label="Result view"] button', { hasText: 'Compiled' }).click();
					const outputSelector = page.locator('[aria-label="Compiler output"]');
					const outputFormat = page.locator('[aria-label="Output format"]');
					await outputIncludes("from 'octane'");
					expect(await outputSelector.inputValue()).toBe('client');
					expect(await outputSelector.locator('option').allTextContents()).toEqual([
						'Client',
						'Server',
						'Types',
					]);
					expect(await outputFormat.locator('button.active', { hasText: 'Code' }).count()).toBe(1);
					// Client and Server code map through the compiler's inspection
					// segments, the same as Types does through the Volar token map. WHICH
					// nodes resolve is pinned per node, against the same Counter example,
					// in playground-mapping.test.ts; what this proves is that the wiring
					// reaches the runtime targets at all.
					await clickToken(0, 'useState', 2); // the useState(0) call, not the import
					await mappedAnywhere(1, 'useState');
					await mappedAnywhere(0, 'useState');
					await outputSelector.selectOption('server');
					await outputIncludes("from 'octane/server'");
					await clickToken(0, 'useState', 2);
					await mappedAnywhere(1, 'useState');
					await outputSelector.selectOption('types');
					await outputIncludes('@jsxImportSource octane');
					await rewindPane(1);
					// Clicking a source token reveals the mapped token in Types code…
					await clickToken(0, 'useState', 2); // the useState(0) call, not the import
					await mappedIn(1, 'useState');
					// …and hovering the output maps back into the source too.
					await hoverToken(1, 'setCount', 1);
					await mappedIn(0, 'setCount');
					await mappedIn(1, 'setCount');
					// Clicking keeps that bidirectional mapping and scrolls it into view.
					await clickToken(1, 'setCount', 1);
					await mappedIn(0, 'setCount');

					await outputFormat.locator('button', { hasText: 'AST' }).click();
					await page.locator('.pg-ast-tree').waitFor();
					expect(await outputSelector.locator('option').allTextContents()).toEqual([
						'Client',
						'Server',
						'Types',
						'Parsed',
					]);
					// The Types AST reveals the deepest node containing the cursor.
					await clickToken(0, 'useState', 2);
					await page.waitForFunction(
						() => !!document.querySelector('.pg-ast-node[data-ast-leaf="true"]'),
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					expect(await page.locator('.pg-ast-status').textContent()).toMatch(/\[(\d+), (\d+)\)/);
					expect(await page.locator('.cm-mapped').count()).toBe(1);
					await page.waitForFunction(
						() =>
							getComputedStyle(document.querySelector('.pg-editor .cm-mapped')!).backgroundColor ===
							'rgba(255, 234, 0, 0.42)',
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					// Client AST exposes the final Program plus template IR. Template
					// origins keep the selected static tag in authored-source coordinates.
					await outputSelector.selectOption('client');
					await hoverToken(0, 'button', 1);
					await mappedIn(0, 'button');
					// Switching output re-renders the tree, which resets the status to the
					// node-less `label · filename` form. The source highlight and the AST
					// selection are separate effects of the same hover, so waiting on the
					// editor mark alone can observe the status before the node resolves.
					// The leaf marker is written by the same call that writes the range.
					await page.waitForFunction(
						() => !!document.querySelector('.pg-ast-node[data-ast-leaf="true"]'),
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					expect(await page.locator('.pg-ast-status').textContent()).toMatch(/\[(\d+), (\d+)\)/);
					await outputSelector.selectOption('server');
					await page
						.getByText('The final server-rendering Program. Tap a node to pin its highlight.')
						.waitFor();
					await outputSelector.selectOption('source');
					await page
						.getByText('The parser tree for the authored source. Tap a node to pin its highlight.')
						.waitFor();
					// Parsed has no code form, so switching to Code falls back to the
					// most common output: Client.
					await outputFormat.locator('button', { hasText: 'Code' }).click();
					expect(await outputSelector.inputValue()).toBe('client');
					expect(await outputSelector.locator('option', { hasText: 'Parsed' }).count()).toBe(0);
					await outputIncludes("from 'octane'");
					// A cached Types document must not retain an AST source highlight.
					await outputSelector.selectOption('types');
					await page.waitForFunction(() => !document.querySelector('.pg-editor .cm-mapped'), null, {
						timeout: 5_000,
					});
					// Switching to Preview clears every mark; Compiled returns clean.
					await page.locator('[aria-label="Result view"] button', { hasText: 'Preview' }).click();
					await page.waitForFunction(() => !document.querySelector('.pg-editor .cm-mapped'), null, {
						timeout: 5_000,
					});
					await page.locator('[aria-label="Result view"] button', { hasText: 'Compiled' }).click();
					await outputIncludes('@jsxImportSource octane');
					// A broken edit clears both marks and replaces the typed document
					// with the current parser error instead of leaving stale output.
					await clickToken(0, 'useState', 2);
					await mappedIn(1, 'useState');
					await page.keyboard.type('{');
					await page.locator('.pg-error').waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await page.waitForFunction(
						() => {
							const out = document.querySelectorAll('.pg-editor .cm-content')[1];
							return (
								!!out &&
								!out.querySelector('.cm-mapped') &&
								(out.textContent ?? '').includes('// Types generation failed:')
							);
						},
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					// A failed AST generation replaces the prior tree and cannot map
					// source hover through its stale ranges.
					await outputFormat.locator('button', { hasText: 'AST' }).click();
					await page
						.getByText('AST generation failed. Fix the source to generate a new tree.')
						.waitFor();
					expect(await page.locator('.pg-ast-tree').count()).toBe(0);
					await hoverToken(0, 'import', 1);
					await page.waitForFunction(() => !document.querySelector('.pg-editor .cm-mapped'), null, {
						timeout: 5_000,
					});
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			45_000,
		);

		it.concurrent(
			'playground keeps both panel heads the same height in every mode',
			async () => {
				// The compiled pane's head carries a select and a segmented control; the
				// source pane's carries text. Letting the taller one size the row makes
				// the layout jump on every Preview↔Compiled switch, so both reserve that
				// height from the start.
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground');
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					const heights = () =>
						page.evaluate(() =>
							Array.from(document.querySelectorAll('.pg-panel-head')).map((head) =>
								Math.round(head.getBoundingClientRect().height),
							),
						);
					const inPreview = await heights();
					expect(inPreview.length).toBe(2);
					expect(inPreview[0], `preview heads differ: ${JSON.stringify(inPreview)}`).toBe(
						inPreview[1],
					);

					await page.locator('[aria-label="Result view"] button', { hasText: 'Compiled' }).click();
					await page.locator('[aria-label="Compiler output"]').waitFor();
					const inCompiled = await heights();
					expect(inCompiled[0], `compiled heads differ: ${JSON.stringify(inCompiled)}`).toBe(
						inCompiled[1],
					);
					// And switching modes must not resize the row at all.
					expect(inCompiled).toEqual(inPreview);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			45_000,
		);

		it.concurrent(
			'playground highlights every control-flow keyword in the compiled code',
			async () => {
				await assertControlFlowKeywordMapping(PREVIEW_ORIGIN);
			},
			45_000,
		);

		// A hover highlight has to survive the compile that finishes AFTER it.
		// `.pg-grid.ready` goes up while compileAndRun is still awaiting its module
		// graph, so the compile's showOutput() lands a few hundred milliseconds into
		// an interactive pane — with a pointer possibly already resting on a mapped
		// keyword. showOutput() used to clear the mark pair unconditionally, before
		// deciding the artifact was unchanged and returning without touching a
		// document; since only mousemove restores marks and the pointer never moved,
		// the highlight stayed gone until the reader jiggled the mouse. Hold the
		// pointer still across that window and require the mark to still be there.
		it.concurrent(
			'playground keeps a hover highlight through the compile that follows it',
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground');
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await page.locator('[aria-label="Result view"] button', { hasText: 'Compiled' }).click();

					const marked = () =>
						page.evaluate(() =>
							Array.from(
								document
									.querySelectorAll('.pg-editor .cm-content')[0]
									?.querySelectorAll('.cm-mapped') ?? [],
							).map((mark) => mark.textContent),
						);
					const point = await page.evaluate(async () => {
						const find = () => {
							const content = document.querySelectorAll('.pg-editor .cm-content')[0];
							const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
							while (walker.nextNode()) {
								const at = walker.currentNode.textContent!.indexOf('@if');
								if (at !== -1) return { node: walker.currentNode, at };
							}
							return null;
						};
						if (!find()) return null;
						(find()!.node.parentElement as HTMLElement)?.scrollIntoView({
							block: 'center',
							behavior: 'instant',
						});
						await new Promise((resolve) =>
							requestAnimationFrame(() => requestAnimationFrame(resolve)),
						);
						const hit = find();
						if (!hit) return null;
						const range = document.createRange();
						range.setStart(hit.node, hit.at + 1);
						range.setEnd(hit.node, hit.at + 2);
						const rect = range.getBoundingClientRect();
						return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
					});
					expect(point, '@if not found in the source pane').not.toBeNull();

					await page.mouse.move(0, 0);
					await page.mouse.move(point!.x, point!.y);
					await page.waitForFunction(
						() =>
							Array.from(
								document
									.querySelectorAll('.pg-editor .cm-content')[0]
									?.querySelectorAll('.cm-mapped') ?? [],
							).some((mark) => mark.textContent === '@if'),
						null,
						{ timeout: 5_000 },
					);

					// Comfortably past the observed clear window (~150-750ms after hover),
					// with the pointer untouched.
					await page.waitForTimeout(1_500);
					expect(
						await marked(),
						'the hover highlight was cleared while the pointer never moved',
					).toContain('@if');
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			30_000,
		);

		it.concurrent(
			'playground refreshes the active AST when another workspace file fails',
			async () => {
				const appSource =
					"import { value } from './Value';\nexport default function App() @{ <p>{'Value: ' + value}</p> }";
				const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
				const hash = encodePlaygroundHash({
					lang: 'tsrx',
					entry: 'App.tsrx',
					files: [
						{
							name: 'App.tsrx',
							source: appSource,
						},
						{ name: 'Value.tsrx', source: 'export const value = 1;' },
					],
				});
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, `/playground#${hash}`);
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await page.locator('[aria-label="Result view"] button', { hasText: 'Compiled' }).click();
					await page.locator('[aria-label="Output format"] button', { hasText: 'AST' }).click();
					await page.locator('.pg-ast-tree').waitFor();

					// Break an inactive dependency so the runnable module graph fails.
					await page.locator('.pg-tab', { hasText: 'Value.tsrx' }).click();
					await page.locator('.pg-editor .cm-content').first().click();
					await page.keyboard.press(selectAll);
					await page.keyboard.type('export const value = ;');
					await page.locator('.pg-error').waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });

					// The active App source still has a valid compiler AST. Editing it
					// briefly invalidates the tree, then must restore it even though the
					// dependency keeps the module graph in its failed state.
					await page.locator('.pg-tab', { hasText: 'App.tsrx' }).click();
					await page.locator('.pg-ast-tree').waitFor();
					await page.locator('.pg-editor .cm-content').first().click();
					await page.keyboard.press(selectAll);
					await page.keyboard.type(appSource + '\n');
					await page
						.getByText('Waiting for the next successful compile…')
						.waitFor({ timeout: 5_000 });
					await page.locator('.pg-ast-tree').waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					expect(await page.locator('.pg-error').count()).toBe(1);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			30_000,
		);

		it.concurrent(
			'playground shows compiler warnings without treating runnable code as an error',
			async () => {
				const source = `export function App() @{ <input onChange={() => {}} /> }`;
				const hash = encodePlaygroundHash({
					lang: 'tsrx',
					entry: 'App.tsrx',
					files: [{ name: 'App.tsrx', source }],
				});
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, `/playground#${hash}`);
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					const warnings = page.getByRole('region', { name: 'Compiler warnings' });
					await warnings.waitFor();
					expect(await warnings.textContent()).toContain('OCTANE_NATIVE_TEXT_ONCHANGE');
					expect(await warnings.textContent()).toContain('App.tsrx:1:');
					expect(await page.locator('.pg-error').count()).toBe(0);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			30_000,
		);

		it.concurrent(
			'playground runs a multi-file example selected from the dropdown',
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground');
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					// The tab strip is absent for the single-file default…
					expect(await page.locator('.pg-tabs').count()).toBe(0);
					await page.selectOption('.pg-select', 'parallel-use');
					// …and appears with one tab per virtual file for the example.
					await page
						.locator('.pg-tab', { hasText: 'Data.tsrx' })
						.waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					const preview = page.frameLocator('iframe[title="Playground preview"]');
					// Both fake fetches resolve through the sibling module (no network).
					await preview
						.locator('body')
						.getByText('City: Reykjavík (1)')
						.waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					// Switching tabs swaps the editor buffer to the sibling file.
					await page.locator('.pg-tab', { hasText: 'Data.tsrx' }).click();
					await page.waitForFunction(
						() =>
							document
								.querySelector('.pg-editor .cm-content')
								?.textContent?.includes('fetchForecast') ?? false,
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			45_000,
		);

		it.concurrent(
			'playground Format button reprints the active file with Prettier',
			async () => {
				const source = `export default function App() @{ <button onClick={()=>{}}>go</button> }`;
				const hash = encodePlaygroundHash({
					lang: 'tsrx',
					entry: 'App.tsrx',
					files: [{ name: 'App.tsrx', source }],
				});
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, `/playground#${hash}`);
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await page.click('.pg-format');
					// Prettier normalizes the squashed arrow — formatting works even while
					// the shared payload is still consent-gated (it never executes code).
					await page.waitForFunction(
						() =>
							document
								.querySelector('.pg-editor .cm-content')
								?.textContent?.includes('onClick={() => {}}') ?? false,
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					expect(await page.locator('.pg-error').count()).toBe(0);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			45_000,
		);

		it.concurrent(
			'playground gates a shared multi-file link behind consent, then runs it',
			async () => {
				const hash = encodePlaygroundHash({
					lang: 'tsrx',
					entry: 'App.tsrx',
					files: [
						{
							name: 'App.tsrx',
							source:
								"import { label } from './Shared.tsrx';\n\nexport default function App() @{\n\t<h2>{'Shared: ' + label}</h2>\n}",
						},
						{ name: 'Shared.tsrx', source: "export const label = 'from-a-link';" },
					],
				});
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, `/playground#${hash}`);
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					// Untrusted payload: visible and compiled, but not executed.
					await page.locator('.pg-consent').waitFor();
					await page.click('.pg-consent-run');
					const preview = page.frameLocator('iframe[title="Playground preview"]');
					const heading = preview.locator('h2');
					await waitForLocatorText(heading, 'Shared: from-a-link');
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			45_000,
		);

		it.concurrent(
			'playground runs the OctaneCompat React-host example end to end',
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground', {
					beforeNavigation: installReactCdnMirror,
				});
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await page.selectOption('.pg-select', 'octane-compat');
					await page
						.locator('.pg-tab', { hasText: 'Island.tsrx' })
						.waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await page.locator('[aria-label="Result view"] button', { hasText: 'Compiled' }).click();
					await page.locator('[aria-label="Compiler output"]').selectOption('types');
					await page.waitForFunction(
						() =>
							(document.querySelectorAll('.pg-editor .cm-content')[1]?.textContent ?? '').includes(
								'OctaneCompat',
							),
						null,
						{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
					);
					await page.locator('[aria-label="Result view"] button', { hasText: 'Preview' }).click();
					const preview = page.frameLocator('iframe[title="Playground preview"]');
					// Real react-dom mounts the host; the compiled Octane island renders
					// inside it and resolves its own @try/@pending fetch.
					await preview.locator('h3', { hasText: 'Octane island' }).waitFor({ timeout: 30_000 });
					await preview
						.locator('body')
						.getByText('island data #1')
						.waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					// Native events keep working across the boundary.
					await preview.getByRole('button', { name: 'clicks: 3' }).click();
					await preview
						.getByRole('button', { name: 'clicks: 4' })
						.waitFor({ timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			90_000,
		);

		it.concurrent(
			'playground runs the ReactCompat Octane-host example end to end',
			async () => {
				const { page, errors } = await loadRoute(PREVIEW_ORIGIN, '/playground', {
					beforeNavigation: installReactCdnMirror,
				});
				try {
					await page.waitForSelector('.pg-grid.ready', { timeout: PLAYWRIGHT_ACTION_TIMEOUT });
					await page.selectOption('.pg-select', 'react-compat');
					await page.locator('.pg-tab', { hasText: 'Counter.react.tsx' }).waitFor();
					const preview = page.frameLocator('iframe[title="Playground preview"]');
					await preview.locator('h3', { hasText: 'React island' }).waitFor({ timeout: 30_000 });
					const note = preview.getByRole('textbox', { name: 'React note' });
					const originalInput = await note.elementHandle();
					expect(originalInput).not.toBeNull();
					await note.fill('kept by React');
					await preview.getByRole('button', { name: 'React count: 3', exact: true }).click();
					await waitForLocatorText(preview.locator('.reported'), 'React reported: 4');

					// Host updates carry new props without losing the React state or DOM.
					await preview.getByRole('button', { name: 'Rename React counter', exact: true }).click();
					await preview.getByRole('button', { name: 'Renamed count: 4', exact: true }).waitFor();
					await preview.getByRole('button', { name: 'Next initial count: 3', exact: true }).click();
					await preview
						.getByRole('button', { name: 'Next initial count: 4', exact: true })
						.waitFor();
					expect(await note.inputValue()).toBe('kept by React');
					expect(
						await originalInput!.evaluate(
							(node) => node === document.querySelector('[aria-label="React note"]'),
						),
					).toBe(true);

					// A React 19 ref is usable from the Octane host.
					await preview.getByRole('button', { name: 'Focus React input', exact: true }).click();
					expect(await originalInput!.evaluate((node) => node === document.activeElement)).toBe(
						true,
					);

					// React-local Suspense leaves the surrounding Octane app interactive.
					await preview.getByRole('button', { name: 'Load React data', exact: true }).click();
					await waitForLocatorText(preview.getByRole('status'), 'React loading…');
					await preview.getByRole('button', { name: 'Rename React counter', exact: true }).click();
					await preview.getByRole('button', { name: 'React count: 4', exact: true }).waitFor();
					await waitForLocatorText(preview.getByRole('status'), 'React data ready');

					// Real deletion resets React state on the next mount and reconnects the ref.
					await preview.getByRole('button', { name: 'Unmount React island', exact: true }).click();
					await note.waitFor({ state: 'detached' });
					await preview.getByRole('button', { name: 'Next initial count: 4', exact: true }).click();
					await preview.getByRole('button', { name: 'Mount React island', exact: true }).click();
					await preview.getByRole('button', { name: 'React count: 5', exact: true }).waitFor();
					expect(await note.inputValue()).toBe('React-owned input');
					await waitForLocatorText(preview.getByRole('status'), 'No request yet');
					await preview.getByRole('button', { name: 'Focus React input', exact: true }).click();
					expect(await note.evaluate((node) => node === document.activeElement)).toBe(true);
					expect(await originalInput!.evaluate((node) => node.isConnected)).toBe(false);
					await originalInput!.dispose();
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			},
			90_000,
		);
	},
);
