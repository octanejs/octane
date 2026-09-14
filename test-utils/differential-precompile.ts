/// <reference types="node" />
/**
 * Differential-fixture precompile — the shared half of the differential rig.
 *
 * Every `packages/*\/tests/differential/_setup.ts` in the monorepo used to
 * copy the same ~50–90 lines: compile each selected `.tsrx` fixture through
 * `@tsrx/react`, lower the emitted TSX with esbuild, rewrite authored
 * specifiers onto the real React-side package, and write the result into the
 * package's own `.react-cache/` as `${slug}-${hash(srcPath)}.js`.
 *
 * This module owns that pipeline AND the cache-name contract the consumer
 * side (`packages/octane/tests/differential/_rig.ts` and friends) keys on —
 * one `fixtureCacheName` symbol replaces ~68 private `hashString` copies that
 * were kept in sync by comments.
 *
 * Fixture selection is the `fixtures` field:
 *   - `'all'` — walk `fixtureDir` recursively.
 *   - `string[]` — declared basenames, the parity contract.
 * Failure policy is the `onError` field (default `'throw'`): declared lanes
 * always throw — a broken fixture must never leave a stale oracle entry —
 * and most walk lanes throw too; `'skip'` exists for dirs that legitimately
 * contain octane-only syntax `@tsrx/react` rejects (core octane).
 *
 * The cache dir is removed and rebuilt on every setup run: a deleted or
 * renamed fixture can never leave a poisoned entry behind.
 *
 * The oracle toolchain (`@tsrx/react`'s `compile`, esbuild's `transformSync`)
 * is resolved package-locally via `createRequire(depsFrom)` — this module
 * lives at the repo root where `@tsrx/react` does not resolve, and each lane
 * pins its own versions. Resolving lazily inside `setup()` also keeps
 * `_setup.ts` free of top-level esbuild imports, which jsdom-hosted tests
 * (e.g. `setup.test.ts`) cannot load. Tests and bespoke callers may inject
 * concrete `deps` instead.
 *
 * Why globalSetup and not test time: esbuild's binary protocol asserts on
 * jsdom's Uint8Array — it must run in pure Node before any test loads.
 */
import { createRequire } from 'node:module';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The cache-name contract shared with the consumer rig. Changing this changes
 * where precompiled fixtures land — `_rig.ts`'s `loadReactFixture` must agree,
 * which is why both sides import it from here instead of keeping private
 * copies in sync by comment.
 */
export function fixtureCacheName(srcPath: string): string {
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	return `${slug}-${fixtureCacheHash(srcPath)}.js`;
}

/** Absolute path the consumer rigs dynamic-import for a given fixture. */
export function fixtureCachePath(cacheDir: string, srcPath: string): string {
	return join(cacheDir, fixtureCacheName(srcPath));
}

