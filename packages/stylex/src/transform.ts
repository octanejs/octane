// The StyleX compiler pass, factored out of the Vite plugin so it can be unit
// tested directly. `transformStylex` runs `@stylexjs/babel-plugin` over a module
// (octane's compiled `.tsrx` output, or plain `.ts`/`.tsx`) — replacing every
// `stylex.create`/`props`/`keyframes`/`defineVars`/`createTheme` call with its
// compiled form and collecting the extracted atomic rules. `generateStylexCSS`
// folds the rules from ALL modules into one deduped, priority-ordered stylesheet.
import babel from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';

// `@stylexjs/babel-plugin` emits one tuple per atomic rule: a stable content-hashed
// key, the LTR (and optional RTL) CSS text, and a numeric cascade priority. The key
// dedupes identical rules across files; the priority is baked into the selector by
// `processStylexRules`, so cascade order is independent of injection order.
export type StylexRule = [string, { ltr: string; rtl?: string | null }, number];

export interface TransformStylexOptions {
	filename: string;
	/** Dev mode keeps debug class names + a `data-style-src` breadcrumb. */
	dev?: boolean;
	/** Import specifiers the plugin treats as StyleX (default: our package + the real one). */
	importSources?: Array<string | { from: string; as: string }>;
	/** StyleX's cross-file token (`.stylex.ts`) resolution config. */
	unstable_moduleResolution?: Record<string, unknown>;
	/** Escape hatch for any other `@stylexjs/babel-plugin` option. */
	stylexOptions?: Record<string, unknown>;
	sourceMaps?: boolean;
}

export interface TransformStylexResult {
	code: string;
	map: unknown;
	rules: StylexRule[];
}

export const DEFAULT_IMPORT_SOURCES: Array<string | { from: string; as: string }> = [
	'@octane-ts/stylex',
	'@stylexjs/stylex',
];

export function transformStylex(code: string, opts: TransformStylexOptions): TransformStylexResult {
	const res = babel.transformSync(code, {
		filename: opts.filename,
		babelrc: false,
		configFile: false,
		// We never want the plugin's runtime-injection path — CSS is collected from
		// `metadata.stylex` and emitted as one static sheet, the whole point of the
		// build-time route.
		sourceMaps: opts.sourceMaps ?? true,
		plugins: [
			[
				stylexBabelPlugin,
				{
					dev: opts.dev ?? false,
					runtimeInjection: false,
					importSources: opts.importSources ?? DEFAULT_IMPORT_SOURCES,
					unstable_moduleResolution: opts.unstable_moduleResolution ?? {
						type: 'commonJS',
						rootDir: process.cwd(),
					},
					...opts.stylexOptions,
				},
			],
		],
	});
	return {
		code: res?.code ?? code,
		map: res?.map ?? null,
		rules: ((res?.metadata as { stylex?: StylexRule[] } | undefined)?.stylex ?? []) as StylexRule[],
	};
}

/**
 * Fold every module's collected rules into one stylesheet: deduped by key, ordered
 * by StyleX's baked-in cascade priority (so source/import order is irrelevant).
 */
export function generateStylexCSS(rules: StylexRule[], useCSSLayers = false): string {
	if (rules.length === 0) return '';
	return (
		stylexBabelPlugin as { processStylexRules(r: StylexRule[], layers: boolean): string }
	).processStylexRules(rules, useCSSLayers);
}
