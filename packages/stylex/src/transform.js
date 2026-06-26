// The StyleX compiler pass, factored out of the Vite plugin so it can be unit
// tested directly. `transformStylex` runs `@stylexjs/babel-plugin` over a module
// (octane's compiled `.tsrx` output, or plain `.ts`/`.tsx`) — replacing every
// `stylex.create`/`props`/`keyframes`/`defineVars`/`createTheme` call with its
// compiled form and collecting the extracted atomic rules. `generateStylexCSS`
// folds the rules from ALL modules into one deduped, priority-ordered stylesheet.
//
// Authored in `.js` (like octane's `compiler/` tooling) so it loads cleanly when a
// consuming app's `vite.config.ts` pulls the plugin in through Node's ESM loader —
// build tooling that Node executes directly cannot be raw `.ts` source.
import babel from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';

// `@stylexjs/babel-plugin` emits one tuple per atomic rule —
// `[key, { ltr, rtl? }, priority]`: a stable content-hashed key, the LTR (and
// optional RTL) CSS text, and a numeric cascade priority. The key dedupes identical
// rules across files; the priority is baked into the selector by `processStylexRules`,
// so cascade order is independent of injection order.

export const DEFAULT_IMPORT_SOURCES = ['@octanejs/stylex', '@stylexjs/stylex'];

export function transformStylex(code, opts) {
	const res = babel.transformSync(code, {
		filename: opts.filename,
		babelrc: false,
		configFile: false,
		sourceMaps: opts.sourceMaps ?? true,
		plugins: [
			[
				stylexBabelPlugin,
				{
					dev: opts.dev ?? false,
					// Never the runtime-injection path — CSS is collected from
					// `metadata.stylex` and emitted as one static sheet (the build-time route).
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
		rules: res?.metadata?.stylex ?? [],
	};
}

// Fold every module's collected rules into one stylesheet: deduped by key, ordered
// by StyleX's baked-in cascade priority (so source/import order is irrelevant).
export function generateStylexCSS(rules, useCSSLayers = false) {
	if (rules.length === 0) return '';
	return stylexBabelPlugin.processStylexRules(rules, useCSSLayers);
}