function fixtureCacheHash(s: string): string {
	// Cheap deterministic id — collisions across the suite are astronomically
	// unlikely; the key is the fixture's own (unique) source path.
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

/**
 * One ordered specifier rewrite: `[pattern, replacement]`. A `RegExp` applies
 * via `String.replace` (use `/g` for all occurrences); a literal `string`
 * applies to every occurrence — same as `replaceAll`.
 */
export type SpecifierRewrite = [
	pattern: RegExp | string,
	replacement: string | ((substring: string, ...args: any[]) => string),
];

function escapeRegExp(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The common case: rewrite `@octanejs/<pkg>` — and any subpath of it — onto
 * the real upstream specifier (`@octanejs/jotai/vanilla` → `jotai/vanilla`).
 * Order before/after other rewrites by position in the array.
 */
export function packageRewrite(from: string, to: string): SpecifierRewrite {
	return [
		new RegExp(`from\\s+["']${escapeRegExp(from)}(/[^"']*)?["']`, 'g'),
		(_m: string, sub?: string) => `from "${to}${sub ?? ''}"`,
	];
}

export interface DifferentialPrecompileDeps {
	/** `@tsrx/react`'s `compile`, imported by the caller's own package. */
	compile(source: string, path: string): { code: string; errors?: unknown[] | null };
	/** esbuild's `transformSync`, imported by the caller's own package. */
	transform(code: string, options: any): { code: string };
}

export interface DifferentialPrecompileConfig {
	/** Directory holding the package's `.tsrx` fixtures — absolute path or `new URL(..., import.meta.url)`. */
	fixtureDir: string | URL;
	/**
	 * This package's React-oracle cache. Keep it INSIDE the package so the
	 * compiled React side resolves that package's own deps (react, upstream,
	 * …); differential tests pass the same dir to `mountDifferential`.
	 */
	cacheDir: string | URL;
	/**
	 * Ordered specifier rewrites applied BEFORE the built-in
	 * `octane` → `react` rewrite. `packageRewrite` covers the common case.
	 */
	rewrites?: readonly SpecifierRewrite[];
	/** 'all' = recursive walk · string[] = declared basenames under fixtureDir. */
	fixtures: 'all' | readonly string[];
	/**
	 * Walk-mode filename filter (matched against the basename). Most lanes
	 * compile every `.tsrx`; lanes that share `_fixtures` with non-oracle
	 * sources pass e.g. `/-diff\.tsrx$/`.
	 */
	match?: RegExp;
	/**
	 * Compile/transform failure policy. Default 'throw' — fixtures a lane
	 * relies on must never silently shrink the oracle. 'skip' is for fixture
	 * dirs that legitimately mix in octane-only syntax.
	 */
	onError?: 'skip' | 'throw';
	/**
	 * Fail when the rewritten output still references `octane`/`@octanejs/*`:
	 * an unmapped specifier means a fixture escaped the oracle boundary and
	 * the React side would run Octane code. Always throws — independent of
	 * `onError`, which governs compile/transform failures only.
	 */
	rejectResidualOctane?: boolean;
	/**
	 * The oracle toolchain. Tests and callers with nonstandard compilers pass
	 * concrete `deps`; lane configs pass `depsFrom` (typically
	 * `import.meta.url`) so `@tsrx/react`+esbuild resolve against the
	 * package's own node_modules.
	 */
	deps?: DifferentialPrecompileDeps;
	/** Module specifier to `createRequire` from when `deps` is not supplied. */
	depsFrom?: string | URL;
}

function resolveDeps(config: DifferentialPrecompileConfig): DifferentialPrecompileDeps {
	if (config.deps) return config.deps;
	const require = createRequire(config.depsFrom ?? config.fixtureDir);
	return {
		compile: require('@tsrx/react').compile,
		transform: require('esbuild').transformSync,
	};
}

function toPath(dir: string | URL): string {
	return dir instanceof URL ? fileURLToPath(dir) : dir;
}

function walkTsrx(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const s = statSync(full);
		if (s.isDirectory()) out.push(...walkTsrx(full));
		else if (full.endsWith('.tsrx')) out.push(full);
	}
	return out;
}

/**
 * The built-in corrections for `@tsrx/react` output — not octane-specific,
 * they exist so the compiled oracle runs under React 19 correctly:
 *
 *   - `createPortal` lives on `react-dom`, not `react`, and @tsrx/react keeps
 *     children as a thunk while React 19 wants a ReactNode — so the specifier
 *     is moved to an internal alias and a shim unwraps the thunk.
 *   - `xlink:href` arrives as a string-keyed JSX prop React 19 drops; the
 *     camelCase `xlinkHref` form round-trips back to the namespaced
 *     attribute — byte-identical to octane's setAttributeNS path.
 */
function applyReactCorrections(code: string): string {
	if (/\bcreatePortal\b/.test(code)) {
		code = code.replace(
			/(import\s*\{[^}]*?)\bcreatePortal\b\s*,?\s*([^}]*\}\s*from\s+"react";?)/,
			(_m, head, tail) => `${head}${tail}`.replace(/,\s*\}/, ' }').replace(/\{\s*,/, '{ '),
		);
		code = `import { createPortal as __rd_createPortal } from "react-dom";
const createPortal = (children, target) => __rd_createPortal(typeof children === "function" ? children() : children, target);
${code}`;
	}
	return code.replace(/"xlink:href":/g, 'xlinkHref:');
}

