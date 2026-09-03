import { afterEach, describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { createPipeableCollector, deferred, resetStreamRuntimeGlobals } from '../_server-stream.js';

// Plan S3.2 — streaming SSR and themes. On the server every component body
// calls `injectStyle(hash, css)` per request for its own scopes AND for the
// module-level sheets of its module (the compiler folds `moduleCssInjections`
// into each component of that module), so a theme declared in the module a
// shell component lives in ships with the shell even when only a late wave's
// component applies it. The wave-level `emittedCss` dedupe then keeps the wave
// from re-shipping it, while the late component's own scope arrives with the
// wave that reveals it. The boundary suspends BEFORE entering the styled child
// (as `LateStyledBoundary` in streaming-ssr.test.ts does): a child that runs
// up to its own `use()` has already registered its sheets, and those ride the
// shell like partial-boundary Float resources do.

const THEME_RULE = 'rgb(7, 8, 9)';
const LATE_RULE = 'text-decoration: underline';

const SAME_MODULE_SOURCE = `
	import { use } from 'octane';

	export const theme = <style>
		.late { color: ${THEME_RULE}; }
	</style>;

	function Late(props) @{
		<>
			<style apply={theme} />
			<span class="late">{props.value as string}</span>
			<style>.late { ${LATE_RULE}; }</style>
		</>
	}

	export function Shell(props) @{
		<div id="shell">
			<p class="shell">shell</p>
			@try {
				const value = use(props.promise);
				<Late value={value} />
			} @pending {
				<p id="pending">loading</p>
			}
		</div>
	}
`;

const THEME_MODULE_SOURCE = `
	export const theme = <style>
		.late { color: ${THEME_RULE}; }
	</style>;
`;

const CROSS_MODULE_SOURCE = `
	import { use } from 'octane';
	import { theme } from './streaming-theme-module.tsrx';

	function Late(props) @{
		<>
			<style apply={theme} />
			<span class="late">{props.value as string}</span>
			<style>.late { ${LATE_RULE}; }</style>
		</>
	}

	export function Shell(props) @{
		<div id="shell">
			<p class="shell">shell</p>
			@try {
				const value = use(props.promise);
				<Late value={value} />
			} @pending {
				<p id="pending">loading</p>
			}
		</div>
	}
`;

const compileOptions = { hmr: false, dev: false };
const sameModule = loadCompiledFixtureSource(SAME_MODULE_SOURCE, {
	id: '/packages/octane/tests/runtime/streaming-theme-same-module.tsrx',
	mode: 'server',
	compileOptions,
});
const themeModule = loadCompiledFixtureSource(THEME_MODULE_SOURCE, {
	id: '/packages/octane/tests/runtime/streaming-theme-module.tsrx',
	mode: 'server',
	compileOptions,
});
const crossModule = loadCompiledFixtureSource(CROSS_MODULE_SOURCE, {
	id: '/packages/octane/tests/runtime/streaming-theme-applier.tsrx',
	mode: 'server',
	compileOptions,
	runtimeModules: { './streaming-theme-module.tsrx': themeModule },
});

afterEach(resetStreamRuntimeGlobals);

function count(html: string, needle: string): number {
	return html.split(needle).length - 1;
}

function styleTag(hash: string): string {
	return `<style data-octane="${hash}"`;
}

/** The revealed span's classes (the segment travels JSON-encoded in a script, so quotes may be escaped). */
function lateSpanClasses(html: string): string[] {
	const match = html.match(/<span class=\\?"late ([^"\\]+)\\?"/);
	expect(match).not.toBeNull();
	return match![1].split(' ');
}

/** The late span's own scope hash: its classes minus the authored one and the theme. */
function lateScopeHash(html: string, themeHash: string): string {
	const hashes = lateSpanClasses(html).filter((cls) => cls !== themeHash);
	expect(hashes).toHaveLength(1);
	return hashes[0];
}

async function stream(component: any) {
	const value = deferred<string>();
	const collector = createPipeableCollector();
	ServerRuntime.renderToPipeableStream(component, { promise: value.promise }).pipe(
		collector.destination,
	);
	// The shell is written synchronously by pipe().
	const shell = collector.chunks[0];
	value.resolve('revealed');
	const html = await collector.ended;
	return { shell, html, chunks: collector.chunks };
}

describe('streaming SSR — themes across waves (S3.2)', () => {
	it('ships an eagerly imported theme with the shell although only a late wave applies it', async () => {
		const themeHash = sameModule.theme.$class as string;
		expect(themeHash).toMatch(/^tsrx-/);
		const { shell, html } = await stream(sameModule.Shell);

		// Shell: the theme's sheet precedes the markup; the late scope is absent.
		expect(shell.indexOf(styleTag(themeHash))).toBeGreaterThanOrEqual(0);
		expect(shell.indexOf(styleTag(themeHash))).toBeLessThan(shell.indexOf('<div id="shell"'));
		expect(shell).toContain(THEME_RULE);
		expect(shell).not.toContain(LATE_RULE);
		expect(shell).toContain('loading');

		// Wave: the late component's own scope ships with its reveal, the
		// theme is not re-shipped, and the revealed element carries both classes.
		expect(html).toContain('revealed');
		const lateHash = lateScopeHash(html, themeHash);
		expect(count(html, styleTag(themeHash))).toBe(1);
		expect(count(html, styleTag(lateHash))).toBe(1);
		expect(html.indexOf(styleTag(lateHash))).toBeGreaterThanOrEqual(shell.length);
		expect(html).toContain(LATE_RULE);
	});

	it('stamps an imported theme class and ships the late scope with its wave', async () => {
		const themeHash = themeModule.theme.$class as string;
		const { shell, html } = await stream(crossModule.Shell);
		expect(shell).not.toContain(LATE_RULE);
		expect(html).toContain('revealed');
		const lateHash = lateScopeHash(html, themeHash);
		expect(lateSpanClasses(html)).toContain(themeHash);
		expect(count(html, styleTag(lateHash))).toBe(1);
		expect(html.indexOf(styleTag(lateHash))).toBeGreaterThanOrEqual(shell.length);
	});

	it('ships an imported (cross-module) theme sheet with the wave that first applies it, ahead of that scope', async () => {
		// A theme module compiled for the server has no component body to fold
		// its sheet into, so its class map is a `styleMap` proxy that injects on
		// read; the applier's body touches the map (`touchStyleMap(theme)`)
		// before its own `injectStyle` calls. The theme therefore reaches the
		// collector only when a wave first renders an applier — here the late
		// wave — and precedes that scope's sheet so the local rule wins.
		const themeHash = themeModule.theme.$class as string;
		const { shell, html } = await stream(crossModule.Shell);
		expect(shell).not.toContain(styleTag(themeHash));
		expect(count(html, styleTag(themeHash))).toBe(1);
		expect(html).toContain(THEME_RULE);
		const lateHash = lateScopeHash(html, themeHash);
		expect(html.indexOf(styleTag(themeHash))).toBeGreaterThanOrEqual(shell.length);
		expect(html.indexOf(styleTag(themeHash))).toBeLessThan(html.indexOf(styleTag(lateHash)));
	});
});
