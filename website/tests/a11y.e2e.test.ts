// @vitest-environment node

// axe-core accessibility sweep over the production build — the durable
// regression check for the octanejs.dev Lighthouse accessibility work
// (docs/plans/2026-09-18-1202-fix-website-a11y-contrast-plan.md, R5/R6, KTD4).
// Every swept route loads once per theme in headless Chromium at Lighthouse's
// mobile viewport (360×640), axe.run evaluates the wcag2a/wcag2aa ruleset —
// the set Lighthouse's accessibility category scores — and the spec asserts
// zero `color-contrast` violations on the fixed surface, per route per theme.
//
// Violations OUTSIDE the contrast class are not silently absorbed: each one
// must exactly match an entry in NON_CONTRAST_BASELINE below, so a NEW
// instance of a deferred rule (or a new rule entirely) still fails the spec.
// Baseline entries name the deferred rule next to the node that produced it;
// an entry leaves the list only when a follow-up actually fixes the rule.
//
// Runs inside the website-integration vitest project (playwright as a
// library) against the shared production build — see
// tests/setup/production-server.ts. Chromium is a required prerequisite; CI
// installs it (the website_e2e job in ci.yml), and local runs fail with the
// exact setup command when it is missing.
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { waitForReadyState } from './support/server-process.ts';

// Resolved through website/package.json so the scan runs the same axe-core
// the website declares — 4.12.1, the engine Lighthouse 13.4.1's accessibility
// category depends on, so this spec audits what Lighthouse scores.
const AXE_MIN_JS = createRequire(join(process.cwd(), 'website/package.json')).resolve(
	'axe-core/axe.min.js',
);

const PLAYWRIGHT_ACTION_TIMEOUT = 20_000;
const PLAYWRIGHT_NAVIGATION_TIMEOUT = 15_000;
// Lighthouse's mobile lab profile audits at 360×640 — the viewport the PSI
// 97 was measured at, and the size that puts the header behind the hamburger.
const LIGHTHOUSE_MOBILE_VIEWPORT = { width: 360, height: 640 } as const;

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

// The swept set covers where the fixed elements render (plan Assumptions):
// the accent-fill consumers live on / (hero CTA), /docs/core-apis (three of
// the remaining four), and the 404 URL (NotFound's fill button); shiki light
// tokens cover the docs fences and the playground editor.
const SWEPT_ROUTES = [
	'/',
	'/docs',
	'/docs/core-apis',
	'/playground',
	'/benchmarks',
	'/devtools',
	'/errors',
	// Deliberately missing — the catch-all renders NotFound, the fifth
	// --on-accent consumer.
	'/definitely/not/a/page',
];

// axe's report shape, narrowed to the fields this spec reads. axe-core ships
// its own types (axe.d.ts), but the scan crosses a page.evaluate boundary, so
// this structural slice is what the runner actually receives.
interface AxeCheckData {
	fgColor?: string;
	bgColor?: string;
	contrastRatio?: number;
	expectedContrastRatio?: string;
}

interface AxeNode {
	// Selector path axe followed to the node; nested arrays mark iframe hops.
	target: ReadonlyArray<string | string[]>;
	any?: ReadonlyArray<{ data?: AxeCheckData }>;
	all?: ReadonlyArray<{ data?: AxeCheckData }>;
}

interface AxeRuleResult {
	id: string;
	nodes: AxeNode[];
}

interface AxeResults {
	violations: AxeRuleResult[];
	// "incomplete" is axe's could-not-determine bucket (e.g. a background it
	// cannot composite). It is not a violation, so it stays out of the hard
	// gates below — its color-contrast count rides along in the assert label
	// so a class of silently-unauditable nodes still surfaces in failures.
	incomplete: AxeRuleResult[];
}

interface DeferredFinding {
	ruleId: string;
	nodeSelector: string;
}

// DEFERRED NON-CONTRAST BASELINE — recorded by the pre-fix sweep (the red run
// this spec produces before the plan's U1/U2/U3 fixes land). Keyed
// `${route} [${theme}]`, one {ruleId, nodeSelector} entry per axe violation
// node, exact-matched: a new instance of a deferred rule, a new rule, or a
// moved node fails the spec, and a follow-up fix removes the entry.
// Observed identical across themes on every route; `forRoute` stamps both.
const forRoute = (route: string, findings: readonly DeferredFinding[]) =>
	Object.fromEntries(THEMES.map((theme) => [`${route} [${theme}]`, findings]));