function compileError(srcPath: string, stage: string, detail: unknown): Error {
	return new Error(
		`React fixture ${stage} failed for ${srcPath}: ` +
			(detail instanceof Error ? detail.message : JSON.stringify(detail)),
	);
}

/**
 * Compile one fixture into the oracle cache. Returns 'written' or 'skipped';
 * with a declared `fixtures` list, failures throw instead of skipping.
 * Exposed for callers that drive single files (e.g. a second SSR cache).
 */
export function compileReactFixture(
	srcPath: string,
	config: DifferentialPrecompileConfig,
): 'written' | 'skipped' {
	const fail = (config.onError ?? 'throw') === 'throw';
	const { compile, transform } = resolveDeps(config);
	const source = readFileSync(srcPath, 'utf8');

	let compiled;
	try {
		compiled = compile(source, srcPath);
	} catch (err) {
		if (fail) throw compileError(srcPath, 'compilation', err);
		return 'skipped';
	}
	if (compiled.errors?.length) {
		if (fail) throw compileError(srcPath, 'compilation', compiled.errors);
		return 'skipped';
	}

	let transformed;
	try {
		transformed = transform(compiled.code, {
			loader: 'tsx',
			jsx: 'automatic',
			jsxImportSource: 'react',
			target: 'esnext',
			format: 'esm',
			sourcefile: srcPath,
		});
	} catch (err) {
		if (fail) throw compileError(srcPath, 'transform', err);
		return 'skipped';
	}

	let code = transformed.code;
	for (const [pattern, replacement] of config.rewrites ?? []) {
		const compiled = typeof pattern === 'string' ? new RegExp(escapeRegExp(pattern), 'g') : pattern;
		code =
			typeof replacement === 'function'
				? code.replace(compiled, replacement)
				: code.replace(compiled, replacement);
	}
	code = applyReactCorrections(code.replace(/from\s+["']octane["']/g, 'from "react"'));

	if (
		config.rejectResidualOctane &&
		(/from\s+["']@octanejs\//.test(code) || /from\s+["']octane["']/.test(code))
	) {
		throw compileError(
			srcPath,
			'rewrite',
			'left Octane-only imports; keep differential oracles in the lane fixture set',
		);
	}

	const cacheDir = toPath(config.cacheDir);
	mkdirSync(cacheDir, { recursive: true });
	writeFileSync(join(cacheDir, fixtureCacheName(srcPath)), code);
	return 'written';
}

/**
 * Build a Vitest `globalSetup`/`globalTeardown` pair for a package's
 * differential project. The returned `_setup.ts` is typically ~10 lines:
 *
 *   export const { setup, teardown } = differentialSetup({
 *     fixtureDir: new URL('../_fixtures/', import.meta.url),
 *     cacheDir: new URL('./.react-cache/', import.meta.url),
 *     rewrites: [packageRewrite('@octanejs/jotai', 'jotai')],
 *     fixtures: ['counter-diff.tsrx', …],
 *   });
 */
export function differentialSetup(config: DifferentialPrecompileConfig): {
	setup: () => Promise<void>;
	teardown: () => Promise<void>;
} {
	return {
		async setup() {
			// Resolved here, not at module init: jsdom-hosted tests import
			// `_setup.ts` for its config and must never touch fs or toolchain.
			const fixtureDir = toPath(config.fixtureDir);
			const cacheDir = toPath(config.cacheDir);
			const declared = config.fixtures !== 'all';
			const fail = (config.onError ?? 'throw') === 'throw';
			rmSync(cacheDir, { recursive: true, force: true });
			mkdirSync(cacheDir, { recursive: true });
			if (!existsSync(fixtureDir)) {
				if (fail) throw new Error(`fixture dir not found: ${fixtureDir}`);
				return;
			}
			const files = declared
				? (config.fixtures as readonly string[]).map((n) => join(fixtureDir, n))
				: walkTsrx(fixtureDir).filter((f) => !config.match || config.match.test(basename(f)));
			for (const file of files) {
				compileReactFixture(file, { ...config, fixtureDir, cacheDir });
			}
		},
		async teardown() {
			// Cache is rebuilt from scratch on each setup run.
		},
	};
}
