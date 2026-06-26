import { describe, it, expect } from 'vitest';
import { stylex } from '../../src/vite';

// The Vite plugin object's hooks, driven directly (no full Vite run): transform
// collects rules, the virtual module aggregates them.

const SX = `import * as s from '@octane-ts/stylex';`;

// Serve mode: `load` returns the live aggregate (what dev + HMR rely on).
function makePlugin() {
	const plugin = stylex({ dev: false }) as any;
	plugin.configResolved({ command: 'serve' });
	return plugin;
}

// Build mode: `load` returns a placeholder; `generateBundle` fills in the sheet.
function makeBuildPlugin() {
	const plugin = stylex({ dev: false }) as any;
	plugin.configResolved({ command: 'build' });
	return plugin;
}

describe('@octane-ts/stylex/vite plugin', () => {
	it('transforms a stylex module and aggregates into virtual:stylex.css', () => {
		const plugin = makePlugin();
		const out = plugin.transform(
			`${SX}\nconst x = s.create({ a: { padding: 16 } });\nexport const p = s.props(x.a);`,
			'/app/a.ts',
		);
		expect(out).not.toBeNull();
		expect(out.code.includes('s.create(')).toBe(false); // compiled

		expect(plugin.resolveId('virtual:stylex.css')).toBe('\0virtual:stylex.css');
		const css = plugin.load('\0virtual:stylex.css');
		expect(css).toContain('padding:16px');
	});

	it('aggregates + dedupes across multiple files', () => {
		const plugin = makePlugin();
		plugin.transform(
			`${SX}\nconst x = s.create({ a: { padding: 16 } });\nexport const p = s.props(x.a);`,
			'/app/a.ts',
		);
		plugin.transform(
			`${SX}\nconst y = s.create({ b: { padding: 16, color: 'red' } });\nexport const q = s.props(y.b);`,
			'/app/b.ts',
		);
		const css = plugin.load('\0virtual:stylex.css');
		expect(css.match(/padding:16px/g)?.length).toBe(1); // deduped
		expect(css).toContain('color:red');
	});

	it('re-transforming a file replaces its rules (HMR correctness)', () => {
		const plugin = makePlugin();
		plugin.transform(
			`${SX}\nconst x = s.create({ a: { color: 'red' } });\nexport const p = s.props(x.a);`,
			'/app/a.ts',
		);
		expect(plugin.load('\0virtual:stylex.css')).toContain('color:red');
		// edit the same file -> its old rule must be gone, not accumulated
		plugin.transform(
			`${SX}\nconst x = s.create({ a: { color: 'green' } });\nexport const p = s.props(x.a);`,
			'/app/a.ts',
		);
		const css = plugin.load('\0virtual:stylex.css');
		expect(css).toContain('color:green');
		expect(css).not.toContain('color:red');
	});

	it('skips files with no stylex import, node_modules, and non-matching extensions', () => {
		const plugin = makePlugin();
		expect(plugin.transform('export const x = 1;', '/app/plain.ts')).toBeNull();
		expect(
			plugin.transform(`${SX}\nconst x = s.create({ a: {} });`, '/x/node_modules/p/a.ts'),
		).toBeNull();
		expect(plugin.transform(`${SX}`, '/app/styles.css')).toBeNull();
	});

	// In a real build the virtual sheet can be `load`ed before every styled module has
	// transformed. `load` must therefore emit a placeholder (not the incomplete
	// aggregate), and `generateBundle` must fill in the COMPLETE sheet afterward.
	it('build mode: load is a placeholder; generateBundle injects the complete sheet (CSS asset)', () => {
		const plugin = makeBuildPlugin();

		// module A transforms, THEN the virtual sheet loads (before B exists)...
		plugin.transform(
			`${SX}\nconst x = s.create({ a: { padding: 16 } });\nexport const p = s.props(x.a);`,
			'/a.ts',
		);
		const loaded = plugin.load('\0virtual:stylex.css');
		expect(loaded).toContain('__stylex_sheet__'); // placeholder, not the live aggregate
		expect(loaded).not.toContain('padding:16px');

		// ...module B transforms AFTER the sheet was already loaded.
		plugin.transform(
			`${SX}\nconst y = s.create({ b: { color: 'red' } });\nexport const q = s.props(y.b);`,
			'/b.ts',
		);

		const bundle = {
			'assets/style-abc.css': { type: 'asset', fileName: 'assets/style-abc.css', source: loaded },
		};
		plugin.generateBundle({}, bundle);
		const out = bundle['assets/style-abc.css'].source;
		expect(out).toContain('padding:16px'); // A
		expect(out).toContain('color:red'); // B — present despite loading before its transform
		expect(out).not.toContain('__stylex_sheet__'); // placeholder gone
	});

	it('build mode: generateBundle also patches the placeholder inlined into a JS chunk', () => {
		const plugin = makeBuildPlugin();
		plugin.transform(
			`${SX}\nconst x = s.create({ a: { padding: 16 } });\nexport const p = s.props(x.a);`,
			'/a.ts',
		);
		plugin.load('\0virtual:stylex.css');
		const bundle = {
			'app.js': {
				type: 'chunk',
				fileName: 'app.js',
				code: 'const c="__PH__";'.replace('__PH__', '.__stylex_sheet__{--stylex-sheet:1}'),
			},
		};
		plugin.generateBundle({}, bundle);
		expect(bundle['app.js'].code).toContain('padding:16px');
		expect(bundle['app.js'].code).not.toContain('__stylex_sheet__');
	});

	it('serve mode: load returns the live aggregate (no placeholder)', () => {
		const plugin = stylex({ dev: false }) as any;
		plugin.configResolved({ command: 'serve' });
		plugin.transform(
			`${SX}\nconst x = s.create({ a: { padding: 16 } });\nexport const p = s.props(x.a);`,
			'/a.ts',
		);
		const loaded = plugin.load('\0virtual:stylex.css');
		expect(loaded).toContain('padding:16px');
		expect(loaded).not.toContain('__stylex_sheet__');
	});
});
