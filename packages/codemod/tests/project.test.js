import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
		]);
		expect(result.missing).toEqual(['@radix-ui/react-slot']);
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
		expect(result.missing).toEqual(['@tanstack/markdown/react']);
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
				"import { parse } from 'editor-kit';\nimport { Editor } from 'editor-kit/react';\nimport { Widget } from 'react-widget';\nimport { tree } from 'tree-kit';\nconsole.log(tree);\nexport function Note() {\n\treturn <Editor doc={parse('')}><Widget /></Editor>;\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		expect(result.missing.sort()).toEqual(['editor-kit/react', 'react-widget']);
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