const NON_CONTRAST_BASELINE: Record<string, readonly DeferredFinding[]> = {
	// The homepage mounts the benchmarks heatmap preview; axe cannot focus its
	// overflow-x region. Defer to the benchmarks follow-up.
	...forRoute('/', [{ ruleId: 'scrollable-region-focusable', nodeSelector: '.bx-heat-scroll' }]),
	// The docs index's tab panel scrolls horizontally at 360px.
	...forRoute('/docs', [
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '#\\:in-2\\:-panel' },
	]),
	// API reference tables plus the tab panel — same deferred class.
	...forRoute('/docs/core-apis', [
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '#\\:in-1\\:-panel' },
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '.table-scroll:nth-child(98)' },
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '.table-scroll:nth-child(122)' },
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '.table-scroll:nth-child(127)' },
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '.table-scroll:nth-child(187)' },
	]),
	// CodeMirror: the contenteditable surface has no accessible field name and
	// its scroller is not focusable. Editor chrome, not site styles.
	...forRoute('/playground', [
		{ ruleId: 'aria-input-field-name', nodeSelector: 'div[contenteditable="true"]' },
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '.ͼ4 > .cm-scroller' },
	]),
	// The header links's styling does not distinguish it from body text, and
	// the heatmap's overflow region again.
	...forRoute('/benchmarks', [
		{
			ruleId: 'link-in-text-block',
			nodeSelector: '.benchpage-sub > a[target="_blank"][rel="noreferrer"]',
		},
		{ ruleId: 'scrollable-region-focusable', nodeSelector: '.bx-heat-scroll' },
	]),
	// The devtools filter input is unlabeled.
	...forRoute('/devtools', [{ ruleId: 'label', nodeSelector: 'input' }]),
	// /errors and /definitely/not/a/page (the NotFound catch-all) produce no
	// non-contrast findings — their absence from this map asserts [].
};

const AXE_RUN_OPTIONS = {
	// The ruleset Lighthouse's accessibility category scores.
	runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
	resultTypes: ['violations', 'incomplete'],
};

function nodeSelector(node: AxeNode): string {
	return node.target.flat(2).join(' ');
}

// One line per failing node — selector plus the colors axe measured — so the
// spec's failure output IS the violation inventory.
function contrastLine(node: AxeNode): string {
	const data = node.any?.[0]?.data ?? node.all?.[0]?.data ?? {};
	const ratio = typeof data.contrastRatio === 'number' ? data.contrastRatio.toFixed(2) : 'unknown';
	return (
		`${nodeSelector(node)} — ${data.fgColor ?? '?'} on ${data.bgColor ?? '?'} ` +
		`(${ratio}:1, needs ${data.expectedContrastRatio ?? '4.5:1'})`
	);
}

function findingKey(finding: DeferredFinding): string {
	return finding.ruleId + ' ' + finding.nodeSelector;
}

function sortFindings(findings: readonly DeferredFinding[]): DeferredFinding[] {
	return [...findings].sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
}

// One shared browser for every route×theme pass — page-per-case against the
// shared preview server, same shape as ssr-hydration.e2e.
let chromium: typeof import('playwright').chromium;
let browser: import('playwright').Browser;

beforeAll(async () => {
	try {
		({ chromium } = await import('playwright'));
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[a11y.e2e] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}
}, 60_000);

afterAll(async () => {
	await browser.close();
});

async function runAxe(page: import('playwright').Page): Promise<AxeResults> {
	await page.addScriptTag({ path: AXE_MIN_JS });
	return page.evaluate(
		(options: unknown) =>
			(window as unknown as { axe: { run: (o: unknown) => Promise<AxeResults> } }).axe.run(options),
		AXE_RUN_OPTIONS,
	);
}

// Click a control until the surface it mounts appears. The first attempt can
// land before hydration commits — the site's deferred-hydration intent queue
// replays it (see client.ts), and the retry covers whatever replay misses.
// Bounded by the shared action budget via the deadline.
async function clickUntilMounted(
	page: import('playwright').Page,
	control: string,
	mounted: string,
): Promise<void> {
	const deadline = Date.now() + PLAYWRIGHT_ACTION_TIMEOUT;
	for (;;) {
		try {
			await page.click(control, { timeout: 2_000 });
		} catch (error) {
			// The control can disable itself by mounting the surface mid-click
			// (the toast disables "Show saved toast"); count that as mounted.
			if ((await page.locator(mounted).count()) > 0) return;
			if (Date.now() > deadline) throw error;
			continue;
		}
		try {
			await page.waitForSelector(mounted, { timeout: 2_000 });
			return;
		} catch (error) {
			if (Date.now() > deadline) throw error;
		}
	}
}

