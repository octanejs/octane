import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { runCodemod } from '../src/index.js';

const REPO = path.resolve(import.meta.dirname, '../../..');
/** @type {string[]} */
const temporary = [];

afterEach(() => {
	for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, string>} files */
function project(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-codemod-'));
	temporary.push(root);
	for (const [name, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
		fs.writeFileSync(path.join(root, name), text);
	}
	return root;
}

describe('runCodemod', () => {
	it('renames template modules and rewrites every import of them', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'index.html': '<script type="module" src="/src/main.tsx"></script>',
			'vite.config.ts':
				"import react from '@vitejs/plugin-react';\nexport default { plugins: [react()] };\n",
			'src/main.tsx':
				"import { createRoot } from 'react-dom/client';\nimport { App } from './App';\n\nfunction Root() {\n\treturn <App />;\n}\n\ncreateRoot(document.getElementById('root')!).render(<Root />);\n",
			'src/App.tsx':
				"import { useQuery } from '@tanstack/react-query';\nimport { Button } from './components';\n\nexport function App() {\n\tconst { data } = useQuery({ queryKey: ['x'], queryFn: () => 1 });\n\treturn <Button>{data}</Button>;\n}\n",
			'src/components/index.tsx':
				"import { Slot } from '@radix-ui/react-slot';\nexport function Button(props: { children: unknown }) {\n\treturn <Slot>{props.children as any}</Slot>;\n}\n",
			'src/routes.ts': "export const routes = [() => import('./App.tsx')];\n",
			// Build output is not source.
			'out/App.js':
				"import { jsx } from 'react/jsx-runtime';\nexport const App = () => jsx('p', {});\n",
		});
		const result = await runCodemod([root]);

		expect(result.files.map((file) => [file.file, file.output])).toEqual([
			['src/App.tsx', 'src/App.tsrx'],
			['src/components/index.tsx', 'src/components/index.tsrx'],
			['src/main.tsx', 'src/main.tsrx'],
			['src/routes.ts', 'src/routes.ts'],
		]);
		const read = (/** @type {string} */ name) => fs.readFileSync(path.join(root, name), 'utf8');
		expect(read('src/main.tsrx')).toContain("import { App } from './App.tsrx';");
		expect(read('src/App.tsrx')).toContain("import { Button } from './components/index.tsrx';");
		expect(read('src/App.tsrx')).toContain("import { useQuery } from '@octanejs/tanstack-query';");
		expect(read('src/routes.ts')).toContain("import('./App.tsrx')");
		expect(read('index.html')).toContain('src="/src/main.tsrx"');
		expect(fs.existsSync(path.join(root, 'src/App.tsx'))).toBe(false);
		// Configs belong to `octane init`.
		expect(read('vite.config.ts')).toContain('@vitejs/plugin-react');
		expect(read('out/App.js')).toContain("from 'react/jsx-runtime'");

		expect(result.packages).toEqual([
			{ from: '@tanstack/react-query', to: '@octanejs/tanstack-query' },
			{ from: '@radix-ui/react-slot', to: '@octanejs/radix' },
		]);
		expect(result.missing).toEqual([]);
		expect(result.files.flatMap((file) => file.diagnostics)).toEqual([]);
	});

	it('is idempotent: a second run changes nothing', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/main.tsx':
				"import { createRoot } from 'react-dom/client';\nimport { App } from './App';\n\ncreateRoot(document.body).render(<App />);\n",
			'src/App.tsx':
				"import { useEffect, useState } from 'react';\nexport function App() {\n\tconst [n, setN] = useState(0);\n\tuseEffect(() => { document.title = String(n); });\n\treturn <button onClick={() => setN(n + 1)}>{n}</button>;\n}\n",
			'src/use-title.ts':
				"import { useEffect } from 'react';\nexport function useTitle(title: string) {\n\tuseEffect(() => { document.title = title; });\n}\n",
		});
		const first = await runCodemod([root]);
		expect(first.files.filter((file) => file.changed).map((file) => file.output)).toEqual([
			'src/App.tsrx',
			'src/main.tsrx',
			'src/use-title.ts',
		]);
		const second = await runCodemod([root]);
		expect(second.files.filter((file) => file.changed)).toEqual([]);
	});

	it('rewrites `.Provider` only on values that are contexts', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/theme.ts':
				"import { createContext } from 'react';\nexport const Theme = createContext('light');\n",
			'src/index.ts': "export { Theme as AppTheme } from './theme';\n",
			'src/mode.ts':
				"import { createContext } from 'react';\nconst Mode = createContext('auto');\nexport default Mode;\n",
			'src/App.tsx':
				"import * as Tooltip from '@radix-ui/react-tooltip';\nimport { AppTheme } from './index';\nimport Mode from './mode';\nimport { Store } from './store';\n\nexport function App() {\n\treturn (\n\t\t<AppTheme.Provider value=\"dark\">\n\t\t\t<Mode.Provider value=\"light\" />\n\t\t\t<Store.Provider>\n\t\t\t\t<Tooltip.Provider />\n\t\t\t</Store.Provider>\n\t\t</AppTheme.Provider>\n\t);\n}\n",
			'src/store.tsx':
				'export const Store = { Provider: (props: { children?: unknown }) => props.children };\n',
		});
		await runCodemod([root], { verify: false });
		const app = fs.readFileSync(path.join(root, 'src/App.tsrx'), 'utf8');
		// A context re-exported under another name is still one.
		expect(app).toContain('<AppTheme value="dark">');
		expect(app).toContain('</AppTheme>');
		// So is a default-exported one.
		expect(app).toContain('<Mode value="light" />');
		// A project export that is not a context, and a package namespace, keep
		// their `.Provider`.
		expect(app).toContain('<Store.Provider>');
		expect(app).toContain('<Tooltip.Provider />');
	});

	it('reports a module the compiler rejects as an error, not a Strong blocker', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			// React warns about a textarea with both `value` and children; Octane
			// rejects it in every mode.
			'src/Note.tsx':
				'export function Note({ v }: { v: string }) {\n\treturn <textarea value={v}>text</textarea>;\n}\n',
		});
		const [file] = (await runCodemod([root], { write: false, strong: true })).files;
		expect(file.strong).toBe(false);
		expect(file.diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual(['error COMPILE_ERROR']);
	});

	it('makes a module that keeps JSX TSRX, unchecked when it was JavaScript', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'index.html': '<script type="module" src="/src/main.jsx"></script>',
			'stress.html': '<script type="module" src="./src/main.jsx"></script>',
			'src/main.jsx':
				"import { createRoot } from 'react-dom/client';\nimport { App } from './App';\ncreateRoot(document.body).render(<App />);\n",
			'src/App.jsx': 'export function App() {\n\treturn <p />;\n}\n',
		});
		const result = await runCodemod([root]);
		expect(result.files.map((file) => [file.file, file.output])).toEqual([
			['src/App.jsx', 'src/App.tsrx'],
			['src/main.jsx', 'src/main.tsrx'],
		]);
		const read = (/** @type {string} */ name) => fs.readFileSync(path.join(root, name), 'utf8');
		expect(read('index.html')).toContain('src="/src/main.tsrx"');
		// Every page of a multi-page app, not only `index.html`.
		expect(read('stress.html')).toContain('src="./src/main.tsrx"');
		expect(read('src/main.tsrx')).toMatch(/^\/\/ @ts-nocheck\n/);
		expect(read('src/main.tsrx')).toContain("import { App } from './App.tsrx';");
	});

	it('resolves tsconfig path aliases to renamed modules', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'tsconfig.json': '{ "compilerOptions": { "paths": { "~/*": ["./src/*"] } } }',
			'src/components/Card.tsx': 'export function Card() {\n\treturn <p />;\n}\n',
			'src/components/index.tsx': "export { Card } from './Card';\n",
			'src/App.tsx':
				"import { Card } from '~/components/Card';\nimport * as all from '~/components';\nexport function App() {\n\treturn <Card />;\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		const app = result.files.find((file) => file.file === 'src/App.tsx')?.code;
		expect(app).toContain("from '~/components/Card.tsrx'");
		expect(app).toContain("from '~/components/index.tsrx'");
	});

	it('maps `use-sync-external-store/with-selector` to its binding', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/useSettings.ts':
				"import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector';\nexport const useSettings = (store: { subscribe(l: () => void): () => void; get(): { theme: string } }) =>\n\tuseSyncExternalStoreWithSelector(store.subscribe, store.get, store.get, (settings) => settings.theme);\n",
		});
		const result = await runCodemod([root], { write: false });
		const settings = result.files.find((file) => file.file === 'src/useSettings.ts');
		expect(settings?.code).toContain(
			"import { useSyncExternalStoreWithSelector } from '@octanejs/use-sync-external-store/with-selector';",
		);
		expect(result.packages).toContainEqual({
			from: 'use-sync-external-store',
			to: '@octanejs/use-sync-external-store',
		});
		expect(settings?.diagnostics).toEqual([]);
	});

	it('maps module augmentation, aggregate subpaths, and reports `/react` entries', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/router.d.ts':
				"declare module '@tanstack/react-router' {\n\tinterface Register { router: unknown }\n}\nexport {};\n",
			// Custom elements: Octane's JSX namespace is `octane/jsx-runtime`'s.
			'src/elements.d.ts':
				"import type { HTMLAttributes } from 'react';\ndeclare module 'react' {\n\tnamespace JSX {\n\t\tinterface IntrinsicElements { 'x-clock': HTMLAttributes<HTMLElement> }\n\t}\n}\n",
			'src/css.d.ts':
				"import 'react';\ndeclare module 'react' {\n\tinterface CSSProperties { [name: `--${string}`]: string }\n}\n",
			'src/clock.d.ts':
				"import 'react';\ndeclare module 'react' {\n\tnamespace JSX {\n\t\tinterface IntrinsicElements { 'x-clock': { time?: string } }\n\t}\n}\n",
			// A script: no import or export at all.
			'src/meter.d.ts':
				"declare module 'react' {\n\tnamespace JSX {\n\t\tinterface IntrinsicElements { 'x-meter': { value?: number } }\n\t}\n}\n",
			'src/Chart.tsx':
				"import { Pack } from '@visx/hierarchy';\nimport { Markdown } from '@tanstack/markdown/react';\nimport { createServerFn } from '@tanstack/react-start';\nexport function Chart() {\n\treturn <Pack><Markdown /></Pack>;\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		const code = (/** @type {string} */ name) => result.files.find((f) => f.file === name)?.code;
		expect(code('src/router.d.ts')).toContain("declare module '@octanejs/tanstack-router' {");
		expect(code('src/elements.d.ts')).toBe(
			"import type { HTMLAttributes } from 'octane';\ndeclare module 'octane/jsx-runtime' {\n\tnamespace JSX {\n\t\tinterface IntrinsicElements { 'x-clock': HTMLAttributes<HTMLElement> }\n\t}\n}\n",
		);
		const css = result.files.find((f) => f.file === 'src/css.d.ts');
		expect(css?.notes.map((note) => note.rule)).toEqual(['unsupported-api']);
		expect(css?.diagnostics).toEqual([]);
		// Without its `import 'react'` the file would be a script, whose `declare
		// module` replaces the module's types instead of adding to them.
		expect(css?.code.startsWith("export {};\ndeclare module 'react' {")).toBe(true);
		expect(
			code('src/clock.d.ts')?.startsWith("export {};\ndeclare module 'octane/jsx-runtime' {"),
		).toBe(true);
		expect(
			code('src/meter.d.ts')?.startsWith("export {};\ndeclare module 'octane/jsx-runtime' {"),
		).toBe(true);
		expect(code('src/Chart.tsx')).toContain("from '@octanejs/visx/hierarchy'");
		expect(code('src/Chart.tsx')).toContain("from '@octanejs/tanstack-start'");
		expect(result.missing.map((port) => port.name)).toEqual(['@tanstack/markdown/react']);
	});

	it('maps next-themes, which has no React-shaped name, to its binding', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/Theme.tsx':
				"import { ThemeProvider, useTheme } from 'next-themes';\nimport type { ThemeProviderProps } from 'next-themes';\nfunction Toggle() {\n\tconst { resolvedTheme, setTheme } = useTheme();\n\treturn <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>Toggle</button>;\n}\nexport function Providers(props: ThemeProviderProps) {\n\treturn <ThemeProvider attribute=\"class\" {...props}><Toggle /></ThemeProvider>;\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		const theme = result.files.find((file) => file.file === 'src/Theme.tsx');
		expect(theme?.output).toBe('src/Theme.tsrx');
		expect(theme?.code).toContain(
			"import { ThemeProvider, useTheme } from '@octanejs/next-themes';",
		);
		expect(theme?.code).toContain(
			"import type { ThemeProviderProps } from '@octanejs/next-themes';",
		);
		expect(theme?.code).not.toContain("'next-themes'");
		expect(result.packages).toEqual([{ from: 'next-themes', to: '@octanejs/next-themes' }]);
		expect(result.missing).toEqual([]);
		expect(theme?.diagnostics).toEqual([]);
	});

	it('imports each Radix primitive package as its namespace of `@octanejs/radix`', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/ui.tsx': [
				"import * as DialogPrimitive from '@radix-ui/react-dialog';",
				"import { Root as PopoverRoot, PopoverTrigger, PopoverContent, type PopoverProps } from '@radix-ui/react-popover';",
				"import type { CheckedState } from '@radix-ui/react-checkbox';",
				"import { Slot } from '@radix-ui/react-slot';",
				"import { CheckIcon } from '@radix-ui/react-icons';",
				'',
				'export const DialogTitle = DialogPrimitive.DialogTitle;',
				'export function Menu(props: PopoverProps & { checked: CheckedState }) {',
				'\treturn (',
				'\t\t<PopoverRoot {...props}>',
				'\t\t\t<PopoverTrigger><Slot><CheckIcon /></Slot></PopoverTrigger>',
				'\t\t\t<PopoverContent><DialogPrimitive.Content /></PopoverContent>',
				'\t\t</PopoverRoot>',
				'\t);',
				'}',
				'',
			].join('\n'),
		});
		const result = await runCodemod([root], { write: false });
		const [file] = result.files;
		expect(file.diagnostics).toEqual([]);
		expect(file.code).toContain("import { Popover, type Checkbox } from '@octanejs/radix';");
		// shadcn's spelling: the package's namespace import is the binding's namespace.
		expect(file.code).toContain("import { Dialog as DialogPrimitive } from '@octanejs/radix';");
		// Radix exports each part twice, as `Title` and `DialogTitle`.
		expect(file.code).toContain('export const DialogTitle = DialogPrimitive.Title;');
		expect(file.code).toContain('<DialogPrimitive.Content />');
		expect(file.code).toContain(
			'const { Root: PopoverRoot, PopoverTrigger, Content: PopoverContent } = Popover;',
		);
		expect(file.code).toContain('type CheckedState = Checkbox.CheckedState;');
		expect(file.code).toContain("import { Slot } from '@octanejs/radix';");
		// The binding has no props types, so that import stays for a person.
		expect(file.code).toContain("import { type PopoverProps } from '@radix-ui/react-popover';");
		expect(file.notes.filter((note) => note.rule === 'bindings')).toEqual([
			expect.objectContaining({
				line: 2,
				message: expect.stringContaining('`Popover.PopoverProps`'),
			}),
			// No primitive of the binding serves icons.
			expect.objectContaining({ message: expect.stringContaining('`@radix-ui/react-icons`') }),
		]);
		expect(result.packages.map((entry) => entry.from)).toEqual([
			'@radix-ui/react-dialog',
			'@radix-ui/react-popover',
			'@radix-ui/react-checkbox',
			'@radix-ui/react-slot',
		]);
		expect(new Set(result.packages.map((entry) => entry.to))).toEqual(new Set(['@octanejs/radix']));
		expect(result.missing.map((entry) => entry.name)).toEqual(['@radix-ui/react-icons']);
	});

	it('reports exactly the Radix exports `@octanejs/radix` lacks', async () => {
		const radix = path.join(REPO, 'packages/radix');
		// The binding's own dev dependency on `radix-ui` installs every primitive package.
		const upstream = createRequire(
			createRequire(path.join(radix, 'package.json')).resolve('radix-ui'),
		);
		const options = {
			noEmit: true,
			skipLibCheck: true,
			strict: true,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			target: ts.ScriptTarget.ESNext,
			allowImportingTsExtensions: true,
		};
		const exportsOf = (/** @type {ts.Program} */ program, /** @type {string} */ file) => {
			const checker = program.getTypeChecker();
			const module = checker.getSymbolAtLocation(
				/** @type {ts.SourceFile} */ (program.getSourceFile(file)),
			);
			return checker.getExportsOfModule(/** @type {ts.Symbol} */ (module)).map((symbol) => ({
				symbol,
				target: symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
			}));
		};
		const index = path.join(radix, 'src/index.ts');
		const binding = ts.createProgram([index], options);
		const ported = new Map(
			exportsOf(binding, index)
				.filter(({ target }) => target.flags & ts.SymbolFlags.ValueModule)
				.map(({ symbol, target }) => [
					symbol.name,
					binding
						.getTypeChecker()
						.getExportsOfModule(target)
						.map((member) => member.name),
				]),
		);
		// `@radix-ui/react-slot`'s exports are the binding's own.
		ported.set('Slot', ['Slot', 'Slottable']);
		const packages = [...ported].map(([name, names]) => {
			const kebab = name.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase());
			const types = path.join(
				path.dirname(upstream.resolve(`@radix-ui/react-${kebab}`)),
				'index.d.ts',
			);
			return { name, names, module: `@radix-ui/react-${kebab}`, types };
		});
		const declarations = ts.createProgram(
			packages.map((entry) => entry.types),
			options,
		);
		const read = (
			/** @type {{ symbol: ts.Symbol, target: ts.Symbol }} */ { target },
			/** @type {string} */ name,
			/** @type {number} */ i,
		) =>
			target.flags & ts.SymbolFlags.Value
				? `export const v${i} = ${name};`
				: `export type T${i} = ${name};`;
		// Per package, a module that reads every export through a namespace import,
		// and one that imports by name every export the binding shares with it.
		const root = project({
			'package.json': '{ "name": "app" }',
			...Object.fromEntries(
				packages.flatMap(({ name, names, module, types }) => {
					const upstream = exportsOf(declarations, types);
					const shared = upstream.filter(({ symbol }) => names.includes(symbol.name));
					return [
						[
							`src/${name}.ts`,
							[
								`import * as N from '${module}';`,
								...upstream.map((e, i) => read(e, `N.${e.symbol.name}`, i)),
							].join('\n'),
						],
						[
							`src/${name}.named.ts`,
							[
								`import { ${shared.map((e) => e.symbol.name).join(', ')} } from '${module}';`,
								...shared.map((e, i) => read(e, e.symbol.name, i)),
							].join('\n'),
						],
					];
				}),
			),
		});
		fs.mkdirSync(path.join(root, 'node_modules/@octanejs'), { recursive: true });
		fs.symlinkSync(radix, path.join(root, 'node_modules/@octanejs/radix'), 'dir');
		const result = await runCodemod([root], { verify: false });
		expect(result.missing).toEqual([]);

		const migrated = ts.createProgram(
			result.files.map((file) => path.join(root, file.output)),
			options,
		);
		const at = (
			/** @type {import('../src/project.js').FileResult} */ file,
			/** @type {number} */ line,
		) => `${file.file}: ${file.code.split('\n')[line - 1]}`;
		const reported = result.files.flatMap((file) => file.notes.map((note) => at(file, note.line)));
		const failing = result.files.flatMap((file) => {
			const source = /** @type {ts.SourceFile} */ (
				migrated.getSourceFile(path.join(root, file.output))
			);
			return migrated
				.getSemanticDiagnostics(source)
				.map((d) =>
					at(file, source.getLineAndCharacterOfPosition(/** @type {number} */ (d.start)).line + 1),
				);
		});
		// Every name the migrated code reads exists in the binding, except the ones
		// the codemod reported, and it reported nothing that exists.
		expect(reported.sort()).toEqual(failing.sort());
		expect(reported.length).toBeGreaterThan(0);
	}, 60_000);

	it("imports TanStack's Octane adapters, with their names for React-named types", async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/kit.ts': [
				"import { flexRender, useReactTable, useTable, type ReactTable } from '@tanstack/react-table';",
				"import { useHotkey, type ReactHotkeyRecorder } from '@tanstack/react-hotkeys';",
				"import { useDebouncer, type ReactDebouncer } from '@tanstack/react-pacer/debouncer';",
				"import { PacerProvider, usePacerContext } from '@tanstack/react-pacer';",
				"export { createColumnHelper, getCoreRowModel, type ReactTable as Table } from '@tanstack/react-table';",
				'',
				'export type Kit = [ReactTable<any, any>, ReactHotkeyRecorder, ReactDebouncer<() => void, any>];',
				'export const kit = [flexRender, useReactTable, useTable, useHotkey, useDebouncer, PacerProvider, usePacerContext];',
				'',
			].join('\n'),
		});
		const result = await runCodemod([root], { write: false, verify: false });
		const [file] = result.files;
		expect(file.code).toContain(
			"import { flexRender, useTable, type OctaneTable as ReactTable } from '@tanstack/octane-table';",
		);
		expect(file.code).toContain(
			"import { useHotkey, type OctaneHotkeyRecorder as ReactHotkeyRecorder } from '@tanstack/octane-hotkeys';",
		);
		expect(file.code).toContain(
			"import { useDebouncer, type OctaneDebouncer as ReactDebouncer } from '@tanstack/octane-pacer/debouncer';",
		);
		expect(file.code).toContain("import { PacerProvider } from '@tanstack/octane-pacer';");
		// What the adapters lack stays on React's, with what to do instead.
		expect(file.code).toContain("import { useReactTable } from '@tanstack/react-table';");
		expect(file.code).toContain("import { usePacerContext } from '@tanstack/react-pacer';");
		// So does a re-export.
		expect(file.code).toContain("export { getCoreRowModel } from '@tanstack/react-table';");
		expect(file.code).toContain(
			"export { createColumnHelper, type OctaneTable as Table } from '@tanstack/octane-table';",
		);
		expect(file.notes.filter((note) => note.severity === 'error')).toEqual([
			expect.objectContaining({ line: 1, message: expect.stringContaining('`useTable`') }),
			expect.objectContaining({
				line: 4,
				message: expect.stringContaining('useDefaultPacerOptions'),
			}),
			expect.objectContaining({ line: 5, message: expect.stringContaining('`getCoreRowModel`') }),
		]);
		expect(result.packages).toEqual([
			{ from: '@tanstack/react-table', to: '@tanstack/octane-table' },
			{ from: '@tanstack/react-hotkeys', to: '@tanstack/octane-hotkeys' },
			{ from: '@tanstack/react-pacer', to: '@tanstack/octane-pacer' },
		]);
		expect(result.missing).toEqual([]);
	});

	it('maps the legacy dnd kit packages to their Octane ports', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/Tabs.tsx': [
				"import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';",
				"import { restrictToFirstScrollableAncestor, restrictToHorizontalAxis } from '@dnd-kit/modifiers';",
				"import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';",
				"import { CSS } from '@dnd-kit/utilities';",
				"import { LiveRegion } from '@dnd-kit/accessibility';",
				'const modifiers = [restrictToHorizontalAxis, restrictToFirstScrollableAncestor];',
				'function Tab({ id }: { id: string }) {',
				'\tconst { listeners, setNodeRef, transform, transition } = useSortable({ id });',
				'\tconst style = { transform: CSS.Translate.toString(transform), transition };',
				'\treturn <button ref={setNodeRef} style={style} {...listeners}>{id}</button>;',
				'}',
				'export function Tabs({ ids }: { ids: string[] }) {',
				'\tconst sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));',
				'\treturn (',
				'\t\t<DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={modifiers}>',
				'\t\t\t<SortableContext items={ids} strategy={horizontalListSortingStrategy}>',
				'\t\t\t\t{ids.map((id) => <Tab key={id} id={id} />)}',
				'\t\t\t</SortableContext>',
				'\t\t\t<LiveRegion id="tabs-status" announcement="" />',
				'\t\t</DndContext>',
				'\t);',
				'}',
				'',
			].join('\n'),
		});
		const result = await runCodemod([root], { write: false });
		const code = result.files.find((f) => f.file === 'src/Tabs.tsx')?.code ?? '';
		for (const name of ['core', 'modifiers', 'sortable', 'utilities', 'accessibility']) {
			expect(code).toContain(`from '@octanejs/dnd-kit-${name}'`);
			expect(code).not.toContain(`from '@dnd-kit/${name}'`);
		}
		expect(result.packages).toEqual(
			expect.arrayContaining(
				['core', 'modifiers', 'sortable', 'utilities', 'accessibility'].map((name) => ({
					from: `@dnd-kit/${name}`,
					to: `@octanejs/dnd-kit-${name}`,
				})),
			),
		);
		expect(result.missing).toEqual([]);
	});

	it('reports React packages from their installed manifest, not their name', async () => {
		const manifest = (/** @type {object} */ fields) =>
			JSON.stringify({ version: '1.0.0', ...fields });
		const root = project({
			'package.json': '{ "name": "app" }',
			// React is an optional peer for the `/react` entry only.
			'node_modules/editor-kit/package.json': manifest({
				exports: { '.': './index.js', './react': './react.js', './package.json': './package.json' },
				peerDependencies: { react: '>=18' },
				peerDependenciesMeta: { react: { optional: true } },
			}),
			// An optional peer with no `/react` entry may be for the root.
			'node_modules/hooks-kit/package.json': manifest({
				exports: { '.': './index.js', './package.json': './package.json' },
				peerDependencies: { react: '>=18' },
				peerDependenciesMeta: { react: { optional: true } },
			}),
			// A required peer, but only the `/react` entry renders through it.
			'node_modules/tree-kit/package.json': manifest({
				exports: { '.': './index.js', './react': './react.js', './package.json': './package.json' },
				peerDependencies: { react: '*' },
			}),
			// The export map hides package.json, and the name looks like React.
			'node_modules/@vitejs/plugin-react/package.json': manifest({
				exports: { '.': './index.js' },
			}),
			'node_modules/react-widget/package.json': manifest({ peerDependencies: { react: '*' } }),
			'src/build.ts':
				"import react from '@vitejs/plugin-react';\nexport const plugins = [react()];\n",
			'src/Note.tsx':
				"import { parse } from 'editor-kit';\nimport { Editor } from 'editor-kit/react';\nimport { Widget } from 'react-widget';\nimport { tree } from 'tree-kit';\nimport { useKit } from 'hooks-kit';\nconsole.log(tree, useKit);\nexport function Note() {\n\treturn <Editor doc={parse('')}><Widget /></Editor>;\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		expect(result.missing.map((port) => port.name)).toEqual([
			'editor-kit/react',
			'hooks-kit',
			'react-widget',
		]);
	});

	it('hosts components of a React package with no port in `ReactCompat` islands', async () => {
		const manifest = (/** @type {string} */ version, /** @type {object} */ fields = {}) =>
			JSON.stringify({ version, ...fields });
		/** @param {string} react */
		const app = (react) =>
			project({
				'package.json': '{ "name": "app" }',
				'node_modules/react/package.json': manifest(react),
				'node_modules/react-dom/package.json': manifest(react),
				'node_modules/toast-kit/package.json': manifest('2.6.0', {
					types: 'index.d.ts',
					peerDependencies: { react: '>=18' },
				}),
				// A prop typed for an element may still be given text.
				'node_modules/toast-kit/index.d.ts':
					'type ReactNode = string | { element: true };\nexport declare function Toaster(props: { position?: string; label?: ReactNode }): null;\nexport declare function toast(text: string): void;\nexport declare function useToaster(): { toasts: string[] };\n',
				'tsconfig.json': '{ "compilerOptions": { "strict": true, "jsx": "preserve" } }',
				'src/main.tsx':
					'import { Toaster } from \'toast-kit\';\nexport function Main() {\n\treturn <main><Toaster position="top-right" label="Saved" /></main>;\n}\n',
				'src/notify.ts':
					"import { toast, useToaster } from 'toast-kit';\nexport const notify = (text: string) => toast(text);\nexport const useCount = () => useToaster().toasts.length;\n",
			});
		const result = await runCodemod([app('19.2.6')], { write: false, strong: true });
		expect(result.missing).toEqual([{ name: 'toast-kit', modules: 2, islands: 1, blocked: 1 }]);
		const main = result.files.find((file) => file.file === 'src/main.tsx');
		expect(main?.code).toContain(
			'<ReactCompat><Toaster position="top-right" label="Saved" /></ReactCompat>',
		);
		expect([main?.strong, main?.diagnostics]).toEqual([true, []]);
		// `ReactCompat` needs the React 19 series from 19.2.
		for (const react of ['18.3.1', '20.0.0']) {
			const other = await runCodemod([app(react)], { write: false });
			expect(other.missing).toEqual([{ name: 'toast-kit', modules: 2, islands: 0, blocked: 2 }]);
		}
	});

	it('maps react-hot-toast to its binding instead of hosting it in React', async () => {
		// Memos' shape: one <Toaster> at the root, toast() calls everywhere else.
		const root = project({
			'package.json': '{ "name": "app" }',
			'node_modules/react-hot-toast/package.json': JSON.stringify({
				version: '2.6.1',
				peerDependencies: { react: '>=16', 'react-dom': '>=16' },
			}),
			'src/main.tsx':
				"import { Toaster } from 'react-hot-toast';\nexport function App() {\n\treturn <Toaster position=\"top-right\" toastOptions={{ style: { fontSize: '14px' } }} />;\n}\n",
			'src/notify.ts':
				"import toast from 'react-hot-toast';\nimport { useToaster } from 'react-hot-toast/headless';\nexport const notify = () => toast.success('Saved');\nexport { useToaster };\n",
		});
		const result = await runCodemod([root], { write: false });
		const code = (/** @type {string} */ name) => result.files.find((f) => f.file === name)?.code;
		expect(result.missing).toEqual([]);
		expect(result.packages).toEqual([{ from: 'react-hot-toast', to: '@octanejs/hot-toast' }]);
		expect(code('src/main.tsx')).toContain("import { Toaster } from '@octanejs/hot-toast';");
		expect(code('src/main.tsx')).not.toMatch(/ReactCompat|octane\/react/);
		expect(code('src/notify.ts')).toContain("import toast from '@octanejs/hot-toast';");
		expect(code('src/notify.ts')).toContain("from '@octanejs/hot-toast/headless'");
	});

	it('reports TSRX written for React, which it cannot read', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/App.tsrx': "import { useState } from 'react';\nexport function App() @{\n\t<p />\n}\n",
			'src/Octane.tsrx': "import { useState } from 'octane';\nexport function O() @{\n\t<p />\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		expect(result.files.map((file) => [file.file, file.notes.map((n) => n.rule)])).toEqual([
			['src/App.tsrx', ['tsrx-react']],
		]);
	});

	it('writes nothing in a dry run', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/A.tsx': 'export function A() {\n\treturn <p />;\n}\n',
		});
		const result = await runCodemod([root], { write: false });
		expect(result.files[0]).toMatchObject({ output: 'src/A.tsrx', changed: true });
		expect(fs.existsSync(path.join(root, 'src/A.tsx'))).toBe(true);
		expect(fs.existsSync(path.join(root, 'src/A.tsrx'))).toBe(false);
	});

	it('spells holes as text through imported types, only under strictNullChecks', async () => {
		const files = {
			'package.json': '{ "name": "app" }',
			'src/types.ts': 'export interface Story { title: string; score: number; by?: string }\n',
			'src/Story.tsx':
				"import type { Story } from './types.js';\nexport function Row({ story }: { story: Story }) {\n\treturn <p>{story.title} {story.score} {story.by}</p>;\n}\n",
		};
		const strict = project({
			...files,
			'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
		});
		const loose = project({ ...files, 'tsconfig.json': '{ "compilerOptions": {} }' });
		const code = async (/** @type {string} */ root) =>
			(await runCodemod([root], { write: false })).files.find((f) => f.file === 'src/Story.tsx')
				?.code;
		// An optional `by` may be undefined, which React renders as nothing.
		expect(await code(strict)).toContain(
			'<p>{story.title as string} {String(story.score)} {story.by}</p>',
		);
		expect(await code(loose)).toContain('<p>{story.title} {story.score} {story.by}</p>');
	});

	it('leaves a text field spread alone when its type has no `onChange`', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
			'src/Field.tsx':
				'type Props = { value: string; readOnly: true };\nexport function Field({ ...props }: Props) {\n\treturn <input {...props} />;\n}\n',
		});
		const [file] = (await runCodemod([root], { write: false })).files;
		expect(file.code).toContain(
			'export function Field({ ...props }: Props) @{\n\t<input {...props} />',
		);
		expect(file.notes).toEqual([]);
	});

	it("reads `target` as `currentTarget` where a component's types say it is a control", async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
			'src/Form.tsx':
				// React 19.2 types name the target too: `ChangeEvent<CurrentTarget, Target>`.
				'interface ChangeEvent<C, T> { target: T; currentTarget: C }\nfunction Input(_: { onChange(e: ChangeEvent<HTMLInputElement, HTMLInputElement>): void }) {\n\treturn <input />;\n}\nexport function Form({ set }: { set(v: string): void }) {\n\treturn <Input onChange={(e) => set(e.target.value)} />;\n}\n',
		});
		const [file] = (await runCodemod([root], { write: false })).files;
		expect(file.code).toContain('<Input onChange={(e) => set(e.currentTarget.value)} />');
	});

	// Compiles every module of the app twice; under CI load that can pass the default 5 s.
	it('migrates the Hacker News reader to modules matching its hand-written TSRX twin', async () => {
		const example = path.join(REPO, 'examples/hacker-news');
		const twin = fs
			.readdirSync(path.join(example, 'tsrx'))
			.filter((name) => name.endsWith('.tsrx'))
			.sort();

		const result = await runCodemod([path.join(example, 'jsx')], { root: example, write: false });
		const renamed = result.files
			.filter((file) => file.output.endsWith('.tsrx'))
			.map((file) => path.basename(file.output))
			.sort();
		// The entries are TSRX too; the twin's are hand-written as `.tsx`.
		expect(renamed).toEqual([...twin, 'entry-client.tsrx', 'entry-server.tsrx'].sort());
		expect(
			result.files.flatMap((file) => file.diagnostics.filter((d) => d.severity === 'error')),
		).toEqual([]);

		const strong = await runCodemod([path.join(example, 'jsx')], {
			root: example,
			write: false,
			strong: true,
		});
		const blockers = new Set(
			strong.files
				.filter((file) => file.strong === false)
				.flatMap((file) => file.diagnostics.map((d) => d.code)),
		);
		// Only raw HTML, which needs a person to vouch for it with trustHTML(),
		// keeps a module out of Strong mode.
		expect([...blockers]).toEqual(['OCTANE_STRONG_UNTRUSTED_HTML']);
		expect(
			strong.files
				.filter((file) => file.strong === true)
				.map((file) => path.basename(file.output))
				.sort(),
		).toEqual([
			'App.tsrx',
			'NotFound.tsrx',
			'Pending.tsrx',
			'RootLayout.tsrx',
			'StoriesPage.tsrx',
			'StoryRow.tsrx',
			'entry-client.tsrx',
			'entry-server.tsrx',
		]);
	}, 30_000);
});
