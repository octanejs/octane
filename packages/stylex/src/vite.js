// @octane-ts/stylex/vite — the build-time StyleX integration for octane apps.
//
// Add it AFTER `octane()` in your Vite config and import the generated sheet once:
//
//   import { octane } from 'octane/compiler/vite';
//   import { stylex } from '@octane-ts/stylex/vite';
//   export default { plugins: [octane(), stylex()] };
//
//   // app entry:
//   import 'virtual:stylex.css';
//
// `enforce: 'post'` makes this run on octane's COMPILED output (octane is
// `enforce: 'pre'`), where the `stylex.*` call sites still live. Each module is run
// through the StyleX compiler (`./transform`): the calls are replaced with their
// atomic form and the extracted rules are accumulated per file. `virtual:stylex.css`
// resolves to the deduped, priority-ordered concatenation of every file's rules — one
// static atomic stylesheet, zero StyleX runtime in the shipped bundle.
//
// SERVE vs BUILD ordering. In dev, `virtual:stylex.css`'s `load` returns the live
// aggregate and an HMR full-reload re-pulls it whenever a file's rules change. In a
// production build the virtual module can be loaded BEFORE every styled module has
// been transformed (Rollup traverses the graph in parallel), so `load` returns a
// stable PLACEHOLDER rule and `generateBundle` — which runs after ALL transforms are
// done — swaps that placeholder for the now-complete sheet. Either way the shipped
// stylesheet contains every rule.
//
// Authored in `.js` (like octane's `compiler/vite.js`) so the plugin loads when a
// consuming app's `vite.config.ts` pulls it in through Node's ESM loader.
import { transformStylex, generateStylexCSS, DEFAULT_IMPORT_SOURCES } from './transform.js';

const VIRTUAL_CSS_ID = 'virtual:stylex.css';
const RESOLVED_VIRTUAL_CSS_ID = '\0' + VIRTUAL_CSS_ID;

// A unique, minification-surviving rule emitted in a build so the virtual module can
// load early; `generateBundle` finds and replaces it with the final sheet. The custom
// property keeps the rule non-empty (minifiers drop empty rules) and never collides
// with StyleX's hashed `x…` class names.
const PLACEHOLDER_RULE = '.__stylex_sheet__{--stylex-sheet:1}';
const PLACEHOLDER_RE = /\.__stylex_sheet__\s*\{[^}]*\}/g;

/**
 * @param {object} [options]
 * @param {RegExp} [options.include] Files to scan (default: `.tsrx`/`.tsx`/`.jsx`/`.ts`/`.js`).
 * @param {Array<string | { from: string, as: string }>} [options.importSources] StyleX import specifiers.
 * @param {boolean} [options.dev] Force dev/prod compilation (default: dev when Vite is serving).
 * @param {boolean} [options.useCSSLayers] Use `@layer` rules instead of the `:not(#\#)` specificity hack.
 * @param {Record<string, unknown>} [options.unstable_moduleResolution] StyleX cross-file token resolution.
 * @param {Record<string, unknown>} [options.stylexOptions] Escape hatch for other `@stylexjs/babel-plugin` options.
 */
export function stylex(options = {}) {
	const include = options.include ?? /\.(tsrx|tsx|jsx|ts|js)(\?|$)/;
	const importSources = options.importSources ?? DEFAULT_IMPORT_SOURCES;
	const useCSSLayers = options.useCSSLayers ?? false;
	// Per-module rule sets, so re-transforming one file (HMR) replaces only its rules.
	const rulesByFile = new Map();
	let isDev = false;
	let isBuild = false;
	let root = process.cwd();
	let server;

	const aggregate = () => {
		const all = [];
		for (const rules of rulesByFile.values()) for (const r of rules) all.push(r);
		return generateStylexCSS(all, useCSSLayers);
	};

	return {
		name: '@octane-ts/stylex',
		// Run after octane's `.tsrx` -> JS transform, where `stylex.*` calls survive.
		enforce: 'post',

		configResolved(config) {
			isDev = options.dev ?? config.command === 'serve';
			isBuild = config.command === 'build';
			if (config.root) root = config.root;
		},
		configureServer(s) {
			server = s;
		},

		resolveId(id) {
			if (id === VIRTUAL_CSS_ID) return RESOLVED_VIRTUAL_CSS_ID;
			return null;
		},
		load(id) {
			if (id !== RESOLVED_VIRTUAL_CSS_ID) return null;
			// In a build the graph may not be fully transformed yet — emit a placeholder
			// that `generateBundle` replaces with the complete sheet. In serve, the live
			// aggregate is correct (HMR re-pulls on change).
			return isBuild ? PLACEHOLDER_RULE : aggregate();
		},

		transform(code, id) {
			const file = id.split('?')[0];
			if (!include.test(file) || file.includes('/node_modules/')) return null;
			// Cheap gate: skip files that can't reference StyleX at all.
			if (!importSources.some((s) => code.includes(typeof s === 'string' ? s : s.from))) {
				return null;
			}
			const {
				code: out,
				map,
				rules,
			} = transformStylex(code, {
				filename: file,
				dev: isDev,
				importSources,
				unstable_moduleResolution: options.unstable_moduleResolution ?? {
					type: 'commonJS',
					rootDir: root,
				},
				stylexOptions: options.stylexOptions,
			});

			const prevKey = keyOf(rulesByFile.get(id));
			if (rules.length > 0) rulesByFile.set(id, rules);
			else rulesByFile.delete(id);

			// HMR: if this file's rule set changed, invalidate the virtual sheet so the
			// next request re-aggregates. A full reload keeps it simple and correct.
			if (server && prevKey !== keyOf(rulesByFile.get(id))) {
				const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_CSS_ID);
				if (mod) {
					server.moduleGraph.invalidateModule(mod);
					server.ws.send({ type: 'full-reload' });
				}
			}

			return { code: out, map };
		},

		// After every module is transformed, the aggregate is complete — swap the
		// placeholder for the real sheet wherever it landed (a CSS asset normally, or a
		// JS chunk if the CSS was inlined). `enforce: 'post'` runs this after Vite has
		// emitted its CSS asset.
		generateBundle(_options, bundle) {
			if (!isBuild) return;
			const css = aggregate();
			for (const fileName in bundle) {
				const file = bundle[fileName];
				if (file.type === 'asset' && typeof file.source === 'string') {
					if (PLACEHOLDER_RE.test(file.source)) {
						file.source = file.source.replace(PLACEHOLDER_RE, () => css);
					}
				} else if (file.type === 'chunk' && typeof file.code === 'string') {
					if (PLACEHOLDER_RE.test(file.code)) {
						// CSS inlined into JS: the placeholder sits inside a string literal,
						// so the replacement must be string-escaped to match.
						file.code = file.code.replace(PLACEHOLDER_RE, () => jsStringEscape(css));
					}
				}
			}
		},
	};
}

function keyOf(rules) {
	return rules ? rules.map((r) => r[0]).join('|') : '';
}

// Escape a CSS string so it can be spliced inside an existing JS string literal
// (covers the rarer case of Vite inlining the sheet into a JS chunk). Backslash must
// be escaped first; quotes/backticks cover the literal styles esbuild emits.
function jsStringEscape(css) {
	return css
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/`/g, '\\`')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}