// Conditional surfaces the scan must see, exercised before scanning. Elements
// that cannot be mounted cheaply are named in MANUAL_VERIFICATION below
// instead of being skipped silently.
async function mountRouteState(page: import('playwright').Page, route: string): Promise<void> {
	switch (route) {
		case '/docs/core-apis': {
			// The portal toast's Dismiss button — a known --on-accent consumer —
			// exists only while the toast shows.
			await clickUntilMounted(page, '.portal-demo-source > button', '.portal-demo-toast');
			return;
		}
		case '/devtools': {
			// The Suspense demos resolve from module-scope promises; wait for the
			// slower one so the scanned DOM is the settled one, not a fallback.
			await page.waitForFunction(
				() => document.body.textContent?.includes('boundary B loaded') ?? false,
				null,
				{ timeout: PLAYWRIGHT_ACTION_TIMEOUT },
			);
			return;
		}
		case '/playground': {
			// `.cm-shiki` marks appear only once the lazily-imported WASM-backed
			// highlighter boots and paints the editor viewport — the state whose
			// token colors the scan exists to audit. Costs seconds on a cold boot,
			// so this wait deliberately outruns the shared action budget; the
			// 120s case timeout is the bound.
			await page.waitForSelector('.cm-shiki', { timeout: 90_000 });
			return;
		}
	}
}

describe('website a11y sweep (axe-core, production build)', { concurrent: false }, () => {
	const origin = inject('productionOrigin');

	// The build runs in the background of the project's globalSetup so the rest
	// of the run does not queue behind it; the origin is reserved but not yet
	// answering when this module loads. Wait once here, not per case.
	beforeAll(() => waitForReadyState(inject('productionReadyFile'), 460_000));

	it.concurrent.for(SWEPT_ROUTES.flatMap((route) => THEMES.map((theme) => ({ route, theme }))))(
		'$route [$theme] — no axe violations in the fixed surface',
		{ timeout: 120_000 },
		async ({ route, theme }) => {
			const context = await browser.newContext({
				viewport: LIGHTHOUSE_MOBILE_VIEWPORT,
				colorScheme: theme,
			});
			try {
				// `data-theme` comes from THEME_INIT (routes/__root.tsrx): a saved
				// `octane-theme` localStorage entry wins over prefers-color-scheme.
				// Seed it explicitly for BOTH passes — never rely on the default —
				// and keep colorScheme aligned so media-query readers agree.
				await context.addInitScript((seeded: string) => {
					try {
						localStorage.setItem('octane-theme', seeded);
					} catch {
						// Storage can be unavailable; the colorScheme media query still
						// reaches THEME_INIT's fallback.
					}
				}, theme);
				const page = await context.newPage();
				page.setDefaultTimeout(PLAYWRIGHT_ACTION_TIMEOUT);
				page.setDefaultNavigationTimeout(PLAYWRIGHT_NAVIGATION_TIMEOUT);
				// `domcontentloaded`, not `load`: the playground's cross-origin
				// sandbox iframe must not gate the scan.
				await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
				// Route-owned DOM is the readiness boundary (same convention as
				// ssr-hydration's loadRoute): `main > *` is server markup on every
				// swept route.
				await page.waitForSelector('main > *');
				await page.evaluate(async () => {
					await document.fonts.ready;
				});
				// Proves the seeded theme actually reached `data-theme` — without
				// this both passes could silently scan the same theme.
				expect(
					await page.evaluate(() => document.documentElement.getAttribute('data-theme')),
					'data-theme',
				).toBe(theme);

				// Non-contrast findings accumulate across every scan this route
				// performs (deduped — the same node reappears in each homepage scan)
				// and exact-match the baseline once, at the end.
				const deferred = new Map<string, DeferredFinding>();
				const scan = async (label: string): Promise<void> => {
					// axe reads computed color mid-animation (e.g. a fade-in at
					// partial opacity) as reduced contrast — the violation it
					// reports is the transient frame, not the resting surface.
					// Settle finite mount animations before measuring; looping
					// ones (the Lynx preview bounce) never finish and are
					// excluded. A still-running finite animation at the deadline
					// fails the case loudly rather than scanning mid-flight.
					await page.waitForFunction(
						() =>
							document
								.getAnimations()
								.every(
									(a) =>
										a.effect?.getTiming().iterations === Infinity ||
										a.playState === 'finished' ||
										a.playState === 'idle',
								),
						null,
						{ timeout: 5_000 },
					);
					const results = await runAxe(page);
					for (const rule of results.violations) {
						if (rule.id === 'color-contrast') continue;
						for (const node of rule.nodes) {
							const finding = { ruleId: rule.id, nodeSelector: nodeSelector(node) };
							deferred.set(findingKey(finding), finding);
						}
					}
					const undetermined = results.incomplete
						.filter((rule) => rule.id === 'color-contrast')
						.reduce((count, rule) => count + rule.nodes.length, 0);
					const contrast = results.violations
						.filter((rule) => rule.id === 'color-contrast')
						.flatMap((rule) => rule.nodes.map(contrastLine));
					expect(
						contrast,
						`${route} [${theme}] ${label}: color-contrast` +
							(undetermined > 0 ? ` (+${undetermined} undetermined)` : ''),
					).toEqual([]);
				};

				if (route === '/') {
					// Wait for the first effect log line — the `›` prompts mount with
					// it, and its arrival also proves hydration committed (the line is
					// emitted by the mount effect). MANUAL VERIFICATION:
					// `.demo-terminal-empty` ("Waiting for the effect…") is replaced
					// by that same line and cannot be held open cheaply; its fixed
					// color needs a manual computed-style check.
					await page.waitForSelector('.demo-terminal-body .demo-terminal-line');
					await scan('resting');

					// `.demo-terminal-jump` renders only while the body is scrolled
					// off the bottom, which needs enough lines to overflow the
					// 4.75rem body — each Count click appends one.
					for (let i = 0; i < 6; i++) await page.click('.demo-count');
					await page.waitForFunction(
						() => document.querySelectorAll('.demo-terminal-line').length >= 7,
					);
					// Log lines can arrive before the terminal follows them. Start
					// scrolling away from an overflowing terminal at its followed tail.
					await page.waitForFunction(() => {
						const body = document.querySelector<HTMLElement>('.demo-terminal-body');
						return (
							body !== null &&
							body.scrollHeight - body.clientHeight > 4 &&
							body.scrollHeight - body.scrollTop - body.clientHeight <= 1
						);
					});
					await page.evaluate(() => {
						const body = document.querySelector<HTMLElement>('.demo-terminal-body');
						if (body) body.scrollTop = 0;
					});
					await page.waitForSelector('.demo-terminal-jump');
					// The paused-status variant: same chrome, different dot and text.
					await page.click('.demo-toggle input');
					await page.waitForFunction(
						() =>
							document.querySelector('.demo-terminal-status')?.textContent?.includes('paused') ??
							false,
					);
					// 360px puts the header links behind the hamburger — open it so
					// the nav surface is in the scanned DOM too.
					await page.click('.menu-btn');
					await page.waitForSelector('.navlinks.open');
					await scan('jump/nav/paused mounted');

					// The search dialog is a portal: mount it and wait for the
					// loaded index's deterministic empty-query state before scanning.
					await page.click('.search-trigger');
					await page.waitForSelector('.search-input');
					await page.waitForFunction(
						() =>
							document.querySelector('.search-empty')?.textContent?.includes('Search the docs') ??
							false,
					);
					await scan('search dialog open');
				} else {
					await mountRouteState(page, route);
					await scan('settled');
				}

				expect(
					sortFindings([...deferred.values()]),
					`${route} [${theme}] deferred non-contrast findings`,
				).toEqual(sortFindings(NON_CONTRAST_BASELINE[`${route} [${theme}]`] ?? []));
			} finally {
				await context.close();
			}
		},
	);
});

// MANUAL VERIFICATION — visible states axe cannot reach cheaply from this
// spec; each needs a one-time computed-style check when the fix lands:
// - `.demo-terminal-empty`: replaced by the first effect log line, so it
//   never coexists with the state this spec waits on (see the note inline).
// - :hover/:focus-visible colors (`hero-version:hover`, `code-copy:hover`,
//   `.demo-terminal-jump:hover`, `.demo-count:hover`): axe audits the resting
//   style only; pseudo-state contrast is out of engine reach.
