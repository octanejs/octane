import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA } from '@octanejs/cli/data';
import { JSDOM } from 'jsdom';
import * as ReactServerBridge from 'octane/react/server';
import { prerender } from 'octane/static';
import { createElement as reactElement, isValidElement } from 'react';
import { renderToStaticMarkup as renderReact } from 'react-dom/server';
import { compileTypesInspection } from 'octane/compiler/volar';
import { renderToStaticMarkup } from 'octane/server';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { createScopedSignalRecipe, runCodemod } from '../dist/index.js';
import { bundleRuntime, installDOM } from './bundle-runtime.js';

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

/** @param {string} name */
function catalogVersion(name) {
	return DATA.bindings.find((binding) => binding.name === name)?.version;
}

/** @param {string} root */
function typecheckProject(root) {
	const cli = path.join(REPO, 'scripts/octane-tsc/bin.mjs');
	execFileSync(process.execPath, [cli, '-p', 'tsconfig.json'], { cwd: root });
}

describe('runCodemod', () => {
	const reactLeaf =
		"import {useState} from 'react'; export default function Leaf(){const [n]=useState(1);return <button>{n}</button>}";
	const boundaryImports =
		"import {ReactCompat as Island} from 'octane/react'; import Leaf from './Leaf';";
	const islandOwner =
		boundaryImports + 'export function Owner(){return <Island component={Leaf}/>}';

	it.each([
		[
			'selected island and mixed caller',
			'Owner.tsx',
			islandOwner,
			['Owner.tsx', 'Native.tsx', 'Leaf.tsx'],
		],
		['unselected issuer', 'Owner.tsx', islandOwner, ['Leaf.tsx']],
		...[
			['short-circuit child', '<Island>{shown && <Leaf/>}</Island>'],
			['short-circuit component', '<Island component={shown && Leaf}/>'],
			['first OR component', '<Island component={Leaf || other}/>'],
			['fallback OR component', '<Island component={other || Leaf}/>'],
			['first nullish component', '<Island component={Leaf ?? other}/>'],
			['fallback nullish component', '<Island component={other ?? Leaf}/>'],
		].map(([name, jsx]) => [
			name,
			'Owner.tsx',
			boundaryImports + `export function Owner({shown,other}){return ${jsx}}`,
			['Leaf.tsx'],
		]),
		[
			'explicit undefined component',
			'Owner.tsx',
			boundaryImports + 'export const Owner=()=> <Island component={undefined}><Leaf/></Island>',
			['Leaf.tsx'],
		],
		[
			'escaped module',
			'Owner.tsx',
			islandOwner.replace('octane/react', String.raw`octane/react`),
			['Leaf.tsx'],
		],
		[
			'native issuer and conditional children',
			'Owner.tsrx',
			boundaryImports +
				'export function Owner({shown})@{<Island>{shown ? <Leaf/> : <Leaf/>}</Island>}',
			['Leaf.tsx'],
		],
		[
			'namespace and conditional component prop',
			'Owner.tsx',
			"import * as Bridge from 'octane/react/server'; import * as Views from './Leaf'; export function Owner({shown}){return <Bridge.ReactCompatInline component={shown ? Views.default : Views.default}/>}",
			['Leaf.tsx'],
		],
	])('keeps React island sources on disk for a %s', async (_, issuer, source, selected) => {
		const sources = {
			[issuer]: source,
			'Leaf.tsx': reactLeaf,
			'Native.tsx': "import Leaf from './Leaf'; export function Native(){return <Leaf/>}",
			'index.html': '<script type="module" src="./Leaf.tsx"></script>',
		};
		const root = project(sources);
		for (const write of [false, true]) {
			const result = await runCodemod(
				selected.map((f) => path.join(root, f)),
				{ root, write },
			);
			if (!write) expect(result.files.map((f) => f.file)).toEqual(expect.arrayContaining(selected));
			expect(result.files.flatMap((f) => f.notes)).toContainEqual(
				expect.objectContaining({
					rule: 'react-compat',
					severity: 'error',
					message: expect.stringContaining('Leaf.tsx'),
				}),
			);
			for (const [f, original] of Object.entries(sources))
				expect(fs.readFileSync(path.join(root, f), 'utf8')).toBe(original);
			expect(fs.existsSync(path.join(root, 'Leaf.tsrx'))).toBe(false);
		}
	});

	describe('React-hosted Octane SSR', () => {
		const leaf = `/** @jsxImportSource octane */
			import { ReactCompat as Reverse } from 'octane/react';
			import { Child } from './Child.js';
			export function Leaf() { return <Reverse component={Child} />; }
			export const Native = () => <b>native</b>;`;
		const server = "import { OctaneCompat as Host } from 'octane/react/server';";
		const child = "import { Leaf } from './Leaf.tsx';";
		const owner = 'export function App() { return <Host component={Leaf} />; }';
		const app = (/** @type {string} */ host, source = leaf, paths = {}) => {
			const files = {
				'package.json': '{"name":"app","type":"module"}',
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						jsx: 'react-jsx',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						paths,
					},
				}),
				'App.server.tsx': host,
				'Leaf.tsx': source,
				'Child.js':
					"import {createElement} from 'react'; export const Child = () => createElement('b', null, 'React child');",
				'Other.ts': 'export function OctaneCompat() { return null; }',
				'index.html': '<script type="module" src="./Leaf.tsx"></script>',
			};
			const root = project(files);
			const modules = path.join(root, 'node_modules');
			fs.mkdirSync(modules);
			for (const name of ['octane', 'react', 'react-dom'])
				fs.symlinkSync(
					fs.realpathSync(path.join(import.meta.dirname, '../node_modules', name)),
					path.join(modules, name),
					'dir',
				);
			return { root, files, selected: [path.join(root, 'Leaf.tsx')] };
		};
		const error = expect.objectContaining({
			rule: 'react-compat',
			severity: 'error',
			message: expect.stringContaining('React SSR cannot render Leaf.tsrx inside OctaneCompat'),
		});

		it.each([
			['component', `${server}\n${child}\n${owner}`, leaf],
			[
				'explicit automatic JSX',
				`/** @jsxRuntime automatic */\n${server}\n${child}\n${owner}`,
				leaf,
			],
			[
				'default arrow host',
				`${server}\n${child}\nexport default () => <Host component={Leaf} />;`,
				leaf,
			],
			[
				'default local leaf',
				`${server}\nimport Leaf from './Leaf.tsx';\n${owner}`,
				leaf.replace('export function Leaf', 'function Leaf') + '\nexport default (Leaf);',
			],
			[
				'default arrow leaf',
				`${server}\nimport Leaf from './Leaf.tsx';\n${owner}`,
				leaf.replace(
					'export function Leaf() { return <Reverse component={Child} />; }',
					'export default () => <Reverse component={Child} />;',
				),
			],
			[
				'paired component',
				`${server}\n${child}\n${owner.replace(' />', '>\n{/* comment */}\n</Host>')}`,
				leaf,
			],
			[
				'paired element child',
				`${server}\n${child}\nexport function App() { return <Host>\n{/* comment */}\n<Leaf></Leaf>\n</Host>; }`,
				leaf,
			],
			[
				'component with props',
				`${server}\n${child}\nexport const App = () => <Host component={Leaf} props={{ label: 'name' }} />;`,
				leaf,
			],
			[
				'child with default leaf',
				`/** @jsxImportSource react */\n${server}\nimport Leaf from './Leaf.tsx';\nexport default function App() { return <Host>\n<Leaf label="name" />\n</Host>; }`,
				leaf
					.replace('export function Leaf', 'export default function Leaf')
					.replace('ReactCompat as Reverse', 'ReactCompatInline as Reverse'),
			],
			[
				'const leaf',
				`${server}\n${child}\n${owner}`,
				leaf.replace(
					'export function Leaf() { return <Reverse component={Child} />; }',
					'export const Leaf = () => <Reverse><Child /></Reverse>;',
				),
			],
		])('reports a direct %s edge before writing', async (_, issuer, source) => {
			const { root, files, selected } = app(issuer, source);
			const preview = await runCodemod(selected, { root, strong: true, write: false });
			const migrated = preview.files.find((f) => f.file === 'Leaf.tsx');
			const host = preview.files.find((f) => f.file === 'App.server.tsx');
			expect(migrated?.strong).toBe(true);
			expect(migrated?.notes).toContainEqual(error);
			expect(host?.notes).toContainEqual(error);
			expect(host?.code).toContain("'./Leaf.tsrx'");
			const refused = await runCodemod(selected, { root, strong: true });
			expect(refused.files).toEqual([
				expect.objectContaining({ file: 'App.server.tsx', changed: false, notes: [error] }),
			]);
			for (const [file, text] of Object.entries(files))
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(text);
			expect(fs.existsSync(path.join(root, 'Leaf.tsrx'))).toBe(false);
		});

		it.each([
			['explicit classic JSX', `/** @jsxRuntime classic */\n${server}`, child, owner],
			[
				'mutable host export',
				server,
				child,
				'export let App = () => <Host component={Leaf} />; App = () => <b>standalone</b>;',
			],
			['reassigned host function', server, child, owner + ' App = () => <b>standalone</b>;'],
			['direct eval rewriting the host', server, child, owner + ' eval("App = () => null");'],
			['client host', server.replace('/server', ''), child, owner],
			['standalone native consumer', '', child, 'export function App() { return <Leaf />; }'],
			['shadowed server host', server, child, owner.replace('App()', 'App({ Host })')],
			[
				'overridden host prop',
				server,
				child,
				owner.replace('component={Leaf}', 'component={Leaf} {...{ component: null }}'),
			],
			[
				'duplicate component prop',
				server,
				child,
				owner.replace('component={Leaf}', 'component={Leaf} component={null}'),
			],
			[
				'dynamic native selection',
				server,
				child,
				owner.replace('component={Leaf}', 'component={flag ? Leaf : null}'),
			],
			[
				'visible child whitespace',
				server,
				child,
				owner.replace('<Host component={Leaf} />', '<Host> <Leaf /> </Host>'),
			],
			['native JSX pragma', '/** @jsxImportSource octane */\n' + server, child, owner],
			['different local export', server, child.replace('{ Leaf }', '{ Native as Leaf }'), owner],
			['mapped JSX runtime', server, child, owner, { 'react/jsx-runtime': ['./Other.ts'] }],
			['mapped server import', server, child, owner, { 'octane/react/server': ['./Other.ts'] }],
		])(
			'leaves a %s outside the direct SSR diagnostic',
			async (_, hostImport, leafImport, component, paths) => {
				const { root, selected } = app(`${hostImport}\n${leafImport}\n${component}`, leaf, paths);
				const result = await runCodemod(selected, { root, strong: true, write: false });
				for (const file of result.files) expect(file.notes).not.toContainEqual(error);
			},
		);
	});

	it.each([
		['plain return', 'Leaf', '<Leaf />', '', true],
		['named import', '{ Leaf }', '<Leaf />', '', true],
		['React JSX pragma', 'Leaf', '<Leaf />', '/** @jsxImportSource react */', true],
		['native JSX', 'Leaf', '<Leaf />', '/** @jsxImportSource octane */', false],
		['mapped JSX runtime', 'Leaf', '<Leaf />', '', false],
		['lowercase tag', 'leaf', '<leaf />', '', false],
		['type-only import', 'type Leaf', '<Leaf />', '', false],
		['shadowed binding', 'Leaf', '<Leaf />', '', false],
		['explicit bridge', 'Leaf', '<OctaneCompat component={Leaf} />', '', false],
	])(
		'advises on a retained JSX issuer with a %s',
		async (shape, binding, output, pragma, warns) => {
			const root = project({
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						jsx: 'react-jsx',
						moduleResolution: 'Bundler',
						...(shape === 'mapped JSX runtime'
							? { paths: { 'react/jsx-runtime': ['./other.ts'] } }
							: {}),
					},
				}),
				'other.ts': 'export const jsx = () => null;',
				'Leaf.tsx':
					'export function Leaf() { return <button>Original</button>; }\nexport default Leaf;',
				'Owner.tsx': `${pragma}
import { OctaneCompat } from 'octane/react';
import ${binding} from './Leaf.tsx';
export function Owner(${shape === 'shadowed binding' ? '{ Leaf }' : ''}) { return ${output}; }`,
			});
			fs.symlinkSync(
				path.join(REPO, 'packages/codemod/node_modules'),
				path.join(root, 'node_modules'),
				'dir',
			);
			const selected = [path.join(root, 'Leaf.tsx')];
			const preview = await runCodemod(selected, {
				root,
				strong: true,
				verify: true,
				write: false,
			});
			const affected = preview.files
				.filter((file) =>
					file.notes.some(
						(note) => note.severity === 'warning' && note.message.includes('retained React JSX'),
					),
				)
				.map((file) => file.file);
			expect(affected).toEqual(warns ? ['Leaf.tsx', 'Owner.tsx'] : []);
			if (shape === 'plain return') {
				const result = await runCodemod(selected, { root, strong: true, verify: true });
				expect(result.files.find((file) => file.file === 'Owner.tsx')?.notes).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							severity: 'warning',
							message: expect.stringContaining('retained React JSX'),
						}),
					]),
				);
				expect(fs.readFileSync(path.join(root, 'Owner.tsx'), 'utf8')).toContain('./Leaf.tsrx');
				expect(fs.existsSync(path.join(root, 'Leaf.tsrx'))).toBe(true);
			}
		},
	);

	describe('retained React server rendering', () => {
		it.each([
			['direct JSX', 'render(<Leaf />)', '', true],
			['empty JSX pair', 'render(<Leaf></Leaf>)', '', true],
			['comment-only JSX pair', 'render(<Leaf>{/* comment */}</Leaf>)', '', true],
			['JSX pair with a child', 'render(<Leaf>child</Leaf>)', '', false],
			['direct element', 'render(h(Leaf))', '', true],
			['direct element with null props', 'render(h(Leaf, null))', '', true],
			['shadowed renderer', '((render) => render(h(Leaf)))(other)', '', false],
			['shadowed factory', '((h) => render(h(Leaf)))(other)', '', false],
			['local server alias', 'render(<Leaf />)', 'react-dom/server', false],
			['local JSX alias', 'render(<Leaf />)', 'react/jsx-runtime', false],
			['Octane JSX pragma', 'render(<Leaf />)', 'pragma', false],
			['intrinsic tag with a lowercase import', 'render(<leaf />)', '', false],
			['separate physical JSX issuer', 'render(<Leaf />)', 'jsx sibling', false],
			['unsupported element children', 'render(h(Leaf, null, load()))', '', false],
		])('reports the %s in a retained issuer', async (_, call, alias, warns) => {
			const files = {
				'package.json': '{"name":"app","type":"module"}',
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						jsx: 'react-jsx',
						moduleResolution: 'Bundler',
						...(alias.startsWith('react') ? { paths: { [alias]: ['./other.ts'] } } : {}),
					},
				}),
				'other.ts': 'export function renderToStaticMarkup() { return null; }',
				'Owner.tsx': `${alias === 'pragma' ? '/** @jsxImportSource octane */\n' : ''}
					import { renderToStaticMarkup as render } from 'react-dom/server';
					import { createElement as h } from 'react';
					import ${call.includes('<leaf') ? 'leaf' : 'Leaf'} from './Leaf.${alias === 'jsx sibling' ? 'jsx' : 'tsx'}';
					export function page() { return ${call}; }`,
				'Leaf.tsx': 'export default function Leaf() { return <button>Original</button>; }',
				'index.html': '<script type="module" src="./Leaf.tsx"></script>',
			};
			if (alias === 'jsx sibling') files['Leaf.jsx'] = "export default () => 'retained';";
			const root = project(files);
			fs.mkdirSync(path.join(root, 'node_modules'));
			for (const name of ['octane', 'react', 'react-dom'])
				fs.symlinkSync(
					fs.realpathSync(path.join(import.meta.dirname, '../node_modules', name)),
					path.join(root, 'node_modules', name),
					'dir',
				);
			fs.mkdirSync(path.join(root, 'node_modules/@types'));
			for (const name of ['react', 'react-dom']) {
				const source = createRequire(path.join(REPO, 'packages/octane/package.json')).resolve(
					`@types/${name}/package.json`,
				);
				fs.symlinkSync(path.dirname(source), path.join(root, 'node_modules/@types', name), 'dir');
			}
			const selected = [path.join(root, 'Leaf.tsx')];
			const options = { root, strong: true, verify: true };
			const warning = expect.objectContaining({
				rule: 'react-compat',
				severity: 'warning',
				message: expect.stringContaining('retained React server render'),
			});
			const preview = await runCodemod(selected, { ...options, write: false });
			for (const name of ['Leaf.tsx', 'Owner.tsx']) {
				const notes = preview.files.find((file) => file.file === name)?.notes;
				if (warns) expect(notes).toContainEqual(warning);
				else expect(notes).not.toContainEqual(warning);
			}
			for (const [name, source] of Object.entries(files))
				expect(fs.readFileSync(path.join(root, name), 'utf8')).toBe(source);
			expect(fs.existsSync(path.join(root, 'Leaf.tsrx'))).toBe(false);
		});
	});

	it.each([
		[
			'statically re-exported hook',
			"import {useLabel} from './public'; export default function Leaf(){return <b>{useLabel()}</b>}",
			false,
			true,
		],
		[
			'side-effect import',
			"import './public'; export default function Leaf(){return <b/>}",
			false,
			true,
		],
		[
			'literal dynamic import',
			"export default async function Leaf(){ const {useLabel}=await import('./public');return <b>{useLabel()}</b> }",
			false,
			true,
		],
		[
			'possibly executable unused import',
			"import {useLabel} from './public'; export default function Leaf(){return <b/>}",
			false,
			true,
		],
		[
			'declaration type import',
			"import type {Label} from './state'; export default function Leaf(){return <b/>}",
			true,
			false,
		],
		[
			'elided named type',
			"import {type Label} from './state'; export default function Leaf(){return <b/>}",
			false,
			false,
		],
		[
			'retained empty import',
			"import {type Label} from './state'; export default function Leaf(){return <b/>}",
			true,
			true,
		],
	])(
		'protects the original React execution graph for a %s',
		async (_, source, verbatimModuleSyntax, rejected) => {
			const hook =
				"import {useState} from 'react'; export type Label=string; export function useLabel(){const [v]=useState('ok');return v}";
			const root = project({
				'Owner.tsx': islandOwner,
				'Leaf.tsx': source,
				'public.ts': "export {useLabel} from './state';",
				'state.ts': hook,
				'tsconfig.json': JSON.stringify({ compilerOptions: { verbatimModuleSyntax } }),
			});
			const r = await runCodemod([path.join(root, 'state.ts')], { root, write: true });
			expect(
				r.files.some((f) =>
					f.notes.some((n) => n.rule === 'react-compat' && n.severity === 'error'),
				),
			).toBe(rejected);
			expect(fs.readFileSync(path.join(root, 'state.ts'), 'utf8') === hook).toBe(rejected);
		},
	);

	it('reports each changed React dependency in preview and blocks the whole write', async () => {
		const root = project({
			'Owner.tsx': islandOwner,
			'Leaf.tsx': "import Child from './Child'; export default function Leaf(){return <Child/>}",
			'Child.tsx': reactLeaf,
			'Other.tsx': 'export function Other(){return <aside/>}',
		});
		const selected = ['Leaf', 'Child', 'Other'].map((name) => path.join(root, name + '.tsx'));
		const preview = await runCodemod(selected, { root, write: false });
		expect(
			preview.files
				.filter((f) => f.notes.some((n) => n.rule === 'react-compat'))
				.map((f) => f.file)
				.sort(),
		).toEqual(['Child.tsx', 'Leaf.tsx']);
		expect(preview.files.find((f) => f.file === 'Other.tsx')?.changed).toBe(true);
		const result = await runCodemod(selected, { root, write: true });
		expect(result.files.some((f) => f.notes.some((n) => n.rule === 'react-compat'))).toBe(true);
		expect(
			selected.every((f) => fs.existsSync(f) && !fs.existsSync(f.replace('.tsx', '.tsrx'))),
		).toBe(true);
	});

	it('keeps an explicitly selected workspace React source reached through another path', async () => {
		const workspace = project({
			'app/Owner.tsx': islandOwner.replace('./Leaf', 'leaf'),
			'app/node_modules/.keep': '',
			'lib/package.json': '{"name":"leaf","main":"Leaf.tsx"}',
			'lib/Leaf.tsx': reactLeaf,
		});
		const root = path.join(workspace, 'app');
		const linked = path.join(root, 'node_modules/leaf');
		fs.symlinkSync(path.join(workspace, 'lib'), linked, 'dir');
		const result = await runCodemod([path.join(linked, 'Leaf.tsx')], { root, write: true });
		expect(result.files.flatMap((f) => f.notes)).toContainEqual(
			expect.objectContaining({ rule: 'react-compat', severity: 'error' }),
		);
		expect(fs.readFileSync(path.join(linked, 'Leaf.tsx'), 'utf8')).toBe(reactLeaf);
	});

	it.each([
		['unchanged React leaf', islandOwner, 'Owner.tsx', {}],
		[
			'truthiness-only import',
			boundaryImports +
				'export function Owner({other}){return <Island component={Leaf && other}/>}',
			'Leaf.tsx',
			{},
		],
		[
			'separate unfinished native module',
			'export const untouched=true;',
			'Leaf.tsx',
			{ 'Unfinished.tsrx': boundaryImports + 'export function Draft()@{<' },
		],
		[
			'shadowed boundary',
			islandOwner.replace('function Owner()', 'function Owner(Island)'),
			'Leaf.tsx',
			{},
		],
		[
			'shadowed component',
			islandOwner.replace('function Owner()', 'function Owner(Leaf)'),
			'Leaf.tsx',
			{},
		],
		['different package', islandOwner.replace('octane/react', 'other'), 'Leaf.tsx', {}],
		[
			'redirected boundary',
			islandOwner,
			'Leaf.tsx',
			{
				'tsconfig.json': JSON.stringify({
					compilerOptions: { paths: { 'octane/react': ['./other.ts'] } },
				}),
				'other.ts': 'export function ReactCompat(){return null}',
			},
		],
	])('allows migration with a %s', async (_, source, selected, extra) => {
		const root = project({ 'Owner.tsx': source, 'Leaf.tsx': reactLeaf, ...extra });
		const r = await runCodemod([path.join(root, selected)], { root, write: true });
		expect(
			r.files
				.flatMap((f) => f.notes)
				.filter((n) => n.rule === 'react-compat' && n.severity === 'error'),
		).toEqual([]);
		expect(fs.existsSync(path.join(root, selected.replace('.tsx', '.tsrx')))).toBe(true);
	});
	it.each(['', ', undefined'])(
		'keeps fresh imperative handles in Strong mode with deps %j',
		async (deps) => {
			const root = project({
				'Fresh.tsx': `import { useImperativeHandle } from 'react';
export function Fresh({ ref, label }) {
	function read() { return label; }
	useImperativeHandle(ref, () => ({ read })${deps});
	return <p onClick={() => read()}>{String(label)}</p>;
}`,
				'Stable.tsx': `import { useImperativeHandle } from 'react';
function stable() { return 'shared'; }
export function Stable({ ref }) {
	function read() { return 'initial'; }
	read = stable;
	useImperativeHandle(ref, () => ({ read })${deps});
	return <p>shared</p>;
}`,
				'Redeclared.jsx': `import { useImperativeHandle } from 'react';
const shared = () => 'shared';
function useHandle(ref, label) {
	function read() { return label; }
	var read = shared;
	useImperativeHandle(ref, () => ({ read })${deps});
}
export function Redeclared({ ref, label }) {
	useHandle(ref, label);
	return <p>shared</p>;
}`,
			});
			const { files } = await runCodemod([root], { write: false, strong: true });
			const fresh = files.find((file) => file.file === 'Fresh.tsx');
			const stable = files.find((file) => file.file === 'Stable.tsx');
			expect(fresh).toMatchObject({ strong: true, diagnostics: [] });
			const redeclared = files.find((file) => file.file === 'Redeclared.jsx');
			for (const file of [stable, redeclared]) {
				expect(file).toMatchObject({ strong: false });
				expect(file.diagnostics).toContainEqual(
					expect.objectContaining({ code: 'OCTANE_STRONG_UNTRACKED_EFFECT' }),
				);
			}
		},
	);

	it.each([true, false])(
		'reports React DOM hints in a plain TypeScript state initializer with strong %s',
		async (strong) => {
			const view = (name) => `import { useState } from 'react';
import { ${name} as initialize } from './factory';
export function View() { const [value] = useState(initialize); return <p>{value}</p>; }`;
			const inline = (initializer) => `import { useState } from 'react';
import { withHint as initialize } from './factory';
export function View() {
	const [state] = useState(${initializer});
	return <p>{state.value}</p>;
}`;

			const root = project({
				'View.tsx': view('withHint'),
				'Inline.tsx': inline('() => ({ value: initialize() })'),
				'Block.tsx': inline('function () { const value = initialize(); return { value }; }'),
				'Ordinary.tsx': view('ordinary'),
				'Deferred.tsx': view('deferred'),
				'DeferredInline.tsx': inline("() => ({ value: 'ready', run: () => initialize() })"),
				'Unreachable.tsx': inline("() => { return { value: 'ready' }; initialize(); }"),
				'Shadowed.tsx': inline(
					"() => { const initialize = () => 'ready'; return { value: initialize() }; }",
				),
				'Skipped.tsx': inline('() => ({ value: false && initialize() })'),
				'CompiledHint.tsx': `import { preload as hint } from 'react-dom';
import { useState } from 'react';
import { ordinary } from './factory';
export function View() {
	const [value] = useState(() => { hint('/sample.png', { as: 'image' }); return ordinary(); });
	return <p>{value}</p>;
}`,
				'factory.ts': String.raw`import { preload as hint } from 'react\x2ddom';
export function withHint() { hint('/sample.png', { as: 'image' }); return 'ready'; }
export function ordinary() { return 'ready'; }
export function deferred() { return () => hint('/later.png', { as: 'image' }); }`,
			});
			fs.symlinkSync(
				path.join(REPO, 'packages/codemod/node_modules'),
				path.join(root, 'node_modules'),
			);
			const options = { root, strong, write: false };
			const run = (...files) =>
				runCodemod(
					files.map((file) => path.join(root, file)),
					options,
				);
			const affected = ['View.tsx', 'Inline.tsx', 'Block.tsx'];
			const controls = [
				'Ordinary.tsx',
				'Deferred.tsx',
				'DeferredInline.tsx',
				'Unreachable.tsx',
				'Shadowed.tsx',
				'Skipped.tsx',
			];
			const unselected = await run(...affected, ...controls);
			const selected = await run(...affected, 'factory.ts', 'CompiledHint.tsx');
			for (const report of [unselected, selected]) {
				for (const name of affected)
					expect(report.files.find((file) => file.file === name).notes).toContainEqual(
						expect.objectContaining({
							severity: 'error',
							message: expect.stringContaining('React DOM preload'),
						}),
					);
			}
			for (const name of controls)
				expect(unselected.files.find((file) => file.file === name).notes).toEqual([]);

			const compiled = selected.files.find((file) => file.file === 'CompiledHint.tsx');
			expect(compiled.notes).toEqual([]);
			for (const file of selected.files) fs.writeFileSync(path.join(root, file.output), file.code);
			const { render } = await bundleRuntime(
				root,
				'server',
				`
				import { View } from './CompiledHint.tsrx';
				import { createElement, renderToStaticMarkup } from 'octane/server';
				export const render = () => renderToStaticMarkup(createElement(View)).html;
			`,
			);
			const { document } = new JSDOM(render()).window;
			expect(
				document.querySelectorAll('link[rel="preload"][href="/sample.png"][as="image"]'),
			).toHaveLength(1);
			expect(document.querySelector('p')?.textContent).toBe('ready');
		},
	);

	it('reports a native setup call into a React hook left in an unselected local module', () => {
		const helper = `import { useState as state } from 'react';
export function useLabel() { const [label] = state('ready'); return label; }`;
		const callback = `import { useCallback as retain } from 'react';
export function useLabel(value: string) { const read = retain(() => value, [value]); return read(); }`;
		const panel = `import { useLabel as read } from './use-label';
export function Panel() { const label = read(); return <b>{label}</b>; }`;
		const callbackPanel = panel
			.replace('./use-label', './use-callback')
			.replace('read()', "read('ready')");
		const root = project({
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					strict: true,
					jsx: 'react-jsx',
					moduleResolution: 'bundler',
					paths: { '@tanstack/react-query': ['./query-hook.ts'] },
				},
			}),
			'use-label.ts': helper,
			'use-callback.ts': callback,
			'Callback.tsx': callbackPanel,
			'CallbackShadowed.tsx': callbackPanel.replace('./use-callback', './shadowed-callback'),
			'shadowed-callback.ts': callback.replace(
				'const read = retain',
				'const retain = (fn) => fn; const read = retain',
			),
			'CallbackSkipped.tsx': callbackPanel.replace(
				"const label = read('ready');",
				"const before = (() => { throw new Error('setup failed'); })(); const label = read('ready');",
			),
			'Late.tsx': panel.replace('./use-label', './rewritten-at-runtime'),
			'rewritten-at-runtime.ts': helper + String.raw`;ev\u0061l("useLabel=()=> 'ready'");`,
			'query-hook.ts': helper.replace('useLabel', 'useQuery'),
			'Catalog.tsx': panel
				.replace('useLabel', 'useQuery')
				.replace('./use-label', '@tanstack/react-query'),
			'Arrow.tsx': panel.replace('function Panel()', 'const Panel = () =>'),
			'Function.tsx': panel.replace('function Panel()', 'const Panel = function()'),
			'Memo.tsx': `import { memo as wrap } from 'react';
${panel.replace('function Panel()', 'const Panel = wrap(() =>')})`,
			'Forward.tsx': `import * as React from 'react';
${panel.replace('function Panel()', 'const Panel = React.forwardRef(function Inner(props, ref)')})`,
			'Sibling.tsx': panel + '\nexport function App() { return <Panel/>; }',
			'ReactOwned.tsx':
				"import {ReactCompat} from 'octane/react';\n" +
				panel +
				'\nexport function App() { return <ReactCompat><Panel/></ReactCompat>; }',
			'EscapedInner.tsx': panel
				.replace('function Panel()', 'const Panel = function Inner()')
				.replace('return <b>', 'publish(Inner); return <b>'),
			'UnknownWrapper.tsx':
				'const wrap = callback => callback;\n' +
				panel.replace('function Panel()', 'const Panel = wrap(() =>') +
				')',
			'Panel.tsx': panel + '\nexport type View = typeof Panel;',
			'AfterSetup.tsx': `import { useLabel as read } from './use-label';
export function AfterSetup() {
	const title = 'Label';
	const label = read();
	return <b title={title}>{label}</b>;
}`,
			'Skipped.tsx': panel.replace(
				'const label = read();',
				"const before = (() => { throw new Error('setup failed'); })(), label = read();",
			),
			'Disposal.tsx': panel.replace(
				'const label = read();',
				"using before = 'text' as unknown as Disposable; const label = read();",
			),
			'WithParam.tsx': panel
				.replace('./use-label', './with-param')
				.replace('read()', "read('ready')"),
			'with-param.ts':
				helper
					.replace('useLabel()', 'useLabel(initial: string)')
					.replace("state('ready')", 'state(initial)') + '\nexport type Reader = typeof useLabel;',
			'Rebound.tsx': panel.replace('./use-label', './rebound-hook'),
			'rebound-hook.ts': helper + "\nuseLabel = () => 'ready';",

			'Pure.tsx': panel.replace('./use-label', './pure-hook'),
			'pure-hook.ts': `import { useState as state } from 'react';
export function useLabel(state = () => ['ready']) { const [label] = state(); return label; }`,
			'Unused.tsx': `import { useLabel } from './use-label';
export function Unused() { const later = () => useLabel(); return <b>ready</b>; }`,
			'Deferred.tsx': panel.replace('./use-label', './defer'),
			'defer.ts': `import { useState } from 'react';
export function useLabel() { const later = () => useState('ready'); return 'ready'; }`,
			'Changed.tsx': panel.replace('./use-label', './selected'),
			'selected.ts': helper,
			'External.tsx': panel.replace('./use-label', './use-external-store'),
			'use-external-store.ts': `import {useSyncExternalStore} from 'react'; export function useLabel() {return useSyncExternalStore(() => () => {}, () => 'ready', () => 'ready');}`,
			'Escape.tsx': panel + '\nexport const callback = Panel;',
			'Shadowed.tsx': panel.replace('./use-label', './js-sibling'),
			'js-sibling.ts': helper,
			'AlreadyNative.tsx': panel.replace('./use-label', './native-sibling'),
			'native-sibling.ts': helper,
			'native-sibling.tsrx': "export function useLabel(){return 'ready'}",
			'js-sibling.js': "export function useLabel() { return 'ready'; }",
		});
		fs.symlinkSync(
			path.join(REPO, 'packages/codemod/node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const selected = fs
			.readdirSync(root)
			.filter((name) => name.endsWith('.tsx') || name === 'selected.ts');
		for (const projectTypes of [false, true]) {
			const run = spawnSync(
				process.execPath,
				[
					path.join(import.meta.dirname, '../dist/bin.js'),
					'--strong',
					'--print',
					'--json',
					...(projectTypes ? [] : ['--no-project-types']),
					...selected,
				],
				{ cwd: root, encoding: 'utf8' },
			);
			expect(run.status).toBe(1);
			const { files } = JSON.parse(run.stdout);
			const errors = files.flatMap((f) =>
				f.notes
					.filter((n) => n.severity === 'error')
					.map((n) => [f.file, n.rule, n.line, n.message]),
			);
			expect(errors).toEqual([
				['AfterSetup.tsx', 'bindings', 4, expect.stringMatching(/useLabel.*React.*useState/)],
				['Arrow.tsx', 'bindings', 2, expect.stringMatching(/useLabel.*React.*useState/)],
				['Callback.tsx', 'bindings', 2, expect.stringMatching(/useLabel.*React.*useCallback/)],
				[
					'External.tsx',
					'bindings',
					2,
					expect.stringMatching(/useLabel.*React.*useSyncExternalStore/),
				],
				['Forward.tsx', 'bindings', 3, expect.stringMatching(/useLabel.*React.*useState/)],
				['Function.tsx', 'bindings', 2, expect.stringMatching(/useLabel.*React.*useState/)],
				['Memo.tsx', 'bindings', 3, expect.stringMatching(/useLabel.*React.*useState/)],
				['Panel.tsx', 'bindings', 2, expect.stringMatching(/useLabel.*React.*useState/)],
				['Sibling.tsx', 'bindings', 2, expect.stringMatching(/useLabel.*React.*useState/)],
				['WithParam.tsx', 'bindings', 2, expect.stringMatching(/useLabel.*React.*useState/)],
			]);
			expect(files.find((f) => f.file === 'Catalog.tsx').code).toContain(
				'@octanejs/tanstack-query',
			);
			expect(fs.readFileSync(path.join(root, 'use-label.ts'), 'utf8')).toBe(helper);
		}
	});

	it('reports an unchanged React context hook after ordinary component setup', async () => {
		const view = (setup, read = 'useObserver(fit)') => `import { useRef } from 'react';
import { useObserver } from './use-observer';
export function View({ hidden = false }: { hidden?: boolean }) {
	const node = useRef<HTMLElement | null>(null);
	const fit = () => { if (node.current) node.current.dataset.fit = 'yes'; };
	${setup}
	const observe = ${read};
	return <p ref={observe}>ready</p>;
}`;
		const hook = `import { createContext, useContext as readContext } from 'react';
const Observer = createContext(false);
export function useObserver(fit: () => void) {
	const enabled = readContext(Observer);
	return enabled ? fit : undefined;
}`;
		const root = project({
			'tsconfig.json': JSON.stringify({
				compilerOptions: { strict: true, jsx: 'react-jsx', moduleResolution: 'bundler' },
			}),
			'use-observer.ts': hook,
			'View.tsx': view('const width = 20;'),
			'Early.tsx': view('if (hidden) return null;'),
			'Disposal.tsx': view('using disposable = makeDisposable();'),
			'Deferred.tsx': view('', '() => useObserver(fit)'),
			'Getter.tsx': view(
				'const reader = { get fit() { return fit; } };',
				'useObserver(reader.fit)',
			),
			'Escaped.tsx': view('') + '\nexport const escaped = View;',
			'Unknown.tsx':
				view('') + '\nexport function Parent() { return <Unknown><View /></Unknown>; }',
			'Selected.tsx': view('').replace('./use-observer', './selected'),
			'selected.ts': hook,
		});
		fs.symlinkSync(
			path.join(REPO, 'packages/codemod/node_modules'),
			path.join(root, 'node_modules'),
		);
		const paths = fs
			.readdirSync(root)
			.filter((name) => name.endsWith('.tsx') || name === 'selected.ts');
		const { files } = await runCodemod(
			paths.map((file) => path.join(root, file)),
			{
				root,
				strong: true,
				projectTypes: true,
				verify: true,
				write: false,
			},
		);
		const blocked = files.flatMap((file) =>
			file.notes
				.filter(
					(note) =>
						note.rule === 'bindings' &&
						note.severity === 'error' &&
						note.message.includes("React's useContext"),
				)
				.map((note) => [file.file, note.line]),
		);
		expect(blocked).toEqual([['View.tsx', 7]]);
		expect(files.find((file) => file.file === 'View.tsx').code).toContain('./use-observer');
		expect(fs.readFileSync(path.join(root, 'use-observer.ts'), 'utf8')).toBe(hook);
	});

	it.each([true, false])(
		'advises on a retained private context helper (projectTypes=%s)',
		async (projectTypes) => {
			const imports = "import { createContext, useContext as readContext } from 'react';";
			const context = "const Theme = createContext('unset');";
			const helper = 'function readTheme() { const label = readContext(Theme); return label; }';
			const hook = 'export function useLabel() { return readTheme(); }';
			const owner = [imports, context, helper, hook].join('\n');
			const view = (file, call = 'useLabel()') => `import { useLabel } from './${file}';
export function View() { const label = ${call}; return <b>{label}</b>; }`;
			const files = {
				'tsconfig.json': JSON.stringify({
					compilerOptions: { strict: true, jsx: 'react-jsx', moduleResolution: 'bundler' },
				}),
				'owner.ts': owner,
				'View.tsx': view('owner'),
				'Cycle.tsx': "import './early';\n" + view('owner'),
				'early.ts': "import { View } from './Cycle'; View();",
				'Optional.tsx': view('owner', 'useLabel?.()'),
				'Argument.tsx': view('owner', 'useLabel(fail())'),
				'Deferred.tsx': view('owner', '() => useLabel()'),
				'ErasedCaller.tsx': view('owner').replace('const label', 'declare const label'),
				'ReactOwned.tsx':
					"import { ReactCompat } from 'octane/react';\n" +
					view('owner') +
					'\nexport function Parent() { return <ReactCompat><View /></ReactCompat>; }',
				'hook-default.ts': owner.replace('readTheme()', 'readTheme(value = fail())'),
				'Default.tsx': view('hook-default'),
				'hook-changed.ts': owner + '\nreadTheme = () => "different";',
				'Changed.tsx': view('hook-changed'),
				'hook-ambient.ts': owner.replace(context, 'declare const Theme: any;'),
				'Ambient.tsx': view('hook-ambient'),
				'hook-erased-read.ts': owner.replace(
					'const label = readContext',
					'declare const label = readContext',
				),
				'ErasedRead.tsx': view('hook-erased-read'),
				'hook-erased-helper.ts': owner.replace(
					'return readTheme();',
					"declare const label = readTheme(); return 'ok';",
				),
				'ErasedHelper.tsx': view('hook-erased-helper'),
				'hook-exported.ts': owner + '\nexport { readTheme };',
				'Exported.tsx': view('hook-exported'),
				'hook-direct.ts': owner.replace(
					hook,
					'export function useLabel() { return readContext(Theme); }',
				),
				'Direct.tsx': view('hook-direct'),
				'hook-selected.ts': owner,
				'Selected.tsx': view('hook-selected'),
			};
			const root = project(files);
			fs.symlinkSync(
				path.join(REPO, 'packages/codemod/node_modules'),
				path.join(root, 'node_modules'),
			);
			const inputs = Object.keys(files)
				.filter((file) => file.endsWith('.tsx') || file === 'hook-selected.ts')
				.sort();
			const result = await runCodemod(
				inputs.map((file) => path.join(root, file)),
				{
					root,
					strong: true,
					projectTypes,
					verify: true,
					write: false,
				},
			);
			const findings = result.files.flatMap((file) =>
				file.notes
					.filter((note) => note.rule === 'bindings' && note.message.includes("React's useContext"))
					.map((note) => [file.file, note.line, note.severity, note.message]),
			);
			expect(findings).toEqual([
				['Cycle.tsx', 3, 'warning', expect.stringContaining('after its module initializes')],
				[
					'Direct.tsx',
					2,
					'error',
					expect.stringContaining("export useLabel calls React's useContext"),
				],
				['View.tsx', 2, 'warning', expect.stringContaining('after its module initializes')],
			]);
			for (const name of ['Cycle.tsx', 'View.tsx']) {
				const resultFile = result.files.find((file) => file.file === name);
				expect(resultFile.strong).toBe(true);
				expect(resultFile.code).toContain("from './owner'");
			}
			expect(fs.readFileSync(path.join(root, 'owner.ts'), 'utf8')).toBe(owner);
		},
	);

	it('reports an unchanged React hook component passed to a migrated React DOM root', async () => {
		const app = (module = './leaf') => `import * as ReactDOM from 'react-dom/client';
import { Leaf } from '${module}';
export function mount(container: HTMLElement, label: string) {
	const root = ReactDOM.createRoot(container);
	root.render(<Leaf label={label} />);
	return () => root.unmount();
}
export function Native() { return <b>native</b>; }`;
		const leaf = `import { createElement, useState } from 'react';
export function Leaf(props: { label: string }) {
	const [label] = useState(props.label);
	return createElement('i', null, label);
}`;
		const root = project({
			'tsconfig.json':
				'{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler","strict":true}}',
			'leaf.ts': leaf,
			'Namespace.tsx': app(),
			'Named.tsx': app()
				.replace('* as ReactDOM', '{ createRoot as createReactRoot }')
				.replace('ReactDOM.createRoot', 'createReactRoot'),
			'Inline.tsx': app().replace(
				'const root = ReactDOM.createRoot(container);\n\troot.render(<Leaf label={label} />);\n\treturn () => root.unmount();',
				'ReactDOM.createRoot(container).render(<Leaf label={label} />);',
			),
			'TopLevel.tsx': `import * as ReactDOM from 'react-dom/client';
import { Leaf } from './leaf';
const root = ReactDOM.createRoot(document.body);
root.render(<Leaf label="label" />);`,
			'ExportedRoot.tsx': `import * as ReactDOM from 'react-dom/client';
import { Leaf } from './leaf';
export const root = ReactDOM.createRoot(document.body);
root.render(<Leaf label="label" />);`,
			'DefaultObject.tsx': app()
				.replace('* as ReactDOM', 'ReactDOM')
				.replace(
					'\nexport function mount',
					'\nReactDOM.createRoot = () => ({ render() {}, unmount() {} });\nexport function mount',
				),
			'Assigned.tsx': app().replace(
				'\n\troot.render(',
				'\n\troot.render = () => {};\n\troot.render(',
			),
			'Escaped.tsx': app()
				.replace('label: string) {', 'label: string, observe: (root: ReactDOM.Root) => void) {')
				.replace('\n\troot.render(', '\n\tobserve(root);\n\troot.render('),
			'Shadow.tsx': app().replace(
				'label: string) {',
				"label: string, ReactDOM: typeof import('react-dom/client')) {",
			),
			'UnselectedNative.tsx': app('./native.tsrx'),
			'native.tsrx': 'export function Leaf({label}: { label: string }) @{ <i>{label}</i> }',
			'Selected.tsx': app('./selected-leaf'),
			'selected-leaf.ts': leaf,
			'Renamed.tsx': app('./renamed-leaf'),
			'renamed-leaf.tsx': leaf.replace("createElement('i', null, label)", '<i>{label}</i>'),
		});
		fs.symlinkSync(
			path.join(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const selected = fs
			.readdirSync(root)
			.filter((f) => f.endsWith('.tsx') || f === 'selected-leaf.ts');
		const { files } = await runCodemod(
			selected.map((file) => path.join(root, file)),
			{ root, strong: true, verify: true, projectTypes: true, write: false },
		);
		const blocked = files.flatMap((file) =>
			file.notes
				.filter((note) => note.rule === 'root-render' && note.severity === 'error')
				.map((note) => [file.file, note.line, note.message]),
		);
		const message = expect.stringMatching(/Leaf.*React.*useState/);
		expect(blocked).toEqual([
			['Inline.tsx', 4, message],
			['Named.tsx', 5, message],
			['Namespace.tsx', 5, message],
			['TopLevel.tsx', 4, message],
		]);
		const namespace = files.find((f) => f.file === 'Namespace.tsx');
		expect(namespace.strong).toBe(true);
		expect(namespace.diagnostics).toEqual([]);
		expect(namespace.code).toContain('root.render(Leaf, { label: label })');
		expect(files.find((f) => f.file === 'Renamed.tsx').code).toContain('./renamed-leaf.tsrx');
	});

	it('shares a stateless external store with unchanged React callers', async () => {
		const wrapper = `import { useSyncExternalStore as useStore } from 'react';
import { subscribe, read } from './attribute-store';
export function useValue() { return useStore(subscribe, read, server); }
function server() { return null; }`;
		const consumer = `import { useValue as useAttribute } from './use-value';
type Snapshot = ReturnType<typeof useAttribute>;
export function Pane() { const value: Snapshot = useAttribute(); return <p>{value === null ? 'server' : value ? 'on' : 'off'}</p>; }`;
		const withRefs = `import { useRef as emptyRef } from 'react';\n${consumer.replace(
			'const value:',
			'const first=emptyRef(null); const second=emptyRef(null); const value:',
		)}`;
		const root = project({
			'package.json': '{"type":"module"}',
			'tsconfig.json':
				'{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler","strict":true}}',
			'attribute-store.ts': `export function read() { return document.documentElement.dataset.label === 'on'; }
export function subscribe(listener: () => void) {
	const observer = new MutationObserver(listener);
	observer.observe(document.documentElement, {attributes:true, attributeFilter:['data-label']});
	return () => observer.disconnect();
}`,
			'other-ref.ts': "export { useRef } from 'react';",
			'use-value.ts': wrapper,
			'Pane.tsx': consumer,
			'Other.tsx': withRefs.replace('function Pane', 'function Other'),
			'Unchanged.tsx': consumer.replace('function Pane', 'function Unchanged'),
			'Mixed.tsx': consumer + '\nexport function ReactValue() { return useAttribute(); }',
		});
		fs.symlinkSync(
			path.join(REPO, 'packages/codemod/node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const inputs = ['Pane.tsx', 'Other.tsx'].map((name) => path.join(root, name));
		const expectBlocked = async (files, hook = 'useSyncExternalStore') => {
			const preview = await runCodemod(files, { root, strong: true, write: false });
			expect(preview.files.some((file) => file.file.endsWith('.octane.ts'))).toBe(false);
			expect(preview.files[0].notes).toContainEqual(
				expect.objectContaining({
					severity: 'error',
					message: expect.stringContaining(`calls React's ${hook}`),
				}),
			);
		};
		await expectBlocked([path.join(root, 'Mixed.tsx')]);
		for (const source of [
			withRefs.replace('emptyRef(null)', 'emptyRef(Math.random())'),
			withRefs.replace('const first', 'let first'),
			withRefs.replace('const first', 'await using first'),
			withRefs.replace('const value:', 'using value:'),
			withRefs.replace('const value:', 'const earlier = Math.random(), value:'),
			withRefs.replace("from 'react'", "from './other-ref'"),
		]) {
			const file = path.join(root, 'Unproved.tsx');
			fs.writeFileSync(file, source);
			const preview = await runCodemod([file], { root, strong: true, write: false });
			expect(preview.files[0].code).toContain("from './use-value'");
			expect(preview.files[0].notes.filter((note) => note.rule === 'bindings')).toEqual([]);
		}

		// These hosts expose an unchanged React hook, but do not prove every call can share a native sidecar.
		const diagnosticOnly = path.join(root, 'DiagnosticOnly.tsx');
		for (const source of [
			consumer.replace('function Pane()', 'const Pane = () =>'),
			consumer + '\nexport function Sibling() { return <Pane/>; }',
			consumer.replace('const value:', 'const before = 1; const value:'),
		]) {
			fs.writeFileSync(diagnosticOnly, source);
			await expectBlocked([diagnosticOnly]);
		}

		const shadow = path.join(root, 'shadow');
		const localReact = path.join(root, 'local-react');
		fs.mkdirSync(path.join(shadow, 'node_modules'), { recursive: true });
		fs.mkdirSync(localReact);
		fs.writeFileSync(
			path.join(localReact, 'package.json'),
			'{"name":"react","version":"19.2.0","types":"./index.d.ts"}',
		);
		fs.writeFileSync(
			path.join(localReact, 'index.d.ts'),
			'export declare function useRef(value: null): { current: null };',
		);
		fs.symlinkSync(localReact, path.join(shadow, 'node_modules/react'), 'dir');
		const shadowed = path.join(shadow, 'View.tsx');
		fs.writeFileSync(shadowed, withRefs.replace('./use-value', '../use-value'));
		const preview = await runCodemod([shadowed], { root, strong: true, write: false });
		expect(preview.files[0].code).toContain("from '../use-value'");
		expect(preview.files.some((file) => file.file.endsWith('.octane.ts'))).toBe(false);
		for (const alias of ['readAttribute', 'use3Value', 'useContext', 'use']) {
			const input = path.join(root, 'Alias.tsx');
			fs.writeFileSync(input, consumer.replaceAll('useAttribute', alias));
			await expectBlocked([input]);
			fs.writeFileSync(input, withRefs.replaceAll('useAttribute', alias));
			await expectBlocked([input]);
		}
		const leaf = path.join(root, 'attribute-store.ts');
		const source = fs.readFileSync(leaf, 'utf8');
		fs.writeFileSync(
			leaf,
			source.replace("document.documentElement.dataset.label === 'on'", 'document.documentElement'),
		);
		await expectBlocked([inputs[0]]);
		await expectBlocked([inputs[1]]);
		fs.writeFileSync(leaf, "import { Fragment } from 'react';\n" + source);
		await expectBlocked([inputs[0]]);
		fs.writeFileSync(leaf, source);
		const occupied = path.join(root, 'use-value.octane.ts');
		fs.writeFileSync(occupied, 'export const custom = true;');
		await expectBlocked([inputs[0]]);
		await expectBlocked([inputs[1]]);
		expect(fs.readFileSync(occupied, 'utf8')).toBe('export const custom = true;');
		fs.rmSync(occupied);
		const hookFile = path.join(root, 'use-value.ts');
		fs.writeFileSync(
			hookFile,
			"import { useState } from 'react'; export function useValue() { const [value] = useState(false); return value; }",
		);
		await expectBlocked([inputs[1]], 'useState');
		fs.writeFileSync(hookFile, wrapper);

		const migrated = await runCodemod(inputs, { root, strong: true });
		for (const input of ['Pane.tsx', 'Other.tsx']) {
			const file = migrated.files.find((result) => result.file === input);
			expect(file?.strong).toBe(true);
			expect(file.code).toContain("from './use-value.octane'");
			expect([...file.notes, ...file.diagnostics].filter((n) => n.severity === 'error')).toEqual(
				[],
			);
		}
		expect(fs.readFileSync(path.join(root, 'use-value.ts'), 'utf8')).toBe(wrapper);
		expect(fs.readFileSync(path.join(root, 'Unchanged.tsx'), 'utf8')).toBe(
			consumer.replace('function Pane', 'function Unchanged'),
		);
		expect(migrated.files.filter((file) => file.file.endsWith('.octane.ts'))).toHaveLength(1);

		fs.writeFileSync(
			path.join(root, 'entry.ts'),
			`import { Pane } from './Pane.tsrx';
import { renderToStaticMarkup } from 'octane/server';
export const render = () => renderToStaticMarkup(Pane, {}).html;`,
		);
		const { createServer } = await import('vite');
		const { octane } = await import('octane/compiler/vite');
		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			server: { middlewareMode: true, hmr: false },
			plugins: [octane({ hmr: false })],
		});
		try {
			const { render } = await server.ssrLoadModule('/entry.ts');
			expect(render()).toBe('<p>server</p>');
		} finally {
			await server.close();
		}
	}, 30_000);

	it('recognizes a local hook selected for an in-place rewrite through a symlink', async () => {
		const root = project({
			'Panel.tsx':
				"import {useLabel} from './use-label'; export function Panel(){const label=useLabel(); return <b>{label}</b>}",
			'use-label.ts':
				"import {useState} from 'react'; export function useLabel(){const [label]=useState('ready'); return label}",
		});
		fs.symlinkSync(
			path.join(REPO, 'packages/codemod/node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const selected = path.join(root, 'alias.ts');
		fs.symlinkSync('use-label.ts', selected);
		const { files } = await runCodemod([path.join(root, 'Panel.tsx'), selected], {
			root,
			strong: true,
			write: true,
		});
		expect(
			files.find((f) => f.file === 'Panel.tsx').notes.filter((n) => n.severity === 'error'),
		).toEqual([]);
		expect(fs.readFileSync(path.join(root, 'use-label.ts'), 'utf8')).toMatch(/from ['"]octane['"]/);
	});

	it('preserves mapped children passed to an imported inspection component under Vite', async () => {
		const root = project({
			'package.json': '{"type":"module"}',
			'Group.tsx': `import { Children, isValidElement, type ReactNode } from 'react';
function hasBadges(nodes: ReactNode) {
	const badges = Children.toArray(nodes).filter(isValidElement<{className?: string}>);
	return badges.length > 0 && badges.every(b => b.props.className === 'badge');
}
function Group({ children }: {children: ReactNode}) {
	return <section data-matches={String(hasBadges(children))}>{children}</section>;
}
export { Group as BadgeGroup };`,
			'App.tsx': `import { BadgeGroup as Panel } from './Group';
export function App({ rows }: { rows: string[] }) {
	return <Panel>{rows.map((label, i) => <b key={i} className={label}>{label}</b>)}</Panel>;
}
export function Other({ Panel, rows }) {
	return <Panel>{[...rows].map(label => <b key={label}>{label}</b>)}</Panel>;
}`,
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([root], { write: false, strong: true });
		for (const file of files) fs.writeFileSync(path.join(root, file.output), file.code);
		const caller = files.find((file) => file.output === 'App.tsrx').code;
		expect(caller.split('export function Other')[1]).toContain('@for');
		fs.writeFileSync(
			path.join(root, 'entry.ts'),
			`import { App } from './App.tsrx';
import { renderToStaticMarkup } from 'octane/server';
export const render = (rows: string[]) => renderToStaticMarkup(App, {rows}).html;`,
		);
		const { createServer } = await import('vite');
		const { octane } = await import('octane/compiler/vite');
		const server = await createServer({
			root,
			cacheDir: path.join(root, '.vite'),
			configFile: false,
			logLevel: 'silent',
			server: { middlewareMode: true, hmr: false },
			plugins: [octane({ hmr: false })],
		});
		try {
			const { render } = await server.ssrLoadModule('/entry.ts');
			expect(render(['badge', 'badge'])).toContain('data-matches="true"');
			expect(render(['badge', 'plain'])).toContain('data-matches="false"');
			expect(render([])).toContain('data-matches="false"');
		} finally {
			await server.close();
		}
	}, 30_000);

	it('evaluates mapped React JSX props and children before the key', async () => {
		const root = project({
			'package.json': '{"type":"module"}',
			'tsconfig.json':
				'{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler","strict":true}}',
			'List.tsx': `import { useId } from 'react';
type Row = { readonly id: string; attr(): string; child(): string };
function Cell({before, after, children}: { before: string; after: string; children: string }) {
	return <span id={useId()} data-before={before} data-after={after}>{children}</span>;
}
export function List({rows}: { rows: Row[] }) {
	return <main>{[...rows].map(row => <Cell before={row.attr()} key={row.id} after={row.attr()}>
		{row.child()}
	</Cell>)}</main>;
}
export function Host({rows}: { rows: Row[] }) {
	return <main>{rows.map(row => <span data-before={row.attr()} key={row.id} data-after={row.attr()}>{row.child()}</span>)}</main>;
}`,
		});
		fs.symlinkSync(
			path.join(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const source = path.join(root, 'List.tsx');
		const [file] = (
			await runCodemod([source], {
				root,
				strong: true,
				verify: true,
				projectTypes: true,
				write: false,
			})
		).files;
		const original = await bundleRuntime(root, 'server', "export { List, Host } from './List.tsx'");
		const migrated = loadCompiledFixtureSource(file.code, { id: file.output, mode: 'server' });
		const observe = (render) => {
			const trace = [];
			let last = '-';
			const rows = ['a', 'b'].map((id) => ({
				get id() {
					trace.push('key ' + id);
					return (last = id);
				},
				attr() {
					trace.push('prop ' + last);
					return last;
				},
				child() {
					trace.push('child ' + last);
					return last;
				},
			}));
			const dom = new JSDOM(render(rows));
			return {
				trace,
				spans: [...dom.window.document.querySelectorAll('span')].map((span) => [
					span.dataset.before,
					span.dataset.after,
					span.textContent,
				]),
			};
		};
		for (const name of ['List', 'Host']) {
			const react = observe((rows) => renderReact(reactElement(original[name], { rows })));
			expect(react.spans).toEqual([
				['-', '-', '-'],
				['a', 'a', 'a'],
			]);
			expect(observe((rows) => renderToStaticMarkup(migrated[name], { rows }).html)).toEqual(react);
		}
		expect(file.strong).toBe(false);
		expect(
			file.notes.filter(
				({ rule, message }) => rule === 'template-for' && message.includes('override .map()'),
			),
		).toEqual([expect.objectContaining({ severity: 'error' })]);

		for (const config of ['"jsx":"react"', '"jsx":"react-jsx","jsxImportSource":"other"']) {
			fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"compilerOptions":{' + config + '}}');
			const [unknown] = (
				await runCodemod([source], { root, strong: true, verify: true, write: false })
			).files;
			expect(unknown.strong).toBe(false);
			expect(unknown.notes).toContainEqual(
				expect.objectContaining({ rule: 'template-for', severity: 'error' }),
			);
		}
	});

	it('renders retained ordered JSX maps in conditional directive arms', async () => {
		const rows = "['a', 'b'].map(label => <li key={key(label)}>{read(label)}</li>)";
		const branches = {
			And: `show && ${rows}`,
			Then: `show ? ${rows} : <li>empty</li>`,
			Else: `show ? <li>empty</li> : ${rows}`,
		};
		const root = project({
			'package.json': '{"type":"module"}',
			'tsconfig.json':
				'{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler","strict":true}}',
			'List.tsx': Object.entries(branches)
				.map(([name, branch]) => {
					return `export function ${name}({show, trace}: {show: boolean; trace: string[]}) {
	function key(label: string) { trace.push('key:' + label); return label; }
	function read(label: string) { trace.push('prop:' + label); return label + '!'; }
	return <ul>{${branch}}</ul>;
}`;
				})
				.join('\n'),
		});
		fs.symlinkSync(
			path.join(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const [file] = (
			await runCodemod([root], { write: false, strong: true, verify: true, projectTypes: true })
		).files;
		expect(file.diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
		const original = await bundleRuntime(root, 'server', "export * from './List.tsx'");
		const migrated = loadCompiledFixtureSource(file.code, { id: file.output, mode: 'server' });

		for (const name of Object.keys(branches)) {
			for (const show of [true, false]) {
				const trace = [];
				const react = renderReact(reactElement(original[name], { show, trace }));
				const nativeTrace = [];
				const native = renderToStaticMarkup(migrated[name], { show, trace: nativeTrace }).html;
				expect(new JSDOM(native).window.document.body.textContent).toBe(
					new JSDOM(react).window.document.body.textContent,
				);
				expect(nativeTrace).toEqual(trace);
				if (show === (name !== 'Else')) {
					expect(trace).toEqual(['prop:a', 'key:a', 'prop:b', 'key:b']);
				}
			}
		}
	});

	it.each([false, true])(
		'blocks writable map rows before writing (project types %s)',
		async (projectTypes) => {
			const writable = '[1,2].map((item, i) => <li key={item}>{i++}</li>)';
			const sources = {
				'package.json': '{"name":"app","type":"module"}',
				'tsconfig.json':
					'{"compilerOptions":{"strict":true,"jsx":"react-jsx","moduleResolution":"bundler"}}',
				'index.html': '<script type="module" src="./First.tsx"></script>',
				'First.tsx':
					"import { FormattedMessage } from 'react-intl'; export const First = () => <p><FormattedMessage id='x' defaultMessage='x' /></p>;",
				'Caller.tsx': "import { List } from './List.tsx'; export const Caller = () => <List />;",
				'List.tsx': `export const List = () => <ul>{${writable}}</ul>;`,
				'Binding.tsx':
					'export const Binding = () => <ul>{[{id:1},{id:2}].map(({id}) => <li key={0}>{id++}</li>)}</ul>;',
				'Typed.tsx': `import type { Visible } from './type'; export const Typed = ({show}: {show: Visible}) => <ul>{show && (show && ${writable})}</ul>;`,
				'Control.tsx':
					'export const Control = () => <ul>{[1,2].map(item => <li key={0}>{item++}</li>)}</ul>;',
				'Member.tsx':
					'export const Member = () => <ul>{[{eval:1},{eval:2}].map((item,i) => <li key={0}>{item.eval}{i}</li>)}</ul>;',
				'Eval.tsx':
					"export const Eval = () => <ul>{[1,2].map((item,i) => <li key={0}>{eval('i++')}</li>)}</ul>;",
				'type.ts': 'export type Visible = boolean;',
			};
			const root = project(sources);
			fs.symlinkSync(
				path.join(import.meta.dirname, '../node_modules'),
				path.join(root, 'node_modules'),
				'dir',
			);
			const selected = Object.keys(sources)
				.filter((file) => file.endsWith('.tsx'))
				.map((file) => path.join(root, file));
			const opts = { root, projectTypes, verify: false };
			const blocked = expect.objectContaining({ rule: 'map-parameter-write', severity: 'error' });
			const preview = await runCodemod(selected, { ...opts, write: false });
			const byFile = new Map(preview.files.map((file) => [file.file, file]));
			for (const file of [
				'List.tsx',
				'Binding.tsx',
				'Eval.tsx',
				...(projectTypes ? ['Typed.tsx'] : []),
			]) {
				expect(byFile.get(file)).toMatchObject({
					output: file.replace('.tsx', '.tsrx'),
					code: expect.stringContaining('@for'),
					notes: [blocked],
				});
			}
			for (const file of ['Control.tsx', 'Member.tsx']) {
				expect(byFile.get(file).notes).toEqual([]);
				expect(byFile.get(file).code).toContain('@for');
			}
			if (!projectTypes) {
				expect(byFile.get('Typed.tsx').notes).toEqual([]);
				expect(byFile.get('Typed.tsx').code).toContain('.map(');
			}
			expect(byFile.get('Caller.tsx').code).toContain('./List.tsrx');
			expect(preview.files.filter((file) => file.rules['react-intl-adapter'])).toHaveLength(1);
			const result = await runCodemod(selected, opts);
			expect(result.files).toEqual([
				expect.objectContaining({
					file: 'List.tsx',
					output: 'List.tsx',
					code: sources['List.tsx'],
					changed: false,
					notes: [blocked],
				}),
			]);
			expect(fs.readdirSync(root).sort()).toEqual([...Object.keys(sources), 'node_modules'].sort());
			for (const [file, code] of Object.entries(sources))
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(code);
		},
	);

	it.each([false, true])(
		'blocks earlier map bindings that read the later index (project types %s)',
		async (projectTypes) => {
			const direct =
				'[{id:1},{id:2}].map(({id,label=(index as number)},index) => <li key={id}>{label}</li>)';
			/** @param {string} list */
			const source = (list) => `export const View = () => <ul>{${list}}</ul>;`;
			const originals = {
				'package.json': '{"name":"app","type":"module"}',
				'tsconfig.json':
					'{"compilerOptions":{"strict":true,"jsx":"react-jsx","moduleResolution":"bundler"}}',
				'index.html': '<script type="module" src="./First.tsx"></script>',
				'First.tsx': 'export const First = () => <p/>;',
				'Caller.tsx': "import { View } from './List.tsx'; export const Caller = () => <View/>;",
				'List.tsx': source(direct),
				'Plus.tsx': source(direct.replace('(index as number)', '(index as number) + 1')),
				'Typeof.tsx': source(direct.replace('(index as number)', 'typeof index')),
				'Call.tsx': source(direct.replace('(index as number)', 'String(index)')),
				'Product.tsx': source(direct.replace('(index as number)', '2 * (index as number)')),
				'Unary.tsx': source(direct.replace('(index as number)', '-index')),
				'Bitwise.tsx': source(direct.replace('(index as number)', '0 | index')),
				'Optional.tsx': source(direct.replace('(index as number)', 'maybe?.(index)')),
				'Earlier.tsx': source(direct.replace('(index as number)', 'fail() * index')),
				'Computed.tsx': source(
					'[{0:4},{1:5}].map(({[index]:label},index) => <li key={0}>{label}</li>)',
				),
				'Literal.tsx': source(direct.replace('(index as number)', '7')),
				'Deferred.tsx': source(
					direct.replace('(index as number)', '() => index').replace('{label}', '{id}'),
				),
				'Dead.tsx': source(direct.replace('(index as number)', 'false ? index : 7')),
			};
			const root = project(originals);
			const options = { root, verify: false, projectTypes };
			const note = expect.objectContaining({ rule: 'map-parameter-tdz', severity: 'error' });
			const inputs = Object.keys(originals)
				.filter((file) => file.endsWith('.tsx'))
				.map((file) => path.join(root, file));
			const preview = await runCodemod(inputs, { ...options, write: false });
			expect(preview.files.map(({ file }) => file)).toEqual(
				inputs.map((file) => path.basename(file)),
			);
			for (const file of preview.files) {
				if (
					[
						'List.tsx',
						'Plus.tsx',
						'Typeof.tsx',
						'Call.tsx',
						'Product.tsx',
						'Unary.tsx',
						'Bitwise.tsx',
						'Computed.tsx',
					].includes(file.file)
				) {
					expect(file.notes).toEqual([note]);
					expect(file.code).toContain('@for');
				} else expect(file.notes).toEqual([]);
			}
			const result = await runCodemod(inputs, options);
			expect(result.files).toEqual([
				expect.objectContaining({
					file: 'List.tsx',
					output: 'List.tsx',
					changed: false,
					code: originals['List.tsx'],
					notes: [note],
				}),
			]);
			expect(fs.readdirSync(root).sort()).toEqual(Object.keys(originals).sort());
			for (const [file, code] of Object.entries(originals))
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(code);
		},
	);

	it.each([
		['write', '[1,2].map((item, index) => show ? <li>{index++}</li> : null)'],
		['tdz', '[{id:1},{id:2}].map(({id,label=index}, index) => show ? <li>{label}</li> : null)'],
	])('blocks conditional map rows with a parameter %s before writing', async (kind, list) => {
		const view = (/** @type {string} */ rows) =>
			`export const View = ({show}: {show: boolean}) => <ul>{${rows}}</ul>;`;
		const sources = {
			'tsconfig.json': '{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler"}}',
			'Caller.tsx': "import { View } from './View.tsx'; export const Caller = () => <View show />;",
			'View.tsx': view(list),
			'Control.tsx': view('[1,2].map((item, index) => show ? <li>{index}</li> : null)'),
		};
		const root = project(sources);
		const inputs = ['Caller.tsx', 'View.tsx', 'Control.tsx'].map((file) => path.join(root, file));
		const blocked = expect.objectContaining({
			rule: `map-parameter-${kind}`,
			severity: 'error',
		});
		const preview = await runCodemod(inputs, { root, verify: false, write: false });
		expect(preview.files.find((file) => file.file === 'View.tsx')).toMatchObject({
			code: expect.stringContaining('@for'),
			notes: [blocked],
		});
		expect(preview.files.find((file) => file.file === 'Control.tsx')).toMatchObject({
			code: expect.stringContaining('@for'),
			notes: [],
		});
		const result = await runCodemod(inputs, { root, verify: false });
		expect(result.files).toEqual([
			expect.objectContaining({
				file: 'View.tsx',
				output: 'View.tsx',
				code: sources['View.tsx'],
				changed: false,
				notes: [blocked],
			}),
		]);
		expect(fs.readdirSync(root).sort()).toEqual(Object.keys(sources).sort());
		for (const [file, code] of Object.entries(sources))
			expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(code);
	});

	it.each([
		['arguments[1]', 'function'],
		['({ arguments }).arguments[1]', 'function'],
		['Object.keys({ [arguments[1]]() {} })[0]', 'function'],
		['this', 'function'],
		['new.target === undefined', 'function'],
		['(() => new.target)()', 'function'],
		['arguments[0].label', 'arrow'],
		['this?.label', 'arrow'],
		['new.target === undefined', 'arrow'],
		['arguments[0].label', 'arrow', 'body'],
	])('blocks the map callback scope read %s (%s) before writing', async (value, kind, location) => {
		const callback = kind === 'function' ? 'function ' : '';
		const arrow = kind === 'arrow' ? ' => ' : ' ';
		const parameter = location === 'body' ? 'label' : `label = ${value}`;
		const rendered = location === 'body' ? value : 'label';
		const originals = {
			'tsconfig.json': '{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler"}}',
			'Caller.tsx': "import { List } from './List.tsx'; export const Caller = () => <List />;",
			'List.tsx': `export function List(props) {
	return <ul>{[{}, {}].map(${callback}({ ${parameter} }, index)${arrow}{
		return <li key="row">{String(${rendered})}</li>;
	})}</ul>;
}`,
			'Control.tsx': `export function Control() {
	return <ul>{[{ arguments: 'row' }].map(function ({
		arguments: label = (function () { return new.target; })(),
	}, index) {
		return <li key={index}>{label}</li>;
	})}</ul>;
}`,
		};
		const root = project(originals);
		const inputs = ['Caller.tsx', 'List.tsx', 'Control.tsx'].map((file) => path.join(root, file));
		const options = { root, verify: false };
		const note = expect.objectContaining({
			rule: 'map-callback-scope',
			severity: 'error',
			message: expect.stringContaining(value.includes('new.target') ? 'new.target' : 'arguments'),
		});
		const preview = await runCodemod(inputs, { ...options, write: false });
		const retained = preview.files.find(({ file }) => file === 'List.tsx');
		expect(retained).toMatchObject({
			code: expect.stringContaining(`.map(${callback}`),
			notes: [note],
		});
		expect(retained?.code).toContain('key="row"');
		expect(preview.files.find(({ file }) => file === 'Control.tsx')).toMatchObject({
			code: expect.stringContaining('@for'),
			notes: [],
		});
		const result = await runCodemod(inputs, options);
		expect(result.files).toEqual([
			expect.objectContaining({ file: 'List.tsx', changed: false, notes: [note] }),
		]);
		expect(fs.readdirSync(root).sort()).toEqual(Object.keys(originals).sort());
		for (const [file, source] of Object.entries(originals))
			expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(source);
	});

	it.each([
		'[{}, {}].map((_, index) => <li key={String(index)}>{String(arguments.length)}</li>)',
		'[{}, , {}].map((_) => <li key={0}>{String(arguments.length)}</li>)',
		'[{}, {}].map((_, index, rows) => <li key={index}>{String(arguments.length)}</li>)',
		'[{}].map((() => <li key={0}>{String(arguments.length)}</li>), undefined)',
	])('blocks a retained JSX map from reading renderer arguments before writing', async (rows) => {
		const original = `export function List() { return <ul>{${rows}}</ul>; }`;
		const root = project({
			'tsconfig.json': '{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler"}}',
			'List.tsx': original,
			'Control.tsx': `export function List() {
	return <ul>{[{}, {}].map(function (_) {
		return <li key={0}>{String(arguments.length)}</li>;
	})}</ul>;
}`,
		});
		fs.symlinkSync(
			path.join(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
		);
		const inputs = ['List.tsx', 'Control.tsx'].map((file) => path.join(root, file));
		const note = expect.objectContaining({ rule: 'map-callback-scope', severity: 'error' });
		const preview = await runCodemod(inputs, { root, write: false, verify: false });
		expect(preview.files.find(({ file }) => file === 'List.tsx')).toMatchObject({
			code: expect.stringContaining(rows),
			notes: [note],
		});
		expect(preview.files.find(({ file }) => file === 'Control.tsx')).toMatchObject({
			code: expect.stringContaining('.map(function'),
			notes: [],
		});
		const result = await runCodemod(inputs, { root, verify: false });
		expect(result.files).toEqual([
			expect.objectContaining({ file: 'List.tsx', changed: false, notes: [note] }),
		]);
		expect(fs.readFileSync(inputs[0], 'utf8')).toBe(original);
		expect(fs.existsSync(path.join(root, 'List.tsrx'))).toBe(false);
	});

	it.each([
		['write', '[...[1]].map((item, index) => <li key={0}>{index++}</li>)'],
		['tdz', '[...[{}]].map(({label=index}, index) => <li key={0}>{label}</li>)'],
	])('blocks spread-array map rows with a parameter %s before writing', async (kind, rows) => {
		const sources = {
			'tsconfig.json': '{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler"}}',
			'Caller.tsx': "import { View } from './View.tsx'; export const Caller = () => <View />;",
			'View.tsx': `export const View = () => <ul>{${rows}}</ul>;`,
			'Controls.tsx': `export const Dense = () => <ul>{[1].map((item, index) => <li key={0}>{index}</li>)}</ul>;
export const Spread = () => <ul>{[...[1]].map((item, index) => <li key={0}>{index}</li>)}</ul>;`,
		};
		const root = project(sources);
		const inputs = ['Caller.tsx', 'View.tsx', 'Controls.tsx'].map((file) => path.join(root, file));
		const options = { root, verify: false, strong: true };
		const blocked = expect.objectContaining({ rule: `map-parameter-${kind}`, severity: 'error' });
		const preview = await runCodemod(inputs, { ...options, write: false });
		expect(preview.files.find((file) => file.file === 'View.tsx')).toMatchObject({
			code: expect.stringContaining('@for'),
			notes: [blocked],
		});
		const controls = preview.files.find((file) => file.file === 'Controls.tsx');
		expect(controls.notes).toEqual([]);
		expect(controls.rules['template-for']).toBe(2);

		const result = await runCodemod(inputs, options);
		expect(result.files).toEqual([
			expect.objectContaining({
				file: 'View.tsx',
				output: 'View.tsx',
				code: sources['View.tsx'],
				changed: false,
				notes: [blocked],
			}),
		]);
		expect(fs.readdirSync(root).sort()).toEqual(Object.keys(sources).sort());
		for (const [file, code] of Object.entries(sources))
			expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(code);
	});

	it('keeps visible or ambiguous JSX text and authored comments in keyed map rows', async () => {
		const children = [
			' {row.child()}',
			'\n&nbsp;{row.child()}',
			'\n\u00a0{row.child()}',
			'{/* keep */}{row.child()}',
		];
		const root = project({
			'tsconfig.json': '{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler"}}',
			...Object.fromEntries(
				children.map((child, i) => [
					`Row${i}.tsx`,
					`export function List({rows}) { return <ul>{[...rows].map(row => <li key={row.id}>${child}</li>)}</ul>; }`,
				]),
			),
		});
		fs.symlinkSync(
			path.join(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const { files } = await runCodemod([root], { root, write: false, strong: true, verify: true });
		expect(files).toHaveLength(children.length);
		for (const file of files)
			expect(file.notes).toContainEqual(
				expect.objectContaining({ rule: 'template-for', severity: 'error' }),
			);
		expect(files.find((file) => file.file === 'Row3.tsx').code).toContain('/* keep */');
	});

	it('preserves promise and iterator results from JSX map callbacks', async () => {
		const root = project({
			'tsconfig.json': '{"compilerOptions":{"jsx":"react-jsx","moduleResolution":"bundler"}}',
			'AsyncRows.tsx': `import { Suspense } from 'react';
export function App() {
	return <main><Suspense fallback={<b>waiting</b>}>
		<ul>{['a', 'b'].map(async label => <li key={label}>{label}</li>)}</ul>
	</Suspense></main>;
}`,
			'GeneratorRows.tsx': `export function App() {
	return <main><ul>{['a', 'b'].map(function* (label) {
		return <li key={label}>{label}</li>;
	})}</ul></main>;
}`,
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([root], { root, strong: true, verify: true, write: false });
		for (const [name, expected] of [
			['AsyncRows', 'waiting'],
			['GeneratorRows', ''],
		]) {
			const file = files.find((entry) => entry.file === name + '.tsx');
			const { App } = loadCompiledFixtureSource(file.code, { id: file.output, mode: 'server' });
			const { html } = renderToStaticMarkup(App);
			const document = new JSDOM(html).window.document;
			expect(document.querySelector('main').textContent).toBe(expected);
			expect(document.querySelector('li')).toBeNull();
			expect(file.notes).toContainEqual(
				expect.objectContaining({
					rule: 'template-for',
					severity: 'error',
					message: expect.stringContaining('promise or iterator'),
				}),
			);
		}
	});

	it.each([
		[6, true, []],
		[7, false, ['OCTANE_STRONG_READ_ONLY_STATE']],
	])(
		'reports the final Strong result after repairing six of %i aliased hooks',
		async (count, strong, codes) => {
			const indexes = Array.from({ length: count }, (_, index) => index);
			const imports = indexes.map((index) => `useState as useValue${index}`).join(', ');
			const states = indexes.map((index) => `const [value${index}] = useValue${index}(${index});`);
			const values = indexes.map((index) => `<span>{value${index}}</span>`).join('');
			const root = project({
				'Panel.tsx': `import { ${imports} } from 'react';
export function Panel() {
	${states.join('\n\t')}
	return <div>${values}</div>;
}`,
			});
			fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
			const {
				files: [file],
			} = await runCodemod([root], { root, strong: true, verify: true });
			expect(file.strong).toBe(strong);
			expect(file.diagnostics.map(({ code }) => code)).toEqual(codes);
			expect(file.code.includes('"use strong";')).toBe(strong);
		},
	);

	it('keeps custom and sparse map calls in compatibility mode', async () => {
		const root = project({
			'package.json': '{"type":"module"}',
			'tsconfig.json':
				'{"compilerOptions":{"strict":true,"jsx":"react-jsx","module":"esnext","moduleResolution":"bundler"}}',
			'Rows.ts': 'export interface Rows { map<T>(render: (value: string) => T): T[] }',
			'Custom.tsx': `import type { Rows } from './Rows';
export function Custom({ rows }: { rows: Rows }) {
	return <ul>{rows.map(label => <li key={label}>{label}</li>)}</ul>;
}
export function Cast({ rows }: { rows: unknown }) {
	return <ul>{(rows as Rows).map(label => <li key={label}>{label}</li>)}</ul>;
}
export function Optional({ rows }: { rows: Rows | null }) {
	return <ul>{rows?.map(label => <li key={label}>{label}</li>)}</ul>;
}`,
			'Sparse.tsx': `export function Sparse() {
	const rows = ['first', , 'last'];
	return <ul>{rows.map(label => <li key={label ?? 'hole'}>{label ?? 'hole'}</li>)}</ul>;
}`,
			'Native.tsx': `export function Native() {
	return <ul>{['first', 'last'].map(label => <li key={label}>{label}</li>)}</ul>;
}`,
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([root], {
			write: false,
			strong: true,
			projectTypes: true,
			verify: true,
		});
		const custom = files.find((entry) => entry.output === 'Custom.tsrx');
		const sparse = files.find((entry) => entry.output === 'Sparse.tsrx');
		for (const file of [custom, sparse]) {
			expect(file.strong).toBe(false);
			expect(file.code).toContain('rows.map(');
			expect(file.code).not.toContain('@for');
			expect(file.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		}
		const native = files.find((entry) => entry.output === 'Native.tsrx');
		expect(native.strong).toBe(true);
		expect(native.code).toContain('@for');

		const { Custom, Cast, Optional } = loadCompiledFixtureSource(custom.code, {
			id: custom.output,
			mode: 'server',
		});
		const rows = { map: (render) => [render('custom')] };
		for (const render of [Custom, Cast, Optional])
			expect(renderToStaticMarkup(render, { rows }).html).toContain('>custom</li>');
		const { Sparse } = loadCompiledFixtureSource(sparse.code, {
			id: sparse.output,
			mode: 'server',
		});
		const html = renderToStaticMarkup(Sparse).html;
		expect(html).toContain('>first</li>');
		expect(html).toContain('>last</li>');
		expect(html).not.toContain('hole');
	});

	it.each([false, true])(
		'reports a runtime map override for typed array props (project types: %s)',
		async (projectTypes) => {
			const root = project({
				'tsconfig.json': '{"compilerOptions":{"strict":true,"jsx":"react-jsx"}}',
				'View.tsx': `export function View({rows}: {rows: Array<{id: string}>}) {
				return <main>{rows.map(row => <b key={row.id}>row</b>)}</main>;
			}`,
			});
			fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
			const [file] = (await runCodemod([root], { strong: true, verify: true, projectTypes })).files;
			expect(file.strong).toBe(false);
			expect(file.notes).toContainEqual(
				expect.objectContaining({
					rule: 'template-for',
					severity: 'error',
					message: expect.stringContaining('inspect the React elements'),
				}),
			);
			expect(file.code).toContain('rows.map(');
			expect(file.code).not.toContain('@for');
			const { View } = loadCompiledFixtureSource(file.code, { id: file.output, mode: 'server' });
			const calls = [];
			const rows = [{ id: 'first' }];
			Object.defineProperty(rows, 'map', {
				value(callback) {
					const valid = isValidElement(callback(this[0], 0, this));
					calls.push(valid);
					return [valid ? 'react-row' : 'foreign-row'];
				},
			});
			const original = renderReact(
				reactElement(
					'main',
					null,
					rows.map((row) => reactElement('b', { key: row.id }, 'row')),
				),
			);
			expect(original).toBe('<main>react-row</main>');
			expect(calls).toEqual([true]);
			calls.length = 0;
			const html = renderToStaticMarkup(View, { rows }).html;
			expect(calls).toHaveLength(1);
			expect(html).toBe(calls[0] ? original : '<main>foreign-row</main>');
		},
	);

	it('warns for element-valued template children and preserves the caller contract', async () => {
		const root = project({
			'Frame.tsx': `import type { ReactElement as Child } from "react";
interface Props { children?: Child; icon?: Child }
export function Frame({ children, icon }: Props) { return <section>{icon}{children}</section>; }
`,
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const [file] = (await runCodemod([root], { write: false, strong: true })).files;
		expect(file.notes).toEqual([
			expect.objectContaining({
				rule: 'element-children',
				severity: 'warning',
				line: 3,
				message: expect.stringContaining('ChildrenBlock'),
			}),
		]);
		expect(file.code).toContain('children?: Child; icon?: Child');

		// Exercise both choices in the warning with the virtual TSX the editor checks.
		const declarations = [
			file.code,
			file.code.replace(
				'children?: Child;',
				'children?: Child | import("octane/tsrx-boundary").ChildrenBlock;',
			),
		];
		const calls = `
export function Explicit() @{ <Frame children={<i />} icon={<b />} /> }
export function NestedElement() @{ <Frame><i /></Frame> }
export function NestedText() @{ <Frame>text</Frame> }
export function NestedElements() @{ <Frame><b /><i /></Frame> }
export function WrongChild() @{ <Frame children="text" /> }
export function WrongIcon() @{ <Frame icon="text" /> }
export function Callback() @{ <Frame>{() => <b />}</Frame> }
`;
		const views = declarations.map((declaration, index) => {
			const name = path.join(root, `case${index}.tsx`);
			fs.writeFileSync(
				name,
				compileTypesInspection(declaration + calls, name.replace(/\.tsx$/, '.tsrx')).code,
			);
			return name;
		});
		const program = ts.createProgram(views, {
			jsx: ts.JsxEmit.ReactJSX,
			jsxImportSource: 'octane/strong',
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			target: ts.ScriptTarget.ESNext,
			strict: true,
			skipLibCheck: true,
			types: [],
		});
		const errors = views.map((fileName) => {
			const source = /** @type {ts.SourceFile} */ (program.getSourceFile(fileName));
			return program.getSemanticDiagnostics(source).map(({ code, start }) => {
				const fn = source.statements.find(
					(s) => start !== undefined && s.pos <= start && start < s.end,
				);
				return [code, fn && ts.isFunctionDeclaration(fn) ? fn.name?.text : undefined];
			});
		});
		const explicitErrors = [
			[2322, 'WrongChild'],
			[2322, 'WrongIcon'],
			[2322, 'Callback'],
		];
		expect(errors).toEqual([
			[[2322, 'NestedElement'], [2322, 'NestedText'], [2322, 'NestedElements'], ...explicitErrors],
			explicitErrors,
		]);
	});

	it('preserves a single element child at selected local and imported template calls', async () => {
		const root = project({
			'Frame.tsx': `import type { ReactElement as E } from 'react';
export function Frame(p: { children?: E | (E | null)[] | null; icon?: E }) { return <section>{p.icon}{p.children}</section> }
export function Leaf() { return <i /> }
export function Local() { return <Frame icon={<b />}><Leaf /></Frame> }`,
			'Caller.tsx': `import { Frame as Box } from './Frame';
export function Cross() { return <Box>
	<i />
</Box> }`,
			'Unknown.tsx': `import { Frame as Box } from './Frame';
import type { ReactElement as E } from 'react';
export function ArraySlot(p: {children: E[]}) {return <aside>{p.children}</aside>}
export function Controls(p: { Box: typeof Box }) { const { Box } = p; return <Box><b /></Box> }
export function Cases(p: {}) {return <main><Box {...p}><i /></Box><Box> <b /> </Box><Box>\u00a0<b />\u00a0</Box><Box>{/* keep */}<b /></Box><Box><b /><i /></Box><ArraySlot><i /></ArraySlot></main>}`,
			'tsconfig.json': JSON.stringify({
				extends: path.join(REPO, 'packages/octane/typetests/tsconfig.json'),
				compilerOptions: { allowImportingTsExtensions: true },
				include: ['Frame.tsrx', 'Caller.tsrx'],
			}),
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([root], { root, write: false, strong: true });
		const output = Object.fromEntries(files.map((f) => [f.output, f]));
		expect(output['Frame.tsrx'].rules['element-child-prop']).toBe(1);
		expect(output['Frame.tsrx'].code).toContain('<Frame icon={<b />} children={<Leaf />} />');
		expect(output['Caller.tsrx'].code).toContain('<Box children={<i />} />');
		expect(output['Unknown.tsrx'].rules['element-child-prop']).toBeUndefined();
		expect(output['Unknown.tsrx'].code).toContain('<Box> <b /> </Box>');
		expect(output['Unknown.tsrx'].code).toContain('<Box>\u00a0<b />\u00a0</Box>');
		expect(output['Unknown.tsrx'].code).toContain('{/* keep */}');
		for (const file of files) fs.writeFileSync(path.join(root, file.output), file.code);
		execFileSync(
			process.execPath,
			[path.join(REPO, 'scripts/octane-tsc/bin.mjs'), '-p', 'tsconfig.json'],
			{ cwd: root },
		);
	});

	it('warns only for narrow, unmarked children on a TSRX component', async () => {
		const root = project({
			'foreign.ts': 'export interface ReactElement { label: string }',
			'Controls.tsx': `import { isValidElement, type ReactElement as Child, type ReactNode } from "react";
import type { ReactElement } from "./foreign";
export function List(p: { children?: (Child | null)[] | null }) { return <div>{p.children}</div>; }
export function Broad(p: { children: ReactNode }) { return <div>{p.children}</div>; }
export function Mixed(p: { children: Child | string }) { return <div>{p.children}</div>; }
export function Unrelated(p: { children: ReactElement }) { return <b>{p.children.label}</b>; }
export function Named(p: { icon: Child }) { return <div>{p.icon}</div>; }
export function Inspector({ children }: { children: Child }) { return isValidElement(children) ? <b /> : null; }
`,
		});
		const [tsrx] = (await runCodemod([path.join(root, 'Controls.tsx')], { root, write: false }))
			.files;
		expect(tsrx.code).toContain('descriptorChildren(');
		expect(tsrx.notes.filter((note) => note.rule === 'element-children')).toEqual([
			expect.objectContaining({ severity: 'warning', line: 3 }),
		]);
		const [tsx] = (await runCodemod([root], { write: false, target: 'tsx' })).files;
		expect(tsx.notes.some((note) => note.rule === 'element-children')).toBe(false);
	});

	it.each(['Item.tsrx', 'Item.jsx', ...(ts.sys.useCaseSensitiveFileNames ? [] : ['item.jsx'])])(
		'reports a rename collision (%s) before writing',
		async (other) => {
			const original = {
				'package.json': '{ "name": "app" }',
				'index.html': '<script type="module" src="./First.tsx"></script>',
				'First.tsx': 'export const First = () => <div />;',
				'Item.tsx': 'import { First } from "./First.tsx"; export const Item = () => <First />;',
				[other]: other.endsWith('.tsrx')
					? 'export function Item() @{ <p /> }'
					: 'export const Item = () => <i />;',
			};
			const root = project(original);
			for (const write of [false, true]) {
				const result = await runCodemod([root], { write });
				expect(result.files.flatMap((file) => file.notes)).toContainEqual(
					expect.objectContaining({
						severity: 'error',
						message: expect.stringMatching(/item\.tsrx/i),
					}),
				);
				expect(result.files.filter((file) => file.changed).map((file) => file.output)).toEqual(
					write ? [] : ['First.tsrx'],
				);
				if (!write) {
					const conflicts = result.files.filter((file) =>
						file.notes.some((note) => note.rule === 'rename-conflict'),
					);
					const blocked = other.endsWith('.tsrx') ? ['Item.tsx'] : ['Item.tsx', other];
					expect(conflicts.map((file) => file.file).sort()).toEqual(blocked.sort());
					for (const file of conflicts) {
						expect(file.output).toBe(file.file);
						expect(file.code).toBe(original[file.file]);
					}
				}
				expect(fs.readdirSync(root).sort()).toEqual(Object.keys(original).sort());
				for (const [name, source] of Object.entries(original))
					expect(fs.readFileSync(path.join(root, name), 'utf8')).toBe(source);
			}
		},
	);

	it('reports a rename collision through a symlinked directory before writing', async () => {
		const original = {
			'package.json': '{ "name": "app" }',
			'index.html': '<script type="module" src="./First.tsx"></script>',
			'First.tsx': 'export const First = () => <div />;',
			'Item.tsx': 'export const Item = () => <i />;',
		};
		const root = project(original);
		fs.symlinkSync('.', path.join(root, 'linked'), 'dir');
		const paths = [root, path.join(root, 'linked/Item.tsx')];
		for (const write of [false, true]) {
			const { files } = await runCodemod(paths, { write });
			expect(files.find(({ file }) => file === 'linked/Item.tsx')).toMatchObject({
				output: 'linked/Item.tsx',
				changed: false,
				notes: [
					expect.objectContaining({
						rule: 'rename-conflict',
						severity: 'error',
						message: expect.stringMatching(/linked\/Item\.tsrx.*Item\.tsx/),
					}),
				],
			});
			expect(files.filter(({ changed }) => changed).map(({ output }) => output)).toEqual(
				write ? [] : ['First.tsrx'],
			);
			if (!write) expect(files.find(({ file }) => file === 'Item.tsx').output).toBe('Item.tsx');
			expect(fs.readdirSync(root).sort()).toEqual([...Object.keys(original), 'linked'].sort());
			for (const [file, source] of Object.entries(original))
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(source);
		}
	});

	it.each([
		['linked', 'src', 'Caller.ts', false],
		['src', 'linked', 'Caller.ts', false],
		['linked', 'src', 'index.html', false],
		['src', 'linked', 'index.html', false],
		['linked', 'src', 'Caller.ts', true],
		['src', 'linked', 'Caller.ts', true],
		['linked', 'src', 'index.html', true],
		['src', 'linked', 'index.html', true],
	])(
		'checks a linked rename from %s to a caller in %s through %s (case variant %s)',
		async (selected, used, issuer, caseVariant) => {
			const script = (file) => `<script type="module" src="./${file}"></script>`;
			/** @type {Record<string, string>} */
			const original = {
				'package.json': '{"name":"app","type":"module"}',
				'tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"}}',
				'index.html': script('First.tsx'),
				'First.tsx':
					"import { useState } from 'react'; export function First(){const [n]=useState(1); return <b>{n}</b>}",
				'src/Part.tsx': 'export function Part(){return <i/>}',
			};
			const root = project(original);
			fs.symlinkSync('src', path.join(root, 'linked'), 'dir');
			const insensitive = fs.existsSync(path.join(root, 'src/part.tsx'));
			const variant = caseVariant && (!insensitive || process.platform === 'darwin');
			const distinct = variant && !insensitive;
			const name = variant ? 'part' : 'Part';
			// Select an authored case variant too, to exercise lookup of the stored leaf.
			const selectedName = variant && insensitive && selected === 'linked' ? 'pArT' : 'Part';
			/** @param {string} file @param {string} code */
			const save = (file, code) => {
				original[file] = code;
				fs.writeFileSync(path.join(root, file), code);
			};
			if (distinct) save('src/part.tsx', 'export function Part(){return <aside/>}');
			if (issuer === 'index.html')
				save(issuer, original[issuer] + script(used + '/' + name + '.tsx'));
			else save(issuer, `export { Part } from './${used}/${name}';`);
			const source = selected + '/' + selectedName + '.tsx';
			const output = source.replace(/\.tsx$/, '.tsrx');
			const inputs = ['First.tsx', source].map((file) => path.join(root, file));
			const options = { root, verify: false };
			const note = expect.objectContaining({
				rule: 'rename-conflict',
				severity: 'error',
				message: expect.stringContaining(issuer),
			});
			const preview = await runCodemod(inputs, { ...options, write: false });
			if (distinct) {
				const result = await runCodemod(inputs, options);
				for (const report of [preview, result]) {
					expect(report.files.map((file) => file.output)).toEqual(['First.tsrx', output]);
					expect(report.files.flatMap((file) => file.notes)).toEqual([]);
				}
				expect(fs.existsSync(path.join(root, output))).toBe(true);
				expect(fs.readFileSync(path.join(root, 'src/part.tsx'), 'utf8')).toBe(
					original['src/part.tsx'],
				);
				const caller = fs.readFileSync(path.join(root, issuer), 'utf8');
				expect(caller).toBe(original[issuer].replace('First.tsx', 'First.tsrx'));
				return;
			}
			expect(preview.files).toEqual([
				expect.objectContaining({ file: 'First.tsx', output: 'First.tsrx' }),
				expect.objectContaining({ file: source, output, notes: [note] }),
			]);
			const result = await runCodemod(inputs, options);
			expect(result.files).toEqual([
				expect.objectContaining({
					file: source,
					output: source,
					changed: false,
					code: original['src/Part.tsx'],
					notes: [note],
				}),
			]);
			expect(fs.existsSync(path.join(root, 'First.tsrx'))).toBe(false);
			expect(fs.existsSync(path.join(root, output))).toBe(false);
			for (const [file, code] of Object.entries(original))
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(code);
		},
	);

	it('preserves path-like display text in a selected module', async () => {
		const text = './linked/Part.tsx';
		const root = project({
			'Label.tsx': `export function Label(){return <b>{'${text}'}</b>}`,
			'src/Part.tsx': 'export function Part(){return <i/>}',
		});
		fs.symlinkSync('src', path.join(root, 'linked'), 'dir');
		const { files } = await runCodemod([root], { verify: false });
		expect(files.map(({ output }) => output)).toEqual(['Label.tsrx', 'src/Part.tsrx']);
		expect(files.flatMap(({ notes }) => notes)).toEqual([]);
		expect(fs.readFileSync(path.join(root, 'Label.tsrx'), 'utf8')).toContain(text);
	});

	it('uses filesystem directory identity for differently normalized symlink targets', async () => {
		const parent = 'Cafe\u0301';
		const source = 'export const Item = () => <i />;';
		const root = project({ [parent + '/Item.tsx']: source });
		const alternate = parent.normalize('NFC');
		const alternatePath = path.join(root, alternate);
		const sameDirectory = fs.existsSync(alternatePath);
		if (!sameDirectory) {
			fs.mkdirSync(alternatePath);
			fs.writeFileSync(path.join(alternatePath, 'Item.tsx'), source.replace('<i />', '<b />'));
		}
		fs.symlinkSync(alternate, path.join(root, 'linked'), 'dir');
		const paths = [parent + '/Item.tsx', 'linked/Item.tsx'];
		const inputs = paths.map((file) => path.join(root, file));
		const preview = await runCodemod(inputs, { root, write: false, verify: false });
		const result = await runCodemod(inputs, { root, write: true, verify: false });
		if (sameDirectory) {
			expect(preview.files.map(({ file }) => file)).toEqual(paths);
			expect(result.files.map(({ file }) => file)).toEqual(paths.slice(1));
			for (const file of [...preview.files, ...result.files]) {
				expect(file).toMatchObject({
					output: file.file,
					changed: false,
					notes: [expect.objectContaining({ rule: 'rename-conflict', severity: 'error' })],
				});
			}
			expect(fs.readdirSync(path.join(root, parent))).toEqual(['Item.tsx']);
			expect(fs.readFileSync(inputs[0], 'utf8')).toBe(source);
		} else {
			const outputs = paths.map((file) => file.replace(/\.tsx$/, '.tsrx'));
			for (const { files } of [preview, result]) {
				expect(files.map(({ output }) => output)).toEqual(outputs);
				expect(files.flatMap(({ notes }) => notes)).toEqual([]);
			}
			expect(fs.readFileSync(path.join(root, outputs[0]), 'utf8')).toContain('<i />');
			expect(fs.readFileSync(path.join(root, outputs[1]), 'utf8')).toContain('<b />');
			expect(inputs.some((file) => fs.existsSync(file))).toBe(false);
		}
	});

	it('checks normalization-equivalent destination names using filesystem lookup', async () => {
		const decomposed = 'Ite\u0301m';
		const composed = decomposed.normalize('NFC');
		const first = decomposed + '.tsx';
		const source = 'export const A = () => <b />;';
		const root = project({ [first]: source });
		const existing = path.join(root, first);
		const aliases = fs.existsSync(path.join(root, composed + '.tsx'));
		const normalizationInsensitive = process.platform === 'darwin' && aliases;
		// The native lookup rule is scoped to macOS. Use a separate name on other
		// normalizing mounts so the ordinary successful-migration control still runs.
		const other = aliases && !normalizationInsensitive ? 'Other' : composed;
		const second = other + '.jsx';
		const original = {
			'package.json': '{ "name": "app" }',
			'index.html': '<script type="module" src="./First.tsx"></script>',
			'First.tsx': 'export const First = () => <div />;',
			[first]: source,
			[second]: 'export const B = () => <i />;',
		};
		for (const [name, content] of Object.entries(original))
			fs.writeFileSync(path.join(root, name), content);
		// A different directory entry can still have the same inode.
		fs.linkSync(existing, path.join(root, 'Alias.tsx'));
		const paths = ['First.tsx', first, second, 'Alias.tsx'].map((name) => path.join(root, name));
		const options = { root, verify: false };
		const preview = await runCodemod(paths, { ...options, write: false });
		if (normalizationInsensitive) {
			const conflicted = preview.files.filter(({ notes }) =>
				notes.some(({ rule }) => rule === 'rename-conflict'),
			);
			expect(conflicted.map(({ file, output, changed }) => [file, output, changed])).toEqual([
				[first, first, false],
				[second, second, false],
			]);
			expect(preview.files.filter(({ changed }) => changed).map(({ output }) => output)).toEqual([
				'First.tsrx',
				'Alias.tsrx',
			]);
			const result = await runCodemod(paths, { ...options, write: true });
			expect(result.files).toEqual([
				expect.objectContaining({
					file: second,
					output: second,
					changed: false,
					notes: [expect.objectContaining({ rule: 'rename-conflict', severity: 'error' })],
				}),
			]);
			for (const [file, source] of Object.entries(original))
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(source);
			expect(fs.readFileSync(path.join(root, 'Alias.tsx'), 'utf8')).toBe(original[first]);
			expect(fs.readdirSync(root).sort()).toEqual([...Object.keys(original), 'Alias.tsx'].sort());
		} else {
			const outputs = ['First.tsrx', decomposed + '.tsrx', other + '.tsrx', 'Alias.tsrx'];
			const result = await runCodemod(paths, { ...options, write: true });
			for (const { files } of [preview, result]) {
				expect(files.map(({ output }) => output)).toEqual(outputs);
				expect(files.flatMap(({ notes }) => notes)).toEqual([]);
			}
			expect(fs.readFileSync(path.join(root, outputs[1]), 'utf8')).toContain('<b />');
			expect(fs.readFileSync(path.join(root, outputs[2]), 'utf8')).toContain('<i />');
			expect(fs.readFileSync(path.join(root, outputs[3]), 'utf8')).toContain('<b />');
			expect(paths.some((file) => fs.existsSync(file))).toBe(false);
			expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).toBe(
				original['index.html'].replace('./First.tsx', './First.tsrx'),
			);
			expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(
				original['package.json'],
			);
		}
	});

	it('renames separate file symlinks without removing their shared target', async () => {
		const source = 'export const Item = () => <i />;';
		const root = project({ 'Item.tsx': source });
		const files = ['One.tsx', 'Two.tsx'].map((name) => path.join(root, name));
		for (const file of files) fs.symlinkSync('Item.tsx', file);
		const { files: results } = await runCodemod(files, { root });
		expect(results.map(({ output }) => output)).toEqual(['One.tsrx', 'Two.tsrx']);
		expect(results.flatMap(({ notes }) => notes)).toEqual([]);
		expect(fs.readdirSync(root).sort()).toEqual(['Item.tsx', 'One.tsrx', 'Two.tsrx']);
		expect(fs.readFileSync(path.join(root, 'Item.tsx'), 'utf8')).toBe(source);
	});

	it('reports mixed-project collisions alongside other Strong candidates in the CLI', () => {
		const root = project({
			'package.json': '{"name":"app"}',
			'Legacy.tsx': 'export const Legacy = () => <i />;',
			'Legacy.tsrx': 'export function Legacy() @{ <b /> }',
			'View.tsx': 'import { Legacy } from "./Legacy.tsx"; export const View = () => <Legacy />;',
		});
		const result = spawnSync(
			process.execPath,
			[path.join(REPO, 'packages/codemod/dist/bin.js'), root, '--strong', '--print', '--json'],
			{ encoding: 'utf8' },
		);
		expect(result.status).toBe(1);
		const { files } = JSON.parse(result.stdout);
		expect(files).toEqual([
			expect.objectContaining({ file: 'Legacy.tsx', changed: false }),
			expect.objectContaining({
				file: 'View.tsx',
				output: 'View.tsrx',
				strong: true,
				code: expect.stringContaining('"./Legacy.tsx"'),
			}),
		]);
		expect(fs.readdirSync(root).sort()).toEqual([
			'Legacy.tsrx',
			'Legacy.tsx',
			'View.tsx',
			'package.json',
		]);
	});

	it('renames template modules and rewrites every import of them', async () => {
		const root = project({
			'package.json':
				'{\n  "name": "app",\n  "devDependencies": { "@radix-ui/react-slot": "^1.2.0" }\n}\n',
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
		// The bindings join package.json at their catalog versions, beside the
		// React package each replaces.
		const query = `^${catalogVersion('@octanejs/tanstack-query')}`;
		const radix = `^${catalogVersion('@octanejs/radix')}`;
		expect(result.dependencies).toEqual([
			{ name: '@octanejs/tanstack-query', range: query },
			{ name: '@octanejs/radix', range: radix },
		]);
		expect(read('package.json')).toBe(
			`{\n  "name": "app",\n  "devDependencies": {\n    "@octanejs/radix": "${radix}",\n    "@radix-ui/react-slot": "^1.2.0"\n  },\n  "dependencies": {\n    "@octanejs/tanstack-query": "${query}"\n  }\n}\n`,
		);
		expect(result.missing).toEqual([]);
		expect(result.files.flatMap((file) => file.diagnostics)).toEqual([]);
	});

	it.each(['null', '[]', '{"dependencies":"invalid"}'])(
		'preserves an invalid package manifest when adding bindings: %s',
		async (manifest) => {
			const root = project({
				'package.json': manifest,
				'App.tsx':
					'import * as Dialog from "@radix-ui/react-dialog"; export function App() { return <Dialog.Root />; }',
			});
			await expect(
				runCodemod([path.join(root, 'App.tsx')], { root, verify: false }),
			).rejects.toThrow();
			expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(manifest);
		},
	);

	it('adds only bindings the project lacks, and names patches the bindings drop', async () => {
		const root = project({
			'package.json': '{ "name": "mono", "private": true }',
			'pnpm-lock.yaml': '',
			'pnpm-workspace.yaml':
				'packages:\n  - apps/*\npatchedDependencies:\n  "@legendapp/list@3.3.5": patches/@legendapp__list@3.3.5.patch\n  micromark@4.0.2: patches/micromark@4.0.2.patch\n',
			'patches/@tanstack+react-pacer+0.19.4.patch': '',
			'apps/web/package.json':
				'{ "name": "web", "dependencies": { "@octanejs/zustand": "^0.1.0", "@legendapp/list": "3.3.5" } }',
			'apps/web/src/App.tsx': [
				"import { LegendList } from '@legendapp/list/react';",
				"import { useDebouncer } from '@tanstack/react-pacer';",
				"import { create } from 'zustand';",
				'export const useStore = create(() => ({ n: 0 }));',
				'export function App({ items }: { items: string[] }) {',
				'\tuseDebouncer(() => {}, { wait: 10 });',
				'\treturn <LegendList data={items} renderItem={({ item }) => <p>{item}</p>} />;',
				'}',
				'',
			].join('\n'),
		});
		const web = path.join(root, 'apps/web');
		const manifest = fs.readFileSync(path.join(web, 'package.json'), 'utf8');
		const result = await runCodemod([web], { write: false, verify: false });
		expect(result.dependencies).toEqual([
			{
				name: '@octanejs/legendapp-list',
				range: `^${catalogVersion('@octanejs/legendapp-list')}`,
			},
			// TanStack publishes its adapters, so the catalog has no version for them.
			{ name: '@tanstack/octane-pacer', range: 'latest' },
		]);
		expect(result.patched).toEqual([
			{ name: '@legendapp/list', patch: '../../patches/@legendapp__list@3.3.5.patch' },
			{ name: '@tanstack/react-pacer', patch: '../../patches/@tanstack+react-pacer+0.19.4.patch' },
		]);
		// A dry run reports what it would add without adding it.
		expect(fs.readFileSync(path.join(web, 'package.json'), 'utf8')).toBe(manifest);
	});

	it('names the project to run `octane init` in by a path that resolves from here', () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/A.tsx': 'export function A() {\n\treturn <p />;\n}\n',
		});
		const cwd = project({});
		const output = execFileSync(
			process.execPath,
			[path.join(import.meta.dirname, '../dist/bin.js'), root, '--no-verify'],
			{ cwd, encoding: 'utf8' },
		);
		expect(output).toContain(`init\` in ${root} to wire`);
	});

	it('previews and writes through an explicitly selected local recipe', () => {
		const api = new URL('../dist/index.js', import.meta.url).href;
		const root = project({
			'package.json': '{}',
			'Card.tsx': 'export const Card = () => <p />;',
			'recipes/card #1.mjs': `
				import { runCodemod as migrate } from ${JSON.stringify(api)};
				export async function runCodemod(paths, options) {
					const result = await migrate(paths, options);
					result.files[0].notes.push({rule: 'card', severity: 'error', line: 1, message: 'Review the card.'});
					return result;
				}`,
		});
		const args = [
			path.join(import.meta.dirname, '../dist/bin.js'),
			'Card.tsx',
			'--recipe',
			'recipes/card #1.mjs',
			'--no-verify',
		];
		const options = { cwd: root, encoding: /** @type {const} */ ('utf8') };
		const preview = spawnSync(process.execPath, [...args, '--json', '--print'], options);
		expect(preview.status).toBe(1);
		const [file] = JSON.parse(preview.stdout).files;
		expect(file).toMatchObject({
			file: 'Card.tsx',
			output: 'Card.tsrx',
			notes: [{ rule: 'card' }],
		});
		expect(fs.existsSync(path.join(root, 'Card.tsrx'))).toBe(false);

		const applied = spawnSync(process.execPath, args, options);
		expect(applied.status).toBe(1);
		expect(applied.stdout).toContain('Review the card.');
		expect(fs.readFileSync(path.join(root, 'Card.tsrx'), 'utf8')).toBe(file.code);
		expect(fs.existsSync(path.join(root, 'Card.tsx'))).toBe(false);
	});

	it.each([
		['missing.mjs', 'missing.mjs'],
		['invalid.mjs', 'named runCodemod function export'],
	])('reports an unusable recipe (%s)', (recipe, message) => {
		const root = project({ 'invalid.mjs': 'export default () => {};' });
		const result = spawnSync(
			process.execPath,
			[path.join(import.meta.dirname, '../dist/bin.js'), '--recipe', recipe, '--json'],
			{ cwd: root, encoding: 'utf8' },
		);
		expect(result.status).toBe(2);
		expect(result.stderr).toContain(`Cannot load --recipe ${recipe}`);
		expect(result.stderr).toContain(message);
		expect(result.stdout).toBe('');
	});

	it.each(['json', 'text'])('writes the complete %s report to a pipe', (format) => {
		const json = format === 'json';
		const root = project({
			'package.json': '{}',
			'Card.tsx': [
				json ? '' : "import { findDOMNode } from 'react-dom'; export const find = findDOMNode;",
				'export const Card = () => <p />;',
				'// ' + 'x'.repeat(1024 * 1024) + ' end of input',
			].join('\n'),
		});
		const cli = path.join(import.meta.dirname, '../dist/bin.js');
		const { status, stdout } = spawnSync(
			process.execPath,
			[cli, root, '--print', '--no-verify', ...(json ? ['--json'] : [])],
			{
				encoding: 'utf8',
				maxBuffer: 2 * 1024 * 1024,
				env: { ...process.env, NO_COLOR: '1' },
			},
		);
		expect(status).toBe(json ? 0 : 1);
		if (json) {
			expect(JSON.parse(stdout).files[0].code.trimEnd().endsWith('end of input')).toBe(true);
		} else {
			expect(stdout).toMatch(/^✗ Card\.tsx → Card\.tsrx/);
			expect(stdout.trimEnd().endsWith('1 error(s) (dry run)')).toBe(true);
		}
	});

	it('uses the original ref allocator for refs mounted by a Strong component', async () => {
		const root = project({
			'View.tsx': `import * as React from 'react';
import { createRef as allocate, type RefObject } from 'react';
export const named = allocate<HTMLButtonElement>();
export const qualified = React.createRef<HTMLButtonElement>();
export function View(props: { target: RefObject<HTMLButtonElement | null> }) {
	return <button ref={props.target}>Ready</button>;
}`,
		});
		fs.symlinkSync(
			path.resolve(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const [file] = (await runCodemod([root], { root, write: false, strong: true })).files;
		expect(file).toMatchObject({ strong: true, notes: [], diagnostics: [] });
		fs.writeFileSync(path.join(root, file.output), file.code);
		const dom = installDOM();
		try {
			const { act, createRoot, reactRef, View, named, qualified } = await bundleRuntime(
				root,
				'client',
				`export { act, createRoot } from 'octane';
export { createRef as reactRef } from 'react';
export * from './View.tsrx';`,
			);
			expect(named).not.toBe(qualified);
			const original = reactRef();
			for (const ref of [named, qualified]) {
				expect(Object.getOwnPropertyDescriptor(ref, 'current')).toEqual(
					Object.getOwnPropertyDescriptor(original, 'current'),
				);
				expect(Object.isSealed(ref)).toBe(Object.isSealed(original));
			}
			const container = dom.window.document.body;
			const app = createRoot(container);
			try {
				await act(async () => app.render(View, { target: named }));
				const button = container.querySelector('button');
				expect(button?.textContent).toBe('Ready');
				expect(named.current).toBe(button);
				await act(async () => app.render(View, { target: qualified }));
				expect(named.current).toBeNull();
				expect(qualified.current).toBe(button);
			} finally {
				await act(async () => app.unmount());
			}
			expect(qualified.current).toBeNull();
		} finally {
			vi.unstubAllGlobals();
			dom.window.close();
		}
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

	it('blocks a local React context Provider getter before writing', async () => {
		const context =
			"import { createContext as makeContext } from 'react'; const Theme = makeContext('default');";
		const get = 'get() { return Replacement; }';
		const descriptor = (/** @type {string} */ members) =>
			`Object.defineProperty(Theme, 'Provider', { configurable: true, ${members} });`;
		const getter = descriptor(get);
		const wrapped = `((Object as ObjectConstructor).defineProperty!)((Theme!), ('Provider' as const), ({ ${get} } satisfies PropertyDescriptor));`;
		const component = 'function Replacement({children}) { return <b>{children}</b>; }';
		const tag =
			'export const View = () => <Theme.Provider value="given"><span>child</span></Theme.Provider>;';
		const setters = {
			'GetSet.tsx': get + ', set(value) {}',
			'SetGet.tsx': "'set'(value) {}, " + get,
			'SetterFunction.tsx': 'set: function (value) {}, ' + get,
			'SetterArrow.tsx': get + ', set: (value) => {}',
		};
		const sources = {
			'Caller.tsx': "import { View } from './View.tsx'; export const Caller = () => <View />;",
			'View.tsx': [context, component, getter, tag].join('\n'),
			'Wrapped.tsx': [context, component, wrapped, tag].join('\n'),
			'Optional.tsx': [
				context,
				component,
				wrapped.replace('defineProperty!)(', 'defineProperty!)?.('),
				tag,
			].join('\n'),
			...Object.fromEntries(
				Object.entries(setters).map(([file, members]) => [
					file,
					[context, component, descriptor(members), tag].join('\n'),
				]),
			),
			'SetterOnly.tsx': [context, descriptor('set(value) {}'), tag].join('\n'),
			'Control.tsx': [context, tag].join('\n'),
			'Shadowed.tsx': [
				context,
				component,
				'const Object = { defineProperty() {} };',
				wrapped,
				tag,
			].join('\n'),
			'Sibling.tsx': [context, component, getter.replace("'Provider'", "'other'"), tag].join('\n'),
			'Deferred.tsx': [context, component, `function install() { ${getter} }`, tag].join('\n'),
			'Dead.tsx': [context, component, `if (false) ${getter}`, tag].join('\n'),
			'EarlierTag.tsx': [
				context,
				component,
				'export const view = <Theme.Provider value="given"><span>child</span></Theme.Provider>;',
				getter,
			].join('\n'),
			'Ordinary.tsx': [component, 'const Theme = { Provider: Replacement };', getter, tag].join(
				'\n',
			),
		};
		const root = project(sources);
		const inputs = Object.keys(sources).map((file) => path.join(root, file));
		const note = expect.objectContaining({ rule: 'context-provider-getter', severity: 'error' });
		const options = { root, verify: false };
		const preview = await runCodemod(inputs, { ...options, write: false });
		const byFile = new Map(preview.files.map((file) => [file.file, file]));
		for (const file of ['View.tsx', 'Wrapped.tsx', ...Object.keys(setters)])
			expect(byFile.get(file).notes).toEqual([note]);
		for (const file of [
			'Control.tsx',
			'Optional.tsx',
			'SetterOnly.tsx',
			'Shadowed.tsx',
			'Sibling.tsx',
			'Deferred.tsx',
			'Dead.tsx',
			'EarlierTag.tsx',
		]) {
			expect(byFile.get(file).notes).toEqual([]);
			expect(byFile.get(file).code).toContain('<Theme value="given">');
		}
		expect(byFile.get('Ordinary.tsx').notes).toEqual([]);
		expect(byFile.get('Ordinary.tsx').code).toContain('<Theme.Provider value="given">');

		const result = await runCodemod(inputs, options);
		expect(result.files).toEqual([
			expect.objectContaining({
				file: 'View.tsx',
				output: 'View.tsx',
				changed: false,
				code: sources['View.tsx'],
				notes: [note],
			}),
		]);
		expect(fs.readdirSync(root).sort()).toEqual(Object.keys(sources).sort());
		for (const [file, source] of Object.entries(sources))
			expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(source);
	});

	it.each([
		['data.ts', './data', "Provider() { return 'original'; }"],
		['data.ts', './data', 'get Provider() { return Provider; }'],
		['data.tsx', './data', 'Provider: () => "original"'],
		['data.tsx', './data.tsx', 'Provider'],
		['dir/index.tsx', './dir/index', 'Provider'],
	])(
		'preserves a direct object member from %s imported as %s (%s)',
		async (file, specifier, field) => {
			const root = project({
				'package.json': '{"name":"app","type":"module"}',
				'tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"}}',
				[file]: `const Provider = () => 'original';
			export const BadgeContext = {
				${field},
				Consumer() { return 'content'; },
			};`,
				'View.tsx': `import { BadgeContext as Badge } from '${specifier}';
const provide = Badge.Provider;
export function View() { return <b title={provide()}><Badge.Consumer>{(value) => value}</Badge.Consumer></b>; }`,
			});
			const result = await runCodemod([path.join(root, 'View.tsx')], { root, write: false });
			const view = result.files.find((file) => file.file === 'View.tsx').code;
			expect(view).toContain('const provide = Badge.Provider');
			expect(view).toContain('<Badge.Consumer>');
		},
	);

	it('uses an unselected TSX object only when the relative import identifies that source', async () => {
		const root = project({
			'package.json': '{"name":"app","type":"module"}',
			'tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"}}',
			'data.tsx': "export const BadgeContext = { Provider: () => 'original' };",
			'data.jsx':
				"import { createContext } from 'octane'; export const BadgeContext = createContext('fallback');",
			'View.tsx': `import { BadgeContext as Explicit } from './data.tsx';
import { BadgeContext as Ambiguous } from './data';
export function View() {
	return <><Explicit.Provider /><Ambiguous.Provider value="supplied" /></>;
}`,
		});
		const result = await runCodemod([path.join(root, 'View.tsx')], { root, write: false });
		const view = result.files.find((file) => file.file === 'View.tsx').code;
		expect(view).toContain('<Explicit.Provider />');
		expect(view).toContain('<Ambiguous value="supplied" />');
	});

	it('preserves the provider rewrite when a bundler can load a file ahead of a directory index', async () => {
		const root = project({
			'package.json': '{"name":"app","type":"module"}',
			'tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"}}',
			'data/index.tsx': "export const BadgeContext = { Provider: () => 'object' };",
			'data.mjs': "export { BadgeContext } from './owner.ts';",
			'owner.ts':
				"import { createContext } from 'react'; export const BadgeContext = createContext('default');",
			'View.tsx': `import { BadgeContext } from './data';
export function View() { return <BadgeContext.Provider value="supplied"><b /></BadgeContext.Provider>; }`,
		});
		const result = await runCodemod([path.join(root, 'View.tsx'), path.join(root, 'owner.ts')], {
			root,
			write: false,
		});
		expect(result.files.find((file) => file.file === 'owner.ts').code).toContain("from 'octane'");
		expect(result.files.find((file) => file.file === 'View.tsx').code).toContain(
			'<BadgeContext value="supplied"><b /></BadgeContext>',
		);
	});

	it('preserves the context naming fallback across a CommonJS producer boundary', async () => {
		const root = project({
			'package.json': '{"name":"app"}',
			'tsconfig.json': '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"}}',
			'source/tsconfig.json': '{"compilerOptions":{"module":"commonjs"}}',
			'source/data.ts': `import { createContext } from 'octane';
export const ThemeContext = { Provider() { return 'original'; } };
exports.ThemeContext = createContext('default');`,
			'View.tsx': `import { ThemeContext } from './source/data';
export function View() { return <ThemeContext.Provider value="supplied"><b /></ThemeContext.Provider>; }`,
		});
		const result = await runCodemod([path.join(root, 'View.tsx')], { root, write: false });
		expect(result.files.find((file) => file.file === 'View.tsx').code).toContain(
			'<ThemeContext value="supplied"><b /></ThemeContext>',
		);
	});

	it('keeps migrated providers reachable through unselected re-exports and directory links', async () => {
		const root = project({
			'package.json': '{"name":"app","type":"module"}',
			'tsconfig.json': '{"compilerOptions":{"paths":{"@theme":["./link/theme.ts"]}}}',
			'owner/theme.ts':
				"import { createContext } from 'react'; export const ThemeContext = createContext('light');",
			'selected.ts': "export { ThemeContext } from './owner/theme';",
			'retained.ts': "export { ThemeContext } from './owner/theme';",
			'View.tsx': `import { ThemeContext as Selected } from './selected';
import { ThemeContext as Retained } from './retained';
import { ThemeContext as Linked } from './link/theme';
import { ThemeContext as Alias } from '@theme';
export function View() { return <Selected.Provider value="a"><Retained.Provider value="b"><Linked.Provider value="c"><Alias.Provider value="d" /></Linked.Provider></Retained.Provider></Selected.Provider>; }`,
		});
		fs.symlinkSync(path.join(root, 'owner'), path.join(root, 'link'), 'dir');
		const result = await runCodemod(
			['owner/theme.ts', 'selected.ts', 'View.tsx'].map((file) => path.join(root, file)),
			{ root, write: false },
		);
		expect(result.files.find((file) => file.file === 'View.tsx').code).toContain(
			'<Selected value="a"><Retained value="b"><Linked value="c"><Alias value="d" /></Linked></Retained></Selected>',
		);
	});

	it('reports selected context member reads through TypeScript path aliases before writing', async () => {
		const root = project({
			'package.json': '{"name":"app","type":"module"}',
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					module: 'esnext',
					moduleResolution: 'bundler',
					paths: {
						'@shade': ['./shade.ts'],
						'@ordinary': ['./ordinary.ts'],
						'@factory': ['./factory.ts'],
						'@default': ['./default.ts'],
						'@unselected': ['./unselected.ts'],
						'@shadowed': ['./shadowed'],
					},
				},
			}),
			'shade.ts':
				"import { createContext } from 'react'; export const Shade = createContext('default');",
			'ordinary.ts': "export const BadgeContext = { Provider: () => 'plain' };",
			'factory.ts': `function make() { return { Provider: () => 'plain' }; }
export const MadeContext = make();
export const Plain = make();`,
			'default.ts': "export default { Provider: () => 'plain' };",
			'unselected.ts':
				"import { createContext } from 'react'; export const Outside = createContext('default');",
			'shadowed.ts':
				"import { createContext } from 'react'; export const Shadowed = createContext('default');",
			'shadowed.js': "export const Shadowed = { Provider: () => 'plain' };",
			'View.tsx': `import { Shade } from '@shade';
import { BadgeContext } from '@ordinary';
import { MadeContext, Plain } from '@factory';
import DefaultContext from '@default';
import { Outside } from '@unselected';
import { Shadowed } from '@shadowed';
export function View() {
	return <Shade.Provider value="night">
		<Shade.Consumer>{(value) => <b>{value}</b>}</Shade.Consumer>
		<BadgeContext.Provider /><MadeContext.Provider /><DefaultContext.Provider />
		<Plain.Provider /><Outside.Provider /><Shadowed.Provider />
	</Shade.Provider>;
}`,
		});
		const selection = [
			'shade.ts',
			'ordinary.ts',
			'factory.ts',
			'default.ts',
			'shadowed.ts',
			'View.tsx',
		].map((file) => path.join(root, file));
		const before = selection.map((file) => fs.readFileSync(file, 'utf8'));
		const options = { root, projectTypes: false, verify: false };
		const { files } = await runCodemod(selection, { ...options, write: false });
		const view = files.find(({ file }) => file === 'View.tsx');
		const notes = view?.notes.filter(({ rule }) => rule === 'context-path-alias');
		expect(notes).toEqual(
			['Provider', 'Consumer', 'Provider', 'Provider', 'Provider'].map((member) =>
				expect.objectContaining({
					severity: 'error',
					message: expect.stringContaining(`${member} member`),
				}),
			),
		);
		expect(view?.code).toContain('<Shade.Consumer>');
		for (const name of [
			'Shade',
			'BadgeContext',
			'MadeContext',
			'DefaultContext',
			'Plain',
			'Outside',
			'Shadowed',
		])
			expect(view?.code).toContain(`<${name}.Provider`);
		expect(files.find(({ file }) => file === 'shade.ts')?.code).toContain("from 'octane'");
		const result = await runCodemod(selection, options);
		expect(result.files).toEqual([
			expect.objectContaining({ file: 'View.tsx', changed: false, notes: [notes[0]] }),
		]);
		expect(selection.map((file) => fs.readFileSync(file, 'utf8'))).toEqual(before);
		expect(fs.existsSync(path.join(root, 'View.tsrx'))).toBe(false);
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

	it('migrates an SVG through a receiver and owner with public type queries', async () => {
		const root = project({
			'mark.svg': '<svg viewBox="0 0 10 10"><path d="M0 0L5 5Z"/></svg>',
			'Pane.tsx': `import type { ComponentProps, ReactNode } from 'react';
import Mark from './mark.svg';
function Button({ children }: { children: ReactNode }) {
	type Child = typeof children;
	return <button>{children}</button>;
}
export function Pane({ label }: { label: string }) {
	return <Button><Mark className={label} /></Button>;
}
export type Props = ComponentProps<typeof Pane>;
export type ButtonProps = ComponentProps<typeof Button>;`,
			'consumer.ts': `import type { Props } from './Pane.tsrx';
const valid: Props = { label: 'ok' };
// @ts-expect-error The migrated component still requires a string label.
const invalid: Props = { label: 42 };`,
			'raw.d.ts': "declare module '*?raw' { const xml: string; export default xml; }",
			'tsconfig.json': JSON.stringify({
				extends: path.join(REPO, 'packages/octane/typetests/tsconfig.json'),
				include: ['Pane.tsrx', '*.ts'],
			}),
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([path.join(root, 'Pane.tsx')], { root, svgPaths: true });
		expect(files.find((file) => file.file === 'Pane.tsx').rules['svg-paths']).toBe(1);
		typecheckProject(root);
	});

	it('typechecks the generated Strong span wrapper and its callers', async () => {
		const root = project({
			'Inline.tsx': `import type { ComponentProps as Props, ReactElement } from 'react';
export function Inline({ className, ...rest }: Props<'span'>): ReactElement {
	return <span className={className} {...rest} />;
}`,
			'consumer.ts': `import { Inline } from './Inline.tsrx';
Inline({ title: 'Hint' });
// @ts-expect-error Strong host props require trusted HTML.
Inline({ dangerouslySetInnerHTML: { __html: 'untrusted' } });`,
			'tsconfig.json': JSON.stringify({
				extends: path.join(REPO, 'packages/octane/typetests/tsconfig.json'),
				compilerOptions: { allowImportingTsExtensions: true },
				include: ['Inline.tsrx', 'consumer.ts'],
			}),
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([path.join(root, 'Inline.tsx')], { root, strong: true });
		expect(files).toMatchObject([{ strong: true, diagnostics: [] }]);
		typecheckProject(root);
	});

	it('migrates generic React event handlers with a native currentTarget type', async () => {
		const root = project({
			'Frame.tsx': `import type { ReactEventHandler as LoadHandler } from 'react';
export function Frame(props: { onLoad: LoadHandler<HTMLIFrameElement> }) {
	return <iframe onLoad={props.onLoad} />;
}`,
			'consumer.ts': `import { Frame } from './Frame.tsrx';
Frame({ onLoad(event) {
	const src: string = event.currentTarget.src;
	// @ts-expect-error Read native event properties directly.
	event.nativeEvent;
	// @ts-expect-error currentTarget exposes iframe members.
	event.currentTarget.reset();
} });`,
			'tsconfig.json': JSON.stringify({
				extends: path.join(REPO, 'packages/octane/typetests/tsconfig.json'),
				include: ['Frame.tsrx', 'consumer.ts'],
			}),
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([path.join(root, 'Frame.tsx')], { root, strong: true });
		expect(files).toMatchObject([{ strong: true, notes: [], diagnostics: [] }]);
		typecheckProject(root);
	});

	it('reports synthetic methods on event types imported through a migrated module', async () => {
		const root = project({
			'Frame.tsx': `import type { ReactEventHandler } from 'react';
export type Load = ReactEventHandler<HTMLIFrameElement>;
export function Frame(props: { onLoad: Load }) {
	return <iframe onLoad={props.onLoad} />;
}`,
			'ReactFrame.ts': `import type { ReactEventHandler } from 'react';
export function ReactFrame(props: { onLoad: ReactEventHandler<HTMLIFrameElement> }) { return null; }`,
			'App.tsx': `import { ReactCompat } from 'octane/react';
import { Frame, type Load } from './Frame';
import { ReactFrame } from './ReactFrame';
const listener: Load = (event) => event['isDefaultPrevented']();
export function App() {
	return <>
		<Frame onLoad={listener} />
		<Frame onLoad={(event) => event.isPropagationStopped()} />
		<ReactCompat><ReactFrame onLoad={(event) => event.isDefaultPrevented()} /></ReactCompat>
	</>;
}
export function inspect(value: { isDefaultPrevented(): boolean }) {
	return value.isDefaultPrevented();
}`,
			'tsconfig.json': JSON.stringify({
				extends: path.join(REPO, 'packages/octane/typetests/tsconfig.json'),
				compilerOptions: {
					paths: {
						react: [path.join(REPO, 'packages/octane/node_modules/@types/react/index.d.ts')],
						'react/jsx-runtime': [
							path.join(REPO, 'packages/octane/node_modules/@types/react/jsx-runtime.d.ts'),
						],
					},
				},
				include: ['*.tsx'],
			}),
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const inputs = ['App.tsx', 'Frame.tsx'].map((file) => path.join(root, file));
		const { files } = await runCodemod(inputs, {
			root,
			write: false,
			strong: true,
			projectTypes: true,
		});
		const app = files.find((file) => file.file === 'App.tsx');
		expect(
			app.notes.filter((note) => note.rule === 'event-object' && note.severity === 'error'),
		).toHaveLength(2);
	});

	it('preserves React class and style types on migrated intrinsic prop consumers', async () => {
		const root = project({
			'Primitives.tsx': `import type * as React from 'react';
import type { ComponentPropsWithoutRef as Props } from 'react';
const classText = (name?: string) => name?.trim() ?? '';
export function Button({ className, ...rest }: Props<'button'>) {
	return <button {...rest} className={classText(className)} />;
}
export interface PanelProps extends React.ComponentPropsWithRef<'section'> {}
export function Panel({ style, ...rest }: PanelProps) {
	return <section {...rest} style={{ ...style, color: 'red' }} />;
}
type FieldTag = 'input';
export type FieldProps = import('react').ComponentProps<FieldTag>;
export type DialProps = React.ComponentProps<'x-dial'>;
declare function Badge(props: { className: string[]; style: string }): React.ReactElement;
export type BadgeProps = React.ComponentProps<typeof Badge>;
`,
			'dial.d.ts': `import 'octane/jsx-runtime';
type Dial = { className: 'dial'; style: number };
declare module 'react' {
	namespace JSX { interface IntrinsicElements { 'x-dial': Dial } }
}
declare module 'octane/jsx-runtime' {
	namespace Octane.JSX { interface IntrinsicElements { 'x-dial': Dial } }
}`,
			'consumer.ts': `import { Button, Panel, type FieldProps, type BadgeProps, type DialProps } from './Primitives.tsrx';
Button({ type: 'submit', className: undefined, style: undefined });
Panel({ className: 'wrapper', style: { display: 'grid' }, ref: node => { node?.focus(); } });
const field: FieldProps = { type: 'number', style: undefined, className: 'numeric' };
const badge: BadgeProps = { className: ['accent'], style: 'color:red' };
const native: import('octane/strong').ComponentProps<'button'> = { className: ['wide'], style: 'display:grid' };
const dial: DialProps = { className: 'dial', style: 2 };
// @ts-expect-error A custom element keeps its declared class names.
const invalidDial: DialProps = { className: 'other', style: 2 };
// @ts-expect-error React class names are strings.
Button({ className: ['wide'] });
// @ts-expect-error React styles are objects.
Panel({ style: 'display:grid' });
// @ts-expect-error A button has no href.
Button({ href: '/next' });
// @ts-expect-error ComponentPropsWithoutRef omits the ref.
Button({ ref: () => {} });
// @ts-expect-error An SVG ref cannot be attached to a section.
Panel({ ref: (node: SVGSVGElement | null) => { node?.pauseAnimations(); } });
// @ts-expect-error Inline imports preserve the original class name type too.
const invalidField: FieldProps = { className: ['numeric'] };`,
			'tsconfig.json': JSON.stringify({
				extends: path.join(REPO, 'packages/octane/typetests/tsconfig.json'),
				compilerOptions: {
					allowImportingTsExtensions: true,
					exactOptionalPropertyTypes: true,
					verbatimModuleSyntax: true,
				},
				include: ['Primitives.tsrx', 'consumer.ts', 'dial.d.ts'],
			}),
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([root], { strong: true });
		const wrapper = files.find((file) => file.output === 'Primitives.tsrx');
		expect(wrapper).toMatchObject({ strong: true, diagnostics: [] });
		typecheckProject(root);
		expect(wrapper.code).not.toMatch(/(?:from\s+|import\(\s*)['"]react['"]/);
		const second = await runCodemod([root], { strong: true });
		expect(second.files.filter((file) => file.changed)).toEqual([]);
		expect(fs.readFileSync(path.join(root, 'Primitives.tsrx'), 'utf8')).toBe(wrapper.code);
	});

	it('keeps migrated type declarations visible across global scripts', async () => {
		const root = project({
			'button.ts': "type Action = import('react').ComponentProps<'button'>;",
			'panel.ts': "type Panel = import('react').ComponentPropsWithoutRef<'section'>;",
			'use.ts': `const action: Action = { type: 'reset' };
const panel: Panel = { style: { color: 'red' } };
// @ts-expect-error Migrated React styles are objects.
const invalid: Panel = { style: 'color:red' };`,
			'tsconfig.json': JSON.stringify({
				extends: path.join(REPO, 'packages/octane/typetests/tsconfig.json'),
				compilerOptions: { moduleDetection: 'legacy' },
				include: ['*.ts'],
			}),
		});
		fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules'), 'dir');
		const { files } = await runCodemod([root], { strong: true });
		expect(
			files
				.filter((file) => file.changed)
				.map((file) => file.output)
				.sort(),
		).toEqual(['button.ts', 'panel.ts']);
		typecheckProject(root);
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

	it.each(['new', 'declared'])(
		'maps standalone Floating UI positioning for a %s binding',
		async (state) => {
			const range = `^${catalogVersion('@octanejs/floating-ui')}`;
			const before = {
				'@floating-ui/react-dom': '^2.1.8',
				...(state === 'declared' ? { '@octanejs/floating-ui': range } : {}),
			};
			const root = project({
				'package.json': JSON.stringify({ name: 'app', dependencies: before }),
				'src/Position.tsx': `
import { autoUpdate, offset, useFloating } from '@floating-ui/react-dom';
import type { Placement } from '@floating-ui/react-dom';
export function Position({ placement }: { placement: Placement }) {
	const { floatingStyles, refs } = useFloating({
		placement,
		middleware: [offset(8)],
		whileElementsMounted: autoUpdate,
	});
	return <div ref={refs.setFloating} style={floatingStyles} />;
}
`,
			});
			const { files, dependencies, packages, missing } = await runCodemod([root], {
				write: true,
				strong: true,
			});
			const position = files.find((file) => file.output === 'src/Position.tsrx');
			expect(position?.code).toContain(
				"import { autoUpdate, offset, useFloating } from '@octanejs/floating-ui/react-dom';",
			);
			expect(position?.code).toContain(
				"import type { Placement } from '@octanejs/floating-ui/react-dom';",
			);
			expect(position?.strong).toBe(true);
			expect(position?.notes.filter((note) => note.severity === 'error')).toEqual([]);
			expect(missing).toEqual([]);
			expect(packages).toEqual([{ from: '@floating-ui/react-dom', to: '@octanejs/floating-ui' }]);
			expect(dependencies).toEqual(
				state === 'new' ? [{ name: '@octanejs/floating-ui', range }] : [],
			);
			expect(
				JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies,
			).toEqual({ '@floating-ui/react-dom': '^2.1.8', '@octanejs/floating-ui': range });
		},
	);

	it.each([
		['uninstalled', undefined],
		['older', { '.': './index.js' }],
		['type-only', { './react-dom': { types: './index.d.ts', import: null } }],
		['blocked', { './*': './*', './react-dom': null }],
		['conditional', { './react-dom': { node: null, default: './index.js' } }],
	])(
		'keeps the positioning import when the %s binding cannot serve its subpath',
		async (_state, exports) => {
			const root = project({
				'package.json': '{"name":"app","dependencies":{"@octanejs/floating-ui":"0.1.68"}}',
				'Position.tsx': `import { useFloating } from '@floating-ui/react-dom';
export function Position() {
	const { refs } = useFloating();
	return <div ref={refs.setFloating} />;
}`,
				...(exports
					? {
							'node_modules/@octanejs/floating-ui/package.json': JSON.stringify({
								name: '@octanejs/floating-ui',
								version: '0.1.68',
								exports,
							}),
							'node_modules/@octanejs/floating-ui/index.js': 'export const useFloating = () => {};',
						}
					: {}),
			});
			const { files, dependencies, packages } = await runCodemod([root], { write: false });
			const position = files.find((file) => file.file === 'Position.tsx');
			expect(position?.code).toContain("from '@floating-ui/react-dom'");
			expect(position?.notes).toContainEqual(
				expect.objectContaining({
					rule: 'bindings',
					severity: 'error',
					message: expect.stringContaining('exports `./react-dom`'),
				}),
			);
			expect(dependencies).toEqual([]);
			expect(packages).toEqual([]);
		},
	);

	it.each(['@floating-ui/react-dom', '@octanejs/floating-ui/react-dom'])(
		'keeps the positioning import when project resolution shadows %s',
		async (specifier) => {
			const root = project({
				'package.json': '{"name":"app"}',
				'nested/tsconfig.json': JSON.stringify({
					compilerOptions: {
						moduleResolution: 'bundler',
						paths: { [specifier]: ['./local.ts'] },
					},
				}),
				'nested/local.ts': 'export const useFloating = () => ({ label: "local" });',
				'nested/Position.tsx': `import { useFloating } from '@floating-ui/react-dom';
export function Position() {
	const { label } = useFloating();
	return <div title={label} />;
}`,
			});
			const { files, dependencies } = await runCodemod([root], {
				write: false,
				projectTypes: false,
			});
			const position = files.find((file) => file.file === 'nested/Position.tsx');
			expect(position?.code).toContain("from '@floating-ui/react-dom'");
			expect(position?.notes).toContainEqual(
				expect.objectContaining({
					rule: 'bindings',
					severity: 'error',
					message: expect.stringContaining(specifier),
				}),
			);
			expect(dependencies).toEqual([]);
		},
	);

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

	it('keeps the React Lottie hook despite its binding catalog entry', async () => {
		const name = 'lottie-react';
		const root = project({
			'package.json': '{"name":"app","dependencies":{"lottie-react":"2.4.1"}}',
			'node_modules/lottie-react/package.json':
				'{"name":"lottie-react","version":"2.4.1","peerDependencies":{"react":"*"}}',
			'Animation.tsx': `import { useLottie } from '${name}';
export function Animation() { return useLottie({ animationData: {}, autoplay: false }).View; }`,
		});
		expect(DATA.reactPackages[name]).toBe('@octanejs/lottie-react');
		const result = await runCodemod([path.join(root, 'Animation.tsx')], {
			root,
			write: false,
			strong: true,
			verify: true,
		});
		expect(result.files[0]?.code).toContain("from 'lottie-react'");
		expect(result.files[0]?.notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
		expect(result.dependencies).toEqual([]);
	});

	it('maps @effect/atom-react to its binding', async () => {
		// T3 Code's shapes: a registry provider built with createElement, and a
		// query hook that reads the registry and refreshes atoms.
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/atomRegistry.ts':
				"import { RegistryContext } from '@effect/atom-react';\nimport { AtomRegistry } from 'effect/reactivity';\nimport { createElement } from 'react';\n\nexport const appAtomRegistry = AtomRegistry.make();\n\nexport function AppAtomRegistryProvider({ children }: React.PropsWithChildren) {\n\treturn createElement(RegistryContext.Provider, { value: appAtomRegistry }, children);\n}\n",
			'src/query.ts':
				"import { RegistryContext, useAtomRefresh, useAtomValue } from '@effect/atom-react';\nimport { Atom } from 'effect/reactivity';\nimport { useContext } from 'react';\n\nexport function useQuery<A>(atom: Atom.Atom<A>) {\n\tconst registry = useContext(RegistryContext);\n\tconst value = useAtomValue(atom);\n\tconst refresh = useAtomRefresh(atom);\n\treturn { registry, value, refresh };\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		const provider = result.files.find((file) => file.file === 'src/atomRegistry.ts');
		const query = result.files.find((file) => file.file === 'src/query.ts');
		expect(provider?.code).toContain("import { RegistryContext } from '@octanejs/effect-atom';");
		expect(provider?.code).toContain(
			'return createElement(RegistryContext, { value: appAtomRegistry }, children);',
		);
		expect(query?.code).toContain(
			"import { RegistryContext, useAtomRefresh, useAtomValue } from '@octanejs/effect-atom';",
		);
		for (const file of [provider, query]) {
			expect(file?.code).not.toContain("'@effect/atom-react'");
			expect(file?.code).not.toContain('No Octane port');
			expect(file?.diagnostics).toEqual([]);
		}
		expect(result.packages).toEqual([{ from: '@effect/atom-react', to: '@octanejs/effect-atom' }]);
		expect(result.missing).toEqual([]);
	});

	it('maps @pierre/trees/react to its binding and keeps the @pierre/trees core', async () => {
		// T3 Code's shapes: the diff file tree reads a derived value through
		// useFileTreeSelector; the file browser adds useFileTreeSearch. Both take
		// types from the framework-neutral core.
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/DiffFileTree.tsx':
				"import type { GitStatusEntry } from '@pierre/trees';\nimport { FileTree, useFileTree, useFileTreeSelector } from '@pierre/trees/react';\n\nexport function DiffFileTree({ paths, gitStatus }: { paths: string[]; gitStatus: GitStatusEntry[] }) {\n\tconst { model } = useFileTree({ paths, gitStatus, initialExpansion: 'open' });\n\tconst selected = useFileTreeSelector(model, (current) => current.getSelectedPaths().length);\n\treturn <FileTree model={model} aria-label={`${selected} selected`} />;\n}\n",
			'src/FileBrowserPanel.tsx':
				"import type { ContextMenuItem } from '@pierre/trees';\nimport { FileTree, useFileTree, useFileTreeSearch, useFileTreeSelector } from '@pierre/trees/react';\n\nexport function FileBrowserPanel({ paths }: { paths: string[]; onOpen?: (item: ContextMenuItem) => void }) {\n\tconst { model } = useFileTree({ paths, search: true });\n\tconst search = useFileTreeSearch(model);\n\tconst focused = useFileTreeSelector(model, (current) => current.getFocusedPath());\n\treturn (\n\t\t<div>\n\t\t\t<input value={search.value} onInput={(event) => search.setValue(event.currentTarget.value)} />\n\t\t\t<FileTree model={model} aria-label={focused ?? 'files'} className=\"min-h-0 flex-1\" />\n\t\t</div>\n\t);\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		const diffTree = result.files.find((file) => file.file === 'src/DiffFileTree.tsx');
		const browser = result.files.find((file) => file.file === 'src/FileBrowserPanel.tsx');
		expect(diffTree?.code).toContain(
			"import { FileTree, useFileTree, useFileTreeSelector } from '@octanejs/pierre-trees';",
		);
		expect(browser?.code).toContain(
			"import { FileTree, useFileTree, useFileTreeSearch, useFileTreeSelector } from '@octanejs/pierre-trees';",
		);
		for (const file of [diffTree, browser]) {
			expect(file?.code).toContain("from '@pierre/trees';");
			expect(file?.code).not.toContain("'@pierre/trees/react'");
			expect(file?.code).not.toContain('No Octane port');
			expect(file?.notes.filter((note) => note.rule === 'bindings')).toEqual([]);
		}
		expect(result.packages).toEqual([
			{ from: '@pierre/trees/react', to: '@octanejs/pierre-trees' },
		]);
		expect(result.missing).toEqual([]);
	});

	it('maps @legendapp/list/react to its binding instead of reporting it unported', async () => {
		// T3 Code's timeline shape: a typed LegendList with renderItem, scroll anchoring
		// options and an imperative ref.
		const root = project({
			'package.json': '{ "name": "app" }',
			'node_modules/@legendapp/list/package.json': JSON.stringify({
				version: '3.3.5',
				exports: { './react': './react.mjs' },
				peerDependencies: { react: '*' },
			}),
			'src/Timeline.tsx': [
				"import { LegendList, type LegendListRef } from '@legendapp/list/react';",
				"import { useRef } from 'react';",
				'',
				'export function Timeline({ rows }: { rows: { id: string; text: string }[] }) {',
				'\tconst listRef = useRef<LegendListRef | null>(null);',
				'\treturn (',
				'\t\t<LegendList',
				'\t\t\tref={listRef}',
				'\t\t\tdata={rows}',
				'\t\t\tkeyExtractor={(row) => row.id}',
				'\t\t\trenderItem={({ item }) => <p>{item.text}</p>}',
				'\t\t\tinitialScrollAtEnd',
				'\t\t\tmaintainScrollAtEnd={{ animated: false, on: { dataChange: true } }}',
				'\t\t\tmaintainVisibleContentPosition',
				'\t\t\tonScroll={() => listRef.current?.scrollToEnd({ animated: false })}',
				'\t\t/>',
				'\t);',
				'}',
				'',
			].join('\n'),
		});
		const result = await runCodemod([root], { write: false });
		const timeline = result.files.find((file) => file.file === 'src/Timeline.tsx');
		expect(timeline?.code).toContain(
			"import { LegendList, type LegendListRef } from '@octanejs/legendapp-list';",
		);
		expect(timeline?.code).not.toContain('@legendapp/list');
		expect(timeline?.notes.filter((note) => note.rule === 'bindings')).toEqual([]);
		expect(result.packages).toEqual([
			{ from: '@legendapp/list/react', to: '@octanejs/legendapp-list' },
		]);
		expect(result.missing).toEqual([]);
	});

	it('checks binding subpaths against what the binding exports', async () => {
		// T3 Code's shapes. `@daypicker/react` re-exports `react-day-picker`.
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/store.ts':
				"import { persist } from 'zustand/middleware';\nimport { immer } from 'zustand/middleware/immer';\nimport { useShallow } from 'zustand/react/shallow';\nimport { shallow } from 'zustand/vanilla/shallow';\nexport { persist, immer, useShallow, shallow };\n",
			'src/Calendar.tsx':
				"import { DayPicker } from '@daypicker/react';\nimport { fr } from '@daypicker/react/locale/fr';\nimport { Dialog } from '@base-ui/react/dialog';\nexport function Calendar() {\n\treturn <Dialog.Root><DayPicker locale={fr} /></Dialog.Root>;\n}\n",
		});
		const result = await runCodemod([root], { write: false });
		const store = result.files.find((file) => file.file === 'src/store.ts');
		const calendar = result.files.find((file) => file.file === 'src/Calendar.tsx');
		for (const subpath of ['middleware', 'middleware/immer', 'react/shallow', 'vanilla/shallow']) {
			expect(store?.code).toContain(`from '@octanejs/zustand/${subpath}'`);
		}
		expect(store?.notes).toEqual([
			{
				rule: 'bindings',
				severity: 'error',
				line: 1,
				message:
					'`@octanejs/zustand` has no `./middleware/immer` export. Import these names from its root if it exports them there.',
			},
		]);
		expect(calendar?.code).toContain("import { DayPicker } from '@octanejs/day-picker';");
		expect(calendar?.code).toContain("import { fr } from '@octanejs/day-picker/locale/fr';");
		expect(calendar?.code).toContain("import { Dialog } from '@octanejs/base-ui/dialog';");
		expect(calendar?.notes.filter((note) => note.rule === 'bindings')).toEqual([]);
		expect(result.missing).toEqual([]);
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

	it('maps direct consolidated Radix Slot members to flat binding exports', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'src/named.tsx': `import { Slot as Projection } from 'radix-ui';
export function App() { return <Projection.Root><button>Press</button></Projection.Root>; }`,
			'src/plain.tsx': `import { Slot } from 'radix-ui';
export function App() { return <Slot.Root><button>Press</button></Slot.Root>; }`,
			'src/slottable.tsx': `import { Slot } from 'radix-ui';
export function App() { return <Slot.Slottable children={<button>Press</button>} />; }`,
			'src/namespace.tsx': `import * as Radix from 'radix-ui';
export type Projection = typeof Radix.Slot.Slot;
export function App() { return <Radix.Slot.Slottable children={<button>Press</button>} />; }`,
			'src/factory.tsx': `import { Slot } from 'radix-ui';
export const Wrapped = Slot.createSlot('Wrapped');`,
			'src/alias.tsx': `import { Slot } from 'radix-ui';
const Wrapper = Slot.Root;
export function App() { return <Wrapper><button>Press</button></Wrapper>; }`,
			'src/children.tsx': `import { Slot } from 'radix-ui';
export function App({ child }) { return <Slot.Root>{child}</Slot.Root>; }`,
			'src/array.tsx': `import { Slot } from 'radix-ui';
export function App() { return <Slot.Root children={[<button>Press</button>]} />; }`,
			'src/spread.tsx': `import { Slot } from 'radix-ui';
export function App(props) { return <Slot.Root {...props} />; }`,
			'src/marker.tsx': `import { Slot } from 'radix-ui';
export function App() {
	return <Slot.Root data-mark="merged"><Slot.Slottable><button>Press</button></Slot.Slottable></Slot.Root>;
}`,
			'src/whole.tsx': `export * from 'radix-ui';
export * as Radix from 'radix-ui';
export type Projection = typeof import('radix-ui').Slot.Root;
export const load = () => import('radix-ui');`,
		});
		const { files } = await runCodemod([root], { write: false });
		const named = files.find(({ file }) => file === 'src/named.tsx');
		const plain = files.find(({ file }) => file === 'src/plain.tsx');
		const slottable = files.find(({ file }) => file === 'src/slottable.tsx');
		const namespace = files.find(({ file }) => file === 'src/namespace.tsx');
		expect(named?.code).toContain("import { Slot as Projection } from '@octanejs/radix';");
		expect(named?.code).toContain('<Projection children={<button>Press</button>}');
		expect(named?.notes.filter(({ severity }) => severity === 'error')).toEqual([]);
		expect(plain?.code).toContain("import { Slot } from '@octanejs/radix';");
		expect(plain?.code).toContain('<Slot children={<button>Press</button>}');
		expect(slottable?.code).toContain("import { Slottable } from '@octanejs/radix';");
		expect(slottable?.code).toContain('<Slottable children={<button>Press</button>}');
		expect(namespace?.code).toContain('export type Projection = typeof Radix.Slot;');
		expect(namespace?.code).toContain('<Radix.Slottable');
		expect(namespace?.notes.filter(({ severity }) => severity === 'error')).toEqual([]);
		for (const source of ['factory', 'alias', 'children', 'array', 'spread', 'marker']) {
			const retained = files.find(({ file }) => file === `src/${source}.tsx`);
			expect(retained?.code).toContain("from 'radix-ui'");
			expect(retained?.notes).toEqual(
				expect.arrayContaining([expect.objectContaining({ rule: 'bindings', severity: 'error' })]),
			);
		}
		const whole = files.find(({ file }) => file === 'src/whole.tsx');
		expect(whole?.code).not.toContain('@octanejs/radix');
		expect(
			whole?.notes.filter(({ rule, severity }) => rule === 'bindings' && severity === 'error'),
		).toHaveLength(4);
	});

	it('keeps a local module that shadows the consolidated Radix package', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'tsconfig.json': '{ "compilerOptions": { "strict": true, "moduleResolution": "bundler" } }',
			'src/tsconfig.json':
				'{ "extends": "../tsconfig.json", "compilerOptions": { "paths": { "radix-ui": ["./other.ts"] } } }',
			'src/other.ts': 'export const Slot = { Root: () => "local" };',
			'src/view.tsx': `import { Slot } from 'radix-ui';
export function App() { return <Slot.Root><button>Press</button></Slot.Root>; }`,
		});
		for (const projectTypes of [false, true]) {
			const { files } = await runCodemod([path.join(root, 'src/view.tsx')], {
				root,
				write: false,
				projectTypes,
			});
			expect(files[0].code).toContain("from 'radix-ui'");
			expect(files[0].code).toContain('<Slot.Root>');
			expect(files[0].notes).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						rule: 'bindings',
						severity: 'error',
						message: expect.stringContaining('TypeScript alias'),
					}),
				]),
			);
		}
	});

	it('migrates only proven export references from the React Motion entry points', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'supported.ts': `import { motion, inView } from 'framer-motion';
import * as Motion from 'motion/react';
export const supported = [motion.div, inView, Motion['motion'].span];
export type Transition = import('motion/react').Transition;`,
			'unsupported.tsx': `import { AnimatePresence, useIsPresent as usePresent } from 'framer-motion';
import * as Motion from 'motion/react';
export { type HTMLMotionProps as Props } from 'framer-motion';
export function App() { return <AnimatePresence><Motion.Reorder.Group>{usePresent()}</Motion.Reorder.Group></AnimatePresence>; }`,
			'whole.ts': `export * from 'framer-motion';
import * as Motion from 'framer-motion';
export const lookup = (name: string) => Motion[name];
export const load = () => import('motion/react');`,
			'default.ts': `import Motion, { motion } from 'framer-motion';
export const views = [Motion, motion.div];`,
		});
		const { files } = await runCodemod([root], { verify: false, write: false });
		const supported = files.find(({ file }) => file === 'supported.ts');
		expect(supported?.notes).toEqual([]);
		expect(supported?.code).not.toMatch(/['"](?:framer-motion|motion\/react)['"]/);
		expect(supported?.code.match(/@octanejs\/motion/g)).toHaveLength(3);
		const unsupported = files.find(({ file }) => file === 'unsupported.tsx');
		expect(unsupported?.code).not.toContain('@octanejs/motion');
		for (const name of ['useIsPresent', 'Reorder', 'HTMLMotionProps']) {
			expect(unsupported?.notes).toContainEqual(
				expect.objectContaining({
					rule: 'bindings',
					severity: 'error',
					message: expect.stringContaining(name),
				}),
			);
		}
		const whole = files.find(({ file }) => file === 'whole.ts');
		expect(whole?.code).not.toContain('@octanejs/motion');
		expect(whole?.notes.filter(({ severity }) => severity === 'error')).toHaveLength(3);
		const withDefault = files.find(({ file }) => file === 'default.ts');
		expect(withDefault?.code).not.toContain('@octanejs/motion');
		expect(withDefault?.notes).toContainEqual(
			expect.objectContaining({ severity: 'error', message: expect.stringContaining('default') }),
		);
		const manifest = path.join(root, 'package.json');
		const before = fs.readFileSync(manifest, 'utf8');
		const retained = await runCodemod([path.join(root, 'unsupported.tsx')], { verify: false });
		expect(retained.packages).toEqual([]);
		expect(retained.dependencies).toEqual([]);
		expect(fs.readFileSync(manifest, 'utf8')).toBe(before);
		const migrated = await runCodemod([path.join(root, 'supported.ts')], { verify: false });
		expect(migrated.packages.map(({ from }) => from)).toEqual(['framer-motion', 'motion/react']);
		expect(migrated.dependencies.map(({ name }) => name)).toEqual(['@octanejs/motion']);
		expect(JSON.parse(fs.readFileSync(manifest, 'utf8')).dependencies['@octanejs/motion']).toBe(
			`^${catalogVersion('@octanejs/motion')}`,
		);
	});

	it.each([
		['matching installed release', '0.1.15', './index.ts'],
		['missing install', undefined, undefined],
		['stale install', '0.1.67', './index.ts'],
		['conditional root', '0.1.15', { types: './index.ts', default: './index.js' }],
	])(
		'checks Motion exports before rewriting imports with a %s',
		async (scenario, installed, exportsRoot) => {
			const binding = '@octanejs/motion';
			const manifest = JSON.stringify({ dependencies: { [binding]: '0.1.15' } });
			const root = project({
				'package.json': manifest,
				'available.ts': "export { inView } from 'framer-motion';",
				'unavailable.ts': "export { LayoutGroup } from 'motion/react';",
				...(installed && {
					[`node_modules/${binding}/package.json`]: JSON.stringify({
						name: binding,
						type: 'module',
						version: installed,
						exports: { '.': exportsRoot },
					}),
					[`node_modules/${binding}/index.ts`]: "export * from './engine.js';",
					[`node_modules/${binding}/engine.ts`]: 'export const inView = () => {};',
				}),
			});
			const inputs = ['available.ts', 'unavailable.ts'].map((file) => path.join(root, file));
			const result = await runCodemod(inputs, { root, verify: false });
			const available = result.files.find(({ file }) => file === 'available.ts');
			const unavailable = result.files.find(({ file }) => file === 'unavailable.ts');
			const canCheck = scenario === 'matching installed release';
			expect(available?.code).toContain(canCheck ? binding : 'framer-motion');
			expect(available?.notes).toHaveLength(canCheck ? 0 : 1);
			expect(unavailable?.code).toContain('motion/react');
			expect(unavailable?.notes).toEqual([
				expect.objectContaining({
					rule: 'bindings',
					severity: 'error',
					message: expect.stringContaining(canCheck ? 'LayoutGroup' : binding),
				}),
			]);
			expect(result.dependencies).toEqual([]);
			expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(manifest);
		},
	);

	it('retains Motion context type references while migrating the corresponding value', async () => {
		const blocked = [
			"import type { MotionConfigContext as C } from 'motion/react'; export type T = C;",
			"import { MotionConfigContext as C } from 'framer-motion'; export interface T extends C {}",
			"import * as Motion from 'motion/react'; export type T = Motion.MotionConfigContext;",
			"import * as Motion from 'motion/react'; export interface T extends Motion.MotionConfigContext {}",
			"import * as Motion from 'motion/react'; import C = Motion.MotionConfigContext; export type T = C;",
			"export type T = import('motion/react').MotionConfigContext;",
			"export { MotionConfigContext as Context } from 'motion/react';",
			"import { MotionConfigContext as C } from 'motion/react'; export { C };",
			"import { MotionConfigContext as C } from 'motion/react'; export default C;",
			"import * as Motion from 'motion/react'; export default Motion.MotionConfigContext;",
		];
		const allowed = [
			"import type { MotionConfigContext as C } from 'motion/react'; export type T = typeof C;",
			"import * as Motion from 'motion/react'; export type T = typeof Motion.MotionConfigContext;",
			"export type T = typeof import('motion/react').MotionConfigContext;",
			"import { MotionConfigContext as C } from 'motion/react'; export const Context = C;",
		];
		const root = project(
			Object.fromEntries([...blocked, ...allowed].map((source, i) => [`context${i}.ts`, source])),
		);
		const result = await runCodemod([root], { write: false, verify: false });
		for (const [i, source] of [...blocked, ...allowed].entries()) {
			const file = result.files.find(({ file }) => file === `context${i}.ts`);
			if (i < blocked.length) {
				expect(file?.code).toBe(source);
				expect(file?.notes).toEqual([
					expect.objectContaining({
						rule: 'bindings',
						severity: 'error',
						message: expect.stringContaining('MotionConfigContext'),
					}),
				]);
			} else {
				expect(file?.code).toContain('@octanejs/motion');
				expect(file?.notes).toEqual([]);
			}
		}
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
			/** @type {import('../dist/index.js').FileResult} */ file,
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

	it('fails loudly where an unported component takes props Octane may render', async () => {
		// T3 Code's MorphIcon: SVG props include React's `children`, which a
		// caller may fill with content Octane renders, so no island can host it.
		const root = project({
			'package.json': '{ "name": "app" }',
			'node_modules/react/package.json': '{ "version": "19.2.6" }',
			'node_modules/react-dom/package.json': '{ "version": "19.2.6" }',
			'node_modules/morphicons/package.json': '{ "version": "1.7.1" }',
			'node_modules/morphicons/react.d.ts':
				'type ReactNode = string | { element: true };\ninterface SVGProps { className?: string; children?: ReactNode }\nexport interface MorphIconProps extends SVGProps { icon?: string; reducedMotion?: "user" | "never" }\nexport declare const MorphIcon: (props: MorphIconProps) => null;\n',
			'tsconfig.json': '{ "compilerOptions": { "strict": true, "jsx": "preserve" } }',
			'src/MorphIcon.tsx':
				'import { MorphIcon as BaseMorphIcon, type MorphIconProps } from "morphicons/react";\n\nexport function MorphIcon({ reducedMotion = "user", ...props }: MorphIconProps) {\n  return <BaseMorphIcon reducedMotion={reducedMotion} {...props} />;\n}\n',
		});
		const result = await runCodemod([root], { write: false, strong: true });
		const [file] = result.files;
		expect(result.missing).toEqual([
			{ name: 'morphicons/react', modules: 1, islands: 0, blocked: 1 },
		]);
		expect(file.notes.map((note) => note.message)).toEqual([
			'`<BaseMorphIcon>` takes children or props that Octane renders, which cannot cross into a React island. `morphicons/react` has no Octane port.',
		]);
		// It throws that error where it would render, not as its module loads:
		// T3's Clerk shell imports `<ClerkProvider>` but renders it only with a key.
		expect(file.code).toContain(
			`@{\n  <NoOctanePort error="${file.notes[0].message}"><BaseMorphIcon reducedMotion={reducedMotion} {...props} /></NoOctanePort>\n}\n\nfunction NoOctanePort({ error }: { error: string; children?: unknown }): never {\n  throw new Error(error);\n}\n`,
		);
		expect([file.code.includes('ReactCompat'), file.strong, file.diagnostics]).toEqual([
			false,
			true,
			[],
		]);
	});

	it('keeps imports working when migrating one component at a time', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					moduleSuffixes: ['.native', ''],
					paths: {
						'~/*': ['./src/*'],
						'@card': ['./src/cards/index.tsx'],
						'#/*': ['./overrides/*', './src/*'],
					},
				},
			}),
			'src/cards/index.tsx': 'export function Card() { return <p />; }',
			'overrides/cards/index.tsrx': 'export const Card = () => null;',
			'src/Label.native.tsx': 'export const Label = () => <i />;',
			'src/Badge.tsx': 'export function Badge() { return <b />; }',
			'src/types.ts': 'export type Entry<T> = T;',
			'src/Badge.ts': 'export const Badge = 1;',
			'src/App.tsx': [
				"import { Card } from '~/cards';",
				"import { Badge } from './Badge';",
				"export { Card as Other } from '@card';",
				"export { Card as Fallback } from '#/cards';",
				"export { Label } from '~/Label';",
				"export const load = () => import('./cards');",
				"export const caption = './cards';",
				"type Entry = import('./types').Entry<'./cards'>;",
				'export const App = () => <Card />;',
			].join('\n'),
			'src/Panel.tsrx':
				"// 🌵\nimport { Card } from './cards';\nexport function Panel() @{ <p>import './cards'</p> }",
		});
		await runCodemod([
			path.join(root, 'src/cards/index.tsx'),
			path.join(root, 'src/Badge.tsx'),
			path.join(root, 'src/Label.native.tsx'),
		]);
		const read = (/** @type {string} */ name) => fs.readFileSync(path.join(root, name), 'utf8');
		expect(read('src/App.tsx')).toBe(
			[
				"import { Card } from '~/cards/index.tsrx';",
				"import { Badge } from './Badge';",
				"export { Card as Other } from './cards/index.tsrx';",
				"export { Card as Fallback } from './cards/index.tsrx';",
				"export { Label } from '~/Label.native.tsrx';",
				"export const load = () => import('./cards/index.tsrx');",
				"export const caption = './cards';",
				"type Entry = import('./types').Entry<'./cards'>;",
				'export const App = () => <Card />;',
			].join('\n'),
		);
		expect(read('src/Panel.tsrx')).toBe(
			"// 🌵\nimport { Card } from './cards/index.tsrx';\nexport function Panel() @{ <p>import './cards'</p> }",
		);
	});

	it('points exact path strings in configs and scripts at renamed modules', async () => {
		// T3 Code warms its entry and first routes by path, from its Vite
		// config and from a plugin beside it, outside the migrated `src`.
		const root = project({
			'package.json': '{ "name": "app" }',
			'vite.config.ts':
				'export default { server: { warmup: { clientFiles: ["./src/main.tsx", "./src/*.tsx"] } } };\n',
			'vite/warm.ts':
				'export const entries = ["src/main.tsx", "src/routes/chat.tsx", "src/lib/icons.ts", "src/main", "main.tsx"];\n',
			'paths.ts': 'export const main = file`src/main.tsx`;',
			'src/main.tsx':
				"import { createRoot } from 'react-dom/client';\ncreateRoot(document.body).render(<p />);\n",
			'src/routes/chat.tsx': 'export const Chat = () => <p />;\n',
			'src/lib/icons.ts': 'export const icons = {};\n',
		});
		const result = await runCodemod([path.join(root, 'src')]);
		const read = (/** @type {string} */ name) => fs.readFileSync(path.join(root, name), 'utf8');
		// Globs, extensionless paths, and modules that keep their names stay.
		expect(read('paths.ts')).toBe('export const main = file`src/main.tsrx`;');
		expect(read('vite.config.ts')).toBe(
			'export default { server: { warmup: { clientFiles: ["./src/main.tsrx", "./src/*.tsx"] } } };\n',
		);
		expect(read('vite/warm.ts')).toBe(
			'export const entries = ["src/main.tsrx", "src/routes/chat.tsrx", "src/lib/icons.ts", "src/main", "main.tsx"];\n',
		);
		expect(
			result.files
				.filter((file) => file.rules['module-paths'])
				.map((file) => [file.file, file.rules['module-paths']]),
		).toEqual([
			['paths.ts', 1],
			['vite.config.ts', 1],
			['vite/warm.ts', 2],
		]);
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

	it('maps @pierre/diffs/react to its binding and leaves the framework-neutral core', async () => {
		// T3 Code's shapes: a worker-pool provider, a styled CodeView adapter, a
		// FileDiff excerpt, and type-only imports, beside imports of the core.
		const root = project({
			'package.json': '{ "name": "app" }',
			'node_modules/@pierre/diffs/package.json': JSON.stringify({
				version: '1.6.1',
				exports: {
					'.': './dist/index.js',
					'./react': './dist/react/index.js',
					'./worker': './dist/worker/index.js',
				},
				peerDependencies: { react: '^18.3.1 || ^19.0.0', 'react-dom': '^18.3.1 || ^19.0.0' },
				peerDependenciesMeta: { react: { optional: true }, 'react-dom': { optional: true } },
			}),
			'src/DiffWorkerPoolProvider.tsx':
				"import { WorkerPoolContext, useWorkerPool } from '@pierre/diffs/react';\nimport { WorkerPoolManager } from '@pierre/diffs/worker';\nimport type { ReactNode } from 'react';\n\nexport function DiffWorkerPoolProvider({ children }: { children: ReactNode }) {\n\tconst workerPool = useWorkerPool();\n\treturn <WorkerPoolContext value={workerPool}>{children}</WorkerPoolContext>;\n}\nexport type { WorkerPoolManager };\n",
			'src/StyledDiffCodeView.tsx':
				"import { CodeView, type CodeViewHandle, type CodeViewProps } from '@pierre/diffs/react';\nimport type { Ref } from 'react';\n\nexport function StyledDiffCodeView(props: CodeViewProps<undefined, undefined> & { viewerRef?: Ref<CodeViewHandle<undefined, undefined>> }) {\n\tconst { viewerRef, ...rest } = props;\n\treturn <CodeView {...rest} ref={viewerRef} />;\n}\n",
			'src/GuideExcerpt.tsx':
				"import { type FileDiffMetadata, parseDiffFromFile } from '@pierre/diffs';\nimport { FileDiff } from '@pierre/diffs/react';\n\nexport function GuideExcerpt({ fileDiff }: { fileDiff: FileDiffMetadata }) {\n\treturn <FileDiff fileDiff={fileDiff} options={{ diffStyle: 'unified' }} />;\n}\nexport { parseDiffFromFile };\n",
			'src/types.ts':
				"import type { CodeViewAnnotationArgs, CodeViewDiffItem } from '@pierre/diffs/react';\nexport type Args = CodeViewAnnotationArgs<string>;\nexport type Item = CodeViewDiffItem<string>;\n",
		});
		const result = await runCodemod([root], { write: false });
		const code = (/** @type {string} */ name) => result.files.find((f) => f.file === name)?.code;
		expect(result.missing).toEqual([]);
		expect(result.packages).toEqual([
			{ from: '@pierre/diffs/react', to: '@octanejs/pierre-diffs' },
		]);
		expect(code('src/DiffWorkerPoolProvider.tsx')).toContain(
			"import { WorkerPoolContext, useWorkerPool } from '@octanejs/pierre-diffs';",
		);
		expect(code('src/DiffWorkerPoolProvider.tsx')).toContain(
			"import { WorkerPoolManager } from '@pierre/diffs/worker';",
		);
		expect(code('src/StyledDiffCodeView.tsx')).toContain(
			"import { CodeView, type CodeViewHandle, type CodeViewProps } from '@octanejs/pierre-diffs';",
		);
		expect(code('src/GuideExcerpt.tsx')).toContain(
			"import { FileDiff } from '@octanejs/pierre-diffs';",
		);
		expect(code('src/GuideExcerpt.tsx')).toContain(
			"import { type FileDiffMetadata, parseDiffFromFile } from '@pierre/diffs';",
		);
		expect(code('src/types.ts')).toContain(
			"import type { CodeViewAnnotationArgs, CodeViewDiffItem } from '@octanejs/pierre-diffs';",
		);
		for (const file of result.files) {
			expect(file.code).not.toContain("'@pierre/diffs/react'");
			expect(file.code).not.toMatch(/ReactCompat|octane\/react/);
			expect(file.diagnostics.filter((diagnostic) => diagnostic.rule === 'bindings')).toEqual([]);
		}
	});

	it('keeps an automatically hosted React child inside its paragraph in server HTML', async () => {
		const root = project({
			'package.json': '{"type":"module"}',
			'src/App.tsx': `import React, { Fragment as Group } from 'react';
				import { Badge } from 'react-badge-kit';
				export function App() { return <p>Before <Badge /> after.</p>; }
				export function Conditional({ enabled }: { enabled: boolean }) {
					return <>
						<p id="conditional">Before {enabled ? (<><Badge /></>) : null} after.</p>
						<p id="logical">Before {enabled && <Badge />} after.</p>
						<p id="named">Before {enabled ? <Group key="stable"><Badge /></Group> : null} after.</p>
						<p id="qualified">Before <React.Fragment><Badge /></React.Fragment> after.</p>
					</>;
				}
				export function Panel() { return <section><Badge /></section>; }`,
		});
		const modules = path.join(root, 'node_modules');
		fs.mkdirSync(modules);
		for (const name of ['octane', 'react', 'react-dom'])
			fs.symlinkSync(
				fs.realpathSync(path.join(import.meta.dirname, '../node_modules', name)),
				path.join(modules, name),
				'dir',
			);
		const file = path.join(root, 'src/App.tsx');
		const [migrated] = (await runCodemod([file], { root, write: false, strong: true })).files;
		expect(
			[...migrated.notes, ...migrated.diagnostics].filter((n) => n.severity === 'error'),
		).toEqual([]);
		const { App, Conditional, Panel } = loadCompiledFixtureSource(migrated.code, {
			id: 'App.tsrx',
			mode: 'server',
			runtimeModules: {
				'octane/react/server': ReactServerBridge,
				'react-badge-kit': { Badge: () => reactElement('b', null, 'badge') },
			},
		});
		const { html } = await prerender(App, {});
		const conditional = await prerender(Conditional, { enabled: true });
		const panel = await prerender(Panel, {});
		const dom = new JSDOM(html + conditional.html + panel.html);
		try {
			const { document } = dom.window;
			expect(document.querySelector('p')?.textContent).toBe('Before badge after.');
			expect(document.querySelector('p > span[data-react-compat] > b')?.textContent).toBe('badge');
			expect(document.querySelector('#conditional')?.textContent).toBe('Before badge after.');
			expect(
				document.querySelector('#conditional > span[data-react-compat] > b')?.textContent,
			).toBe('badge');
			expect(document.querySelector('#logical')?.textContent).toBe('Before badge after.');
			expect(document.querySelector('#named')?.textContent).toBe('Before badge after.');
			expect(document.querySelector('#qualified')?.textContent).toBe('Before badge after.');
			expect(document.querySelector('section > div[data-react-compat] > b')?.textContent).toBe(
				'badge',
			);
		} finally {
			dom.window.close();
		}

		// A compiler with inline lowering does not prove this issuer can import the host.
		const config = path.join(root, 'tsconfig.json');
		fs.writeFileSync(
			config,
			'{"compilerOptions":{"moduleResolution":"bundler","paths":{"octane/react/server":["./server.ts"]}}}',
		);
		fs.writeFileSync(path.join(root, 'server.ts'), 'export {};');
		const preview = async () =>
			(await runCodemod([file], { root, write: false, target: 'tsx' })).files[0];
		const unavailable = expect.objectContaining({
			severity: 'error',
			message: expect.stringContaining('ReactCompatInline'),
		});
		const aliased = await preview();
		expect(aliased.notes).toContainEqual(unavailable);
		fs.writeFileSync(file, aliased.code);
		const retry = await preview();
		expect(retry.notes).toContainEqual(unavailable);
		expect(retry.code).toBe(aliased.code);

		fs.rmSync(config);
		const nested = path.join(path.dirname(file), 'tsconfig.json');
		fs.writeFileSync(
			nested,
			'{"compilerOptions":{"moduleResolution":"bundler","paths":{"octane/react/server":["../server.ts"]}}}',
		);
		expect((await preview()).notes).toContainEqual(unavailable);
		fs.rmSync(nested);
		const upgraded = await preview();
		expect(upgraded.notes.filter((n) => n.severity === 'error')).toEqual([]);
		expect(upgraded.code).toMatch(/<p>Before <ReactCompatInline><Badge\s*\/>/);
		fs.writeFileSync(file, upgraded.code);
		expect((await preview()).code).toBe(upgraded.code);
	});

	it('verifies both runtime conditions of the published inline React host', async () => {
		const octane = 'node_modules/octane';
		const manifest = JSON.parse(
			fs.readFileSync(path.join(REPO, 'packages/octane/package.json'), 'utf8'),
		);
		const exports = manifest.publishConfig.exports;
		const compilerUrl = pathToFileURL(
			path.join(REPO, 'packages/octane/src/compiler/index.js'),
		).href;
		const files = {
			'package.json': '{"type":"module"}',
			'App.tsx':
				"import { Badge } from 'react-badge-kit'; export function App() { return <p><Badge /></p>; }",
			[octane + '/package.json']: JSON.stringify({
				name: 'octane',
				type: 'module',
				version: manifest.version,
				exports: Object.fromEntries(
					['./compiler', './react', './react/server'].map((name) => [name, exports[name]]),
				),
			}),
			[path.join(octane, exports['./compiler'].default)]:
				`export { collectDiagnostics } from ${JSON.stringify(compilerUrl)};`,
		};
		for (const name of ['./react', './react/server']) {
			const types = path.join(octane, exports[name].types);
			files[types] = "export { ReactCompatInline } from './inline.js';";
			files[path.join(path.dirname(types), 'inline.d.ts')] =
				'export declare const ReactCompatInline: unknown;';
			for (const condition of ['node', 'default'])
				files[path.join(octane, exports[name][condition])] =
					'const ReactCompatInline = null; export { ReactCompatInline };';
		}
		const root = project(files);
		for (const name of ['react', 'react-dom'])
			fs.symlinkSync(
				fs.realpathSync(path.join(import.meta.dirname, '../node_modules', name)),
				path.join(root, 'node_modules', name),
				'dir',
			);
		const preview = async () =>
			(await runCodemod([path.join(root, 'App.tsx')], { root, write: false, strong: true }))
				.files[0];
		const result = await preview();
		expect([...result.notes, ...result.diagnostics].filter((n) => n.severity === 'error')).toEqual(
			[],
		);
		expect(result.code).toMatch(/<ReactCompatInline><Badge\s*\/>/);

		const unavailable = expect.objectContaining({
			severity: 'error',
			message: expect.stringContaining('ReactCompatInline'),
		});
		for (const [name, condition] of [
			['./react', 'default'],
			['./react/server', 'node'],
			['./react', 'types'],
		]) {
			const entry = path.join(root, octane, exports[name][condition]);
			fs.writeFileSync(entry, 'export {};');
			expect((await preview()).notes).toContainEqual(unavailable);
			fs.writeFileSync(entry, files[path.relative(root, entry)]);
		}
	});

	it('requires the same Octane compiler at the React island issuer', async () => {
		const issuer = 'src/node_modules/octane';
		const other = issuer + '/node_modules/octane';
		const manifest = { name: 'octane', version: '0.16.7', type: 'module' };
		const exports = { './compiler': './compiler.js' };
		const compilerUrl = pathToFileURL(
			path.join(REPO, 'packages/octane/src/compiler/index.js'),
		).href;
		const compiler = `export { collectDiagnostics } from ${JSON.stringify(compilerUrl)};`;
		const inline = "export { ReactCompatInline } from './inline.js';";
		const root = project({
			'package.json': '{"type":"module"}',
			'src/App.tsx':
				"import { Badge } from 'react-badge-kit'; export function App() { return <p><Badge /></p>; }",
			[issuer + '/package.json']: JSON.stringify({
				...manifest,
				exports: { ...exports, './react': './react.ts', './react/server': './server.ts' },
			}),
			[other + '/package.json']: JSON.stringify({ ...manifest, exports }),
			[issuer + '/compiler.js']: compiler,
			[other + '/compiler.js']: compiler,
			[issuer + '/react.ts']: inline,
			[issuer + '/server.ts']: inline,
			[issuer + '/inline.js']: 'export const ReactCompatInline = null;',
		});
		const modules = path.join(root, 'node_modules');
		fs.mkdirSync(modules);
		fs.symlinkSync(path.join(root, other), path.join(modules, 'octane'), 'dir');
		for (const name of ['react', 'react-dom'])
			fs.symlinkSync(
				fs.realpathSync(path.join(import.meta.dirname, '../node_modules', name)),
				path.join(modules, name),
				'dir',
			);
		const result = await runCodemod([path.join(root, 'src/App.tsx')], {
			root,
			write: false,
			strong: true,
		});
		expect(result.compiler).toBe(fs.realpathSync(path.join(root, other, 'compiler.js')));
		expect(result.files[0].notes).toContainEqual(
			expect.objectContaining({
				severity: 'error',
				message: expect.stringContaining('ReactCompatInline'),
			}),
		);
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

	it('migrates a static template without reading its dependency types', async () => {
		const root = project({
			'package.json': '{}',
			'tsconfig.json': '{ "compilerOptions": { "moduleResolution": "bundler", "strict": true } }',
			'node_modules/palette/index.d.ts': 'export declare const accent: string;',
			'Badge.tsx':
				"import { accent } from 'palette';\nexport function Badge() { return <span title={accent} />; }",
		});
		const reads = vi.spyOn(ts.sys, 'readFile');
		try {
			const result = await runCodemod([path.join(root, 'Badge.tsx')], { write: false });
			expect(result.files[0].output).toBe('Badge.tsrx');
			expect(result.files[0].diagnostics).toEqual([]);
			expect(reads.mock.calls.some(([name]) => name.endsWith('/palette/index.d.ts'))).toBe(false);
		} finally {
			reads.mockRestore();
		}
	});

	it('lowers text and boolean guards through imported types under strictNullChecks', async () => {
		const files = {
			'package.json': '{ "name": "app" }',
			'src/types.ts':
				'export interface Story { title: string; score: number; by?: string; pinned?: boolean }\n',
			'src/Story.tsx':
				"import type { Story } from './types.js';\nexport function Row({ story, expanded }: { story: Story; expanded?: boolean }) {\n\treturn <p>{story.title} {story.score} {story.by}{story.pinned && <b>Pinned</b>}{expanded && <i>Details</i>}</p>;\n}\n",
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
			'<p>{story.title as string} {String(story.score)} {story.by}@if (story.pinned) { <b>Pinned</b> }@if (expanded) { <i>Details</i> }</p>',
		);
		expect(await code(loose)).toContain(
			'<p>{story.title} {story.score} {story.by}{story.pinned && <b>Pinned</b>}{expanded && <i>Details</i>}</p>',
		);
		const result = spawnSync(
			process.execPath,
			[
				path.join(REPO, 'packages/codemod/dist/bin.js'),
				path.join(strict, 'src/Story.tsx'),
				'--no-project-types',
				'--strong',
				'--print',
				'--json',
			],
			{ encoding: 'utf8' },
		);
		expect(result.status).toBe(0);
		const [local] = JSON.parse(result.stdout).files;
		expect(local.strong).toBe(true);
		expect(local.code).toContain(
			'<p>{story.title} {story.score} {story.by}{story.pinned && <b>Pinned</b>}@if (expanded) { <i>Details</i> }</p>',
		);
	});

	it('reports when migrating a text change capture would reorder an input handler', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx", "strict": true } }',
			'Field.tsx': `export function Field({ record, rest }: { record: (label: string, value: string) => void; rest: { title?: string } }) {
	const input = (event: { currentTarget: { value: string } }) => record('input', event.currentTarget.value);
	const change = (event: { currentTarget: { value: string } }) => record('change', event.currentTarget.value);
	return <div>
		<input id="text" type="text" onInput={input} onChangeCapture={change} />
		<textarea id="textarea" onInput={input} onChangeCapture={change} />
		<input id="inverse" onInputCapture={input} onChange={change} />
		<input id="same-phase" onInputCapture={input} onChangeCapture={change} />
		<input id="checkable" type="checkbox" onInput={input} onChangeCapture={change} />
		<input id="single" onChangeCapture={change} />
		<input id="spread" onInput={input} onChangeCapture={change} {...rest} />
		<input id="absent" onInput={void 0} onChangeCapture={change} />
		<input id="global-undefined" onInput={undefined} onChangeCapture={change} />
		<input id="absent-change" onInput={input} onChangeCapture={null} />
		<input id="duplicate-input" onInput={input} onInput={void 0} onChangeCapture={change} />
		<input id="duplicate-capture" onInput={input} onChangeCapture={change} onChangeCapture={void 0} />
	</div>;
}`,
		});
		const [file] = (await runCodemod([root], { root, strong: true, write: false })).files;
		expect(file.strong).toBe(true);
		const changeNotes = file.notes.filter((note) => note.rule === 'native-text-change');
		expect(changeNotes.map(({ severity, message }) => [severity, message])).toEqual([
			['warning', expect.stringContaining('callback order')],
			['warning', expect.stringContaining('callback order')],
			['warning', expect.stringContaining('fires on commit')],
		]);
		expect(file.code).toContain('id="text" type="text" onInput={input} onChangeCapture={change}');
		expect(file.code).toContain('id="textarea" onInput={input} onChangeCapture={change}');
		expect(file.code).toContain('id="inverse" onInputCapture={input} onInput={change}');
		expect(file.code).toContain('id="same-phase" onInputCapture={input} onChangeCapture={change}');
		expect(file.code).toContain(
			'id="checkable" type="checkbox" onInput={input} onChangeCapture={change}',
		);
		expect(file.code).toContain('id="single" onInputCapture={change}');
		expect(file.code).toContain('id="spread" onInput={input} onInputCapture={change} {...rest}');
		expect(file.code).toContain('id="absent" onInput={void 0} onInputCapture={change}');
		expect(file.code).toContain(
			'id="global-undefined" onInput={undefined} onInputCapture={change}',
		);
		expect(file.code).toContain('id="absent-change" onInput={input} onInputCapture={null}');
		expect(file.code).toContain(
			'id="duplicate-input" onInput={input} onInput={void 0} onInputCapture={change}',
		);
		expect(file.code).toContain(
			'id="duplicate-capture" onInput={input} onInputCapture={change} onInputCapture={void 0}',
		);
	});

	it('warns when an input handler shadows the global undefined value', async () => {
		const root = project({
			'package.json': '{ "name": "app" }',
			'Field.tsx': `export function Field({ input }: { input: () => void }) {
	const undefined = input;
	return <input onInput={undefined} onChangeCapture={input} />;
}`,
		});
		const [file] = (await runCodemod([root], { root, write: false })).files;
		expect(file.notes).toContainEqual(
			expect.objectContaining({
				rule: 'native-text-change',
				severity: 'warning',
				message: expect.stringContaining('callback order'),
			}),
		);
		expect(file.code).toContain('onInput={undefined} onChangeCapture={input}');
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
			'src/Form.tsx': [
				// React 19.2 types name the target too: `ChangeEvent<CurrentTarget, Target>`.
				'interface ChangeEvent<C, T> { target: T; currentTarget: C }',
				'interface FocusEvent<C, R> { target: C; currentTarget: C; relatedTarget: R }',
				// Base UI wraps the event its controls pass on.
				'type BaseUIEvent<E> = E & { preventBaseUIHandler(): void };',
				'function Input(_: { onChange(e: ChangeEvent<HTMLInputElement, HTMLInputElement>): void }) {',
				'\treturn <input />;',
				'}',
				'function Field(_: {',
				'\tonChange(e: BaseUIEvent<ChangeEvent<HTMLInputElement, HTMLInputElement>>): void;',
				'\tonBlur(e: FocusEvent<HTMLTextAreaElement, Element>): void;',
				'}) {',
				'\treturn <textarea />;',
				'}',
				// A form hears changes from every control in it.
				'function Group(_: { onChange(e: ChangeEvent<HTMLFormElement, HTMLInputElement>): void }) {',
				'\treturn <form />;',
				'}',
				'export function Form({ set }: { set(v: string): void }) {',
				'\treturn (',
				'\t\t<>',
				'\t\t\t<Input onChange={(e) => set(e.target.value)} />',
				'\t\t\t<Field onChange={(e) => set(e.target.value)} onBlur={(e) => set(e.target.value)} />',
				'\t\t\t<Group onChange={(e) => set(e.target.value)} />',
				'\t\t</>',
				'\t);',
				'}',
				'',
			].join('\n'),
		});
		const [file] = (await runCodemod([root], { write: false })).files;
		expect(file.code).toContain('<Input onChange={(e) => set(e.currentTarget.value)} />');
		expect(file.code).toContain(
			'<Field onChange={(e) => set(e.currentTarget.value)} onBlur={(e) => set(e.currentTarget.value)} />',
		);
		expect(file.code).toContain('<Group onChange={(e) => set(e.target.value)} />');
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
		// Raw HTML, opaque map dispatch, and observable row-key order need review.
		expect([...blockers].sort()).toEqual(['OCTANE_STRONG_MAP_JSX', 'OCTANE_STRONG_UNTRUSTED_HTML']);
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
			'StoryRow.tsrx',
			'entry-client.tsrx',
			'entry-server.tsrx',
		]);
	}, 30_000);
});

describe('scoped signal recipe', () => {
	const sources = {
		'package.json': JSON.stringify({
			type: 'module',
			imports: { '#state': './state.js', '#owner': './owner.js', '#adapter': './adapter.js' },
		}),
		'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'nodenext', allowJs: true } }),
		'owner.js': 'export const Space = {current: null};',
		'state.js': 'export const useScope = space => space.current;',
		'adapter.js': [
			"import { Space } from '#owner';",
			'export function register(key, initial) {',
			'  const cells = new WeakMap();',
			'  function cell(owner) {',
			'    if (!cells.has(owner)) cells.set(owner, owner.signal$(key, initial()));',
			'    return cells.get(owner);',
			'  }',
			'  return {get: owner => cell(owner).get(), set: (owner, update) => cell(owner).set(update)};',
			'}',
			'export const currentValue = slot => slot.get(Space.current);',
		].join('\n'),
		'color.ts': [
			"import { signal as define } from '#state';",
			"import { Space as Region } from '#owner';",
			'export const color = define(Region, (): string | undefined => undefined);',
		].join('\n'),
		'controls.ts': [
			"import { color as selection } from './color.ts';",
			"import { useScope, useSignal as read } from '#state';",
			"import { Space } from '#owner';",
			'export function controls() {',
			'  const owner = useScope(Space);',
			'  return {choose: value => owner.set(selection, value), peek: () => owner.get(selection), active: () => read(selection)};',
			'}',
		].join('\n'),
	};
	const digest = (source) => createHash('sha256').update(source).digest('hex');
	const config = {
		reviewedAccess: { 'controls.ts': digest(sources['controls.ts']) },
		sourceModule: '#state',
		scope: { module: '#owner', name: 'Space' },
		factory: { module: '#adapter', name: 'register' },
		reader: { module: '#adapter', name: 'currentValue' },
	};
	it('previews, migrates and reruns an aliased producer and its scoped readers and writers', async () => {
		const root = project(sources);
		const bin = path.join(REPO, 'packages/codemod/dist/bin.js');
		fs.writeFileSync(
			path.join(root, 'recipe.mjs'),
			'import {createScopedSignalRecipe} from ' +
				JSON.stringify(path.join(REPO, 'packages/codemod/dist/index.js')) +
				';\n' +
				'export const runCodemod = createScopedSignalRecipe(' +
				JSON.stringify({
					...config,
					sourceRoot: root,
					tsconfig: path.join(root, 'tsconfig.json'),
				}) +
				');',
		);
		const run = (...flags) =>
			JSON.parse(
				execFileSync(
					process.execPath,
					[bin, '--recipe', './recipe.mjs', 'color.ts', '--json', ...flags],
					{ cwd: root, encoding: 'utf8' },
				),
			);
		expect(
			run('--print')
				.files.filter((f) => f.changed)
				.map((f) => f.file)
				.sort(),
		).toEqual(['color.ts', 'controls.ts']);
		expect(fs.readFileSync(path.join(root, 'color.ts'), 'utf8')).toBe(sources['color.ts']);
		run();
		expect(run('--dry-run').files.some((f) => f.changed)).toBe(false);
		const { createScope } = await import('octane/signals');
		const { Space } = await import(path.join(root, 'owner.js'));
		const { controls } = await import(path.join(root, 'controls.ts'));
		const first = createScope({ scopeKey: 'one' });
		const second = createScope({ scopeKey: 'two' });
		try {
			Space.current = first;
			const a = controls();
			expect(a.active()).toBeUndefined();
			a.choose('blue');
			expect(a.peek()).toBe('blue');
			expect(a.active()).toBe('blue');
			Space.current = second;
			expect(controls().active()).toBeUndefined();
			a.choose(undefined);
			expect(a.peek()).toBeUndefined();
		} finally {
			first.dispose();
			second.dispose();
		}
	});

	it.each([
		['register', 'currentValue'],
		['defineNative', 'readNative'],
	])('reuses the existing adapter imports %s and %s', async (factory, reader) => {
		const named = (name, local) => (name === local ? name : name + ' as ' + local);
		const color =
			`import { ${named('register', factory)} } from '#adapter';\n` + sources['color.ts'];
		const controls =
			`import { ${named('currentValue', reader)} } from '#adapter';\n` +
			sources['controls.ts'] +
			`\nexport function unrelated(${reader}) { return ${reader}; }`;
		const root = project({ ...sources, 'color.ts': color, 'controls.ts': controls });
		const migrate = createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
			reviewedAccess: { 'controls.ts': digest(controls) },
		});
		const paths = [path.join(root, 'color.ts')];
		const { files } = await migrate(paths);
		expect(files.flatMap((f) => f.notes)).toEqual([]);
		for (const [file, call] of [
			['color.ts', factory + '("color.ts:color"'],
			['controls.ts', reader + '(selection)'],
		]) {
			const code = fs.readFileSync(path.join(root, file), 'utf8');
			expect(code).toContain(call);
			expect(code.match(/from ['"]#adapter['"]/g)).toHaveLength(1);
		}
		expect((await migrate(paths)).files.every((f) => !f.changed && !f.notes.length)).toBe(true);
	});

	it.each([
		[
			'a shadowed destination alias',
			"import {currentValue as current} from '#adapter';",
			'current',
		],
		[
			'a colliding destination alias',
			"import {currentValue as current} from '#adapter'; import {other as current} from '#state';",
			'',
		],
		[
			'multiple destination aliases',
			"import {currentValue as a, currentValue as b} from '#adapter';",
			'',
		],
		['a type-only destination', "import type {currentValue} from '#adapter';", ''],
		['a conflicting import', "import {other as currentValue} from '#state';", ''],
	])('rejects %s without a partial migration', async (_, imports, parameter) => {
		const controls =
			imports + '\n' + sources['controls.ts'].replace('controls()', 'controls(' + parameter + ')');
		const root = project({ ...sources, 'controls.ts': controls });
		const result = await createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
			reviewedAccess: { 'controls.ts': digest(controls) },
		})([path.join(root, 'color.ts')]);
		expect(result.files.flatMap((f) => f.notes)).toContainEqual(
			expect.objectContaining({ severity: 'error' }),
		);
		expect(fs.readFileSync(path.join(root, 'color.ts'), 'utf8')).toBe(sources['color.ts']);
		expect(fs.readFileSync(path.join(root, 'controls.ts'), 'utf8')).toBe(controls);
	});

	it('preserves the UTF-8 BOM in previews, writes, review hashes, and reruns', async () => {
		const originals = {
			'color.ts': '\uFEFF' + sources['color.ts'],
			'controls.ts': '\uFEFF' + sources['controls.ts'],
		};
		const root = project({ ...sources, ...originals });
		const paths = [path.join(root, 'color.ts')];
		const migrate = createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
			reviewedAccess: { 'controls.ts': digest(originals['controls.ts']) },
		});
		const preview = await migrate(paths, { write: false });
		expect(preview.files.flatMap((f) => f.notes)).toEqual([]);
		expect(preview.files.map((f) => f.file).sort()).toEqual(Object.keys(originals).sort());
		for (const { file, code } of preview.files) {
			expect(code).toMatch(/^\uFEFFimport /);
			expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(originals[file]);
		}
		expect((await migrate(paths)).files).toEqual(preview.files);
		for (const { file, code } of preview.files)
			expect(fs.readFileSync(path.join(root, file))).toEqual(Buffer.from(code));
		expect((await migrate(paths)).files.every((f) => !f.changed && !f.notes.length)).toBe(true);
	});

	it.each([
		['an escaped signal', 'export const values = {selection};'],
		['a CommonJS namespace read', "module.require('./color.ts').color;"],
		[
			'a local alias shadowing the destination',
			'function other(currentValue) { return currentValue; }',
		],
		['a dynamic reference', "void import('./color.ts');"],
		[
			'a source-library transaction',
			"import {batch} from '#state'; function perform(){const s=useScope(Space); batch(() => s.set(selection, 1));}",
		],
		['a re-export', "export {color} from './color.ts';"],
		['a namespace import', "import * as all from './color.ts';"],
		['a different receiver', 'function update(owner) { owner.set(selection, 2); }'],
		['a selector reader', 'function useColor() { return read(selection, x => x); }'],
		['an optional call', 'function update(owner) { owner?.set(selection, 2); }'],
	])('reports %s before writing any file', async (_, addition) => {
		const root = project({ ...sources, 'controls.ts': sources['controls.ts'] + '\n' + addition });
		const migrate = createScopedSignalRecipe({
			...config,
			reviewedAccess: { 'controls.ts': digest(sources['controls.ts'] + '\n' + addition) },
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
		});
		const result = await migrate([path.join(root, 'color.ts')]);
		expect(result.files.flatMap((f) => f.notes)).toContainEqual(
			expect.objectContaining({ severity: 'error' }),
		);
		expect(fs.readFileSync(path.join(root, 'color.ts'), 'utf8')).toBe(sources['color.ts']);
	});

	it.each([
		['shadowed undefined', 'const undefined = 3;\n', 'zero-argument factory'],
		['a different declaring scope', "import {Other} from '#owner';\n", 'declaring scope'],
	])('rejects %s before touching consumers', async (label, prefix, message) => {
		let code = prefix + sources['color.ts'];
		if (label === 'a different declaring scope')
			code = code.replace('define(Region', 'define(Other');
		const root = project({ ...sources, 'color.ts': code });
		const result = await createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
		})([path.join(root, 'color.ts')]);
		expect(
			result.files
				.flatMap((f) => f.notes)
				.map((n) => n.message)
				.join(),
		).toContain(message);
		expect(fs.readFileSync(path.join(root, 'controls.ts'), 'utf8')).toBe(sources['controls.ts']);
	});

	it('requires a review of the current imperative consumer and its callers', async () => {
		const root = project({ ...sources, 'controls.ts': sources['controls.ts'] + '\n// edited' });
		const result = await createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
		})([path.join(root, 'color.ts')]);
		expect(
			result.files
				.flatMap((f) => f.notes)
				.map((n) => n.message)
				.join(),
		).toContain('Review the imperative accesses in controls.ts');
		expect(fs.readFileSync(path.join(root, 'color.ts'), 'utf8')).toBe(sources['color.ts']);
	});

	it('checks a reference discovered only through CommonJS', async () => {
		const root = project({
			...sources,
			'plugin.cjs': "exports.run = () => module.require('./color.ts').color;",
		});
		const result = await createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
		})([path.join(root, 'color.ts')]);
		expect(
			result.files
				.flatMap((f) => f.notes)
				.map((n) => n.message)
				.join(),
		).toContain('plugin.cjs');
		expect(fs.readFileSync(path.join(root, 'controls.ts'), 'utf8')).toBe(sources['controls.ts']);
	});

	it('finds a producer reachable through only one conditional export', async () => {
		const manifest = {
			...JSON.parse(sources['package.json']),
			name: 'palette-demo',
			exports: { './color': { import: './color.ts', require: './other.cts' } },
		};
		const root = project({
			...sources,
			'package.json': JSON.stringify(manifest),
			'other.cts': 'export const color = 0;',
			'caller.mts': "export {color} from 'palette-demo/color';",
		});
		const result = await createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
		})([path.join(root, 'color.ts')]);
		expect(
			result.files
				.flatMap((f) => f.notes)
				.map((n) => n.message)
				.join(),
		).toContain('mode-dependent producer import');
		expect(fs.readFileSync(path.join(root, 'color.ts'), 'utf8')).toBe(sources['color.ts']);
	});

	it('distinguishes identically spelled imports from different owner modules', async () => {
		const { ['controls.ts']: controls, ...other } = sources;
		const root = project({
			...other,
			'color.ts': other['color.ts'].replace('#owner', './owner.js'),
			'nested/owner.js': other['owner.js'],
			'nested/controls.ts': controls
				.replace('./color.ts', '../color.ts')
				.replace('#owner', './owner.js'),
		});
		const result = await createScopedSignalRecipe({
			...config,
			scope: { module: './owner.js', name: 'Space' },
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
		})([path.join(root, 'color.ts')]);
		expect(
			result.files
				.flatMap((f) => f.notes)
				.map((n) => n.message)
				.join(),
		).toContain('common module for ./owner.js');
	});

	it('refuses a consumer symlink pointing outside the source root', async () => {
		const root = project(sources);
		const external = project({ 'external.ts': sources['controls.ts'] });
		fs.symlinkSync(path.join(external, 'external.ts'), path.join(root, 'external.ts'));
		const result = await createScopedSignalRecipe({
			...config,
			sourceRoot: root,
			tsconfig: path.join(root, 'tsconfig.json'),
		})([path.join(root, 'color.ts')]);
		expect(
			result.files
				.flatMap((f) => f.notes)
				.map((n) => n.message)
				.join(),
		).toContain('symlinked consumer');
		expect(fs.readFileSync(path.join(external, 'external.ts'), 'utf8')).toBe(
			sources['controls.ts'],
		);
	});

	it('restores source files when a later replacement fails', async () => {
		const root = project(sources);
		const rename = fs.renameSync;
		const failure = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
			if (String(to).endsWith('controls.ts')) throw new Error('write failed');
			rename(from, to);
		});
		try {
			const result = await createScopedSignalRecipe({
				...config,
				sourceRoot: root,
				tsconfig: path.join(root, 'tsconfig.json'),
			})([path.join(root, 'color.ts')]);
			expect(result.files.flatMap((f) => f.notes).map((n) => n.message)).toContain('write failed');
			for (const [file, text] of Object.entries(sources))
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(text);
			expect(fs.readdirSync(root).sort()).toEqual(Object.keys(sources).sort());
		} finally {
			failure.mockRestore();
		}
	});
});

describe('React Intl project migration', () => {
	const opaqueFormatter = expect.objectContaining({
		rule: 'bindings',
		severity: 'error',
		message: expect.stringContaining('React Intl formatter'),
	});
	const localeCode = `import { useIntl as useLocale, FormattedMessage, type IntlShape, defineMessages } from 'react-intl';
export function Greeting({ count }: { count: number }) {
	const intl = useLocale();
	return <p title={intl.formatMessage({id: 'items'}, {count})}><FormattedMessage id="hello" /></p>;
}`;
	function setup(extra = {}) {
		const root = project({ 'package.json': '{}', 'src/Greeting.tsx': localeCode, ...extra });
		fs.mkdirSync(path.join(root, 'node_modules'));
		// These public peers share a single instance, as in the consuming application.
		for (const name of ['octane', 'react', 'react-dom', 'react-intl']) {
			const installed = fs.realpathSync(path.join(import.meta.dirname, '../node_modules', name));
			fs.symlinkSync(installed, path.join(root, 'node_modules', name), 'dir');
		}
		return root;
	}
	it.each([false, true])(
		'reports direct render-phase scalar formatters (projectTypes=%s)',
		async (projectTypes) => {
			const methods = {
				formatDate: '0',
				formatTime: '0',
				formatDateTimeRange: '0, 1',
				formatRelativeTime: `0, 'day'`,
				formatNumber: '12',
				formatPlural: '1',
				formatDisplayName: `'US', { type: 'region' }`,
			};
			const calls = Object.entries(methods).map(([method, args]) => `intl.${method}(${args})`);
			const [date, time, ...others] = calls;
			const number = `import {useIntl} from 'react-intl';
				export function View() { return <b>{useIntl().formatNumber(12)}</b>; }`;
			const root = setup({
				'tsconfig.json': JSON.stringify({
					compilerOptions: { jsx: 'react-jsx', moduleResolution: 'bundler' },
				}),
				'OtherFactory.tsx': '/** @jsxImportSource octane */\n' + number,
				'nested/View.tsx': number,
				'nested/tsconfig.json': JSON.stringify({
					compilerOptions: { jsx: 'react-jsx', paths: { 'react-intl': ['./intl-service.ts'] } },
				}),
				'nested/intl-service.ts': `export const useIntl = () => ({formatNumber: String});`,
				'Direct.tsx': `import {useIntl} from 'react-intl';
					export function Direct() {
						const intl = useIntl();
						const date = ${date};
						return <b title={${time}}>{date}${others.map((call) => `{${call}}`).join('')}</b>;
					}`,
				'Deferred.tsx': `import {useIntl} from 'react-intl';
					export function Deferred() {
						const intl = useIntl();
						return <button onClick={() => { ${calls.map((call) => `${call};`).join(' ')} }}>Later</button>;
					}`,
			});
			const types = path.join(root, 'node_modules/@types');
			fs.mkdirSync(types);
			fs.symlinkSync(
				path.join(REPO, 'packages/octane/node_modules/@types/react'),
				path.join(types, 'react'),
				'dir',
			);
			const { files } = await runCodemod(
				['Direct.tsx', 'Deferred.tsx', 'OtherFactory.tsx', 'nested/View.tsx'].map((f) =>
					path.join(root, f),
				),
				{
					root,
					strong: true,
					verify: true,
					write: false,
					projectTypes,
				},
			);
			const direct = files.find((f) => f.file === 'Direct.tsx');
			const deferred = files.find((f) => f.file === 'Deferred.tsx');
			expect(direct.notes.filter((n) => n.severity === 'error')).toEqual(
				Object.keys(methods).map((method) =>
					expect.objectContaining({
						rule: 'bindings',
						message: expect.stringContaining(`this ${method} call`),
					}),
				),
			);
			expect(deferred.notes.filter((n) => n.severity === 'error')).toEqual([]);
			for (const file of ['OtherFactory.tsx', 'nested/View.tsx']) {
				const result = files.find((f) => f.file === file);
				expect(result.notes).not.toContainEqual(
					expect.objectContaining({ message: expect.stringContaining('this formatNumber call') }),
				);
			}
			for (const selected of [direct, deferred])
				expect(selected.code).toContain('octane-react-intl.tsrx');
		},
	);
	it.each(['react-jsx', 'preserve'])(
		'reports ownership for a declarative formatter moved into the native adapter (jsx=%s)',
		async (jsx) => {
			const input = `import { FormattedMessage as Message } from 'react-intl';
				export function Text() { return <main><Message id="label" defaultMessage="Ready" /></main>; }`;
			const root = setup({
				'tsconfig.json': JSON.stringify({ compilerOptions: { jsx, moduleResolution: 'bundler' } }),
				'src/Text.tsx': input,
			});
			const { files } = await runCodemod([path.join(root, 'src/Text.tsx')], {
				root,
				strong: true,
				verify: true,
				write: false,
			});
			const text = files.find((file) => file.file === 'src/Text.tsx');
			expect(text.strong).toBe(true);
			expect(text.code).toContain("from './octane-react-intl.tsrx'");
			expect(text.notes.filter((note) => note.severity === 'error')).toEqual([opaqueFormatter]);
		},
	);
	it.each([false, true])(
		'reports opaque formatter ownership in native calls and generated rich islands (projectTypes=%s)',
		async (projectTypes) => {
			const direct = `import {useIntl} from 'react-intl'; export function Text() {
				const intl=useIntl(); return <p title={intl.formatMessage({id:'label',defaultMessage:'Ready'})}/>;
			}`;
			const rich = `import {FormattedMessage as Message} from 'react-intl'; export function Rich(){
				return <div><Message id="more" defaultMessage="Read <em>more</em>" values={{em: part => <em>{part}</em>}}/></div>;
			}`;
			const list = `import {FormattedList as List} from 'react-intl';
				export function Items(){ return <section><List value={['a', 'b']} /></section>; }`;
			const islands = ['Rich.tsx', 'List.tsx'];
			const names = ['Direct.tsx', 'Closed.tsx', ...islands];
			const root = setup({
				'Direct.tsx': direct,
				'Rich.tsx': rich,
				'List.tsx': list,
				'Closed.tsx': `import './setup'; import {IntlProvider} from 'react-intl';
					${direct.replace('export function Text', 'function Text')}
					export function Page(){return <IntlProvider locale="en"><Text/></IntlProvider>;}`,
				'setup.ts': `import {IntlProvider} from 'react-intl';
					IntlProvider.defaultProps = {...IntlProvider.defaultProps, messages: {label:'patched'}};`,
			});
			const result = await runCodemod(
				names.map((name) => path.join(root, name)),
				{ root, write: false, strong: true, projectTypes },
			);
			for (const name of names) {
				const file = result.files.find((f) => f.file === name);
				expect(file.notes.filter((d) => d.message.includes('React Intl formatter'))).toEqual([
					opaqueFormatter,
				]);
				expect(file.code).toContain(
					islands.includes(name) ? 'IntlBoundary' : 'intl.formatMessage(',
				);
			}
		},
	);
	it.each([false, true])(
		'keeps formatter ownership checks on the original React Intl package (nested: %s)',
		async (nested) => {
			const dir = nested ? 'src/' : '';
			const options = {
				baseUrl: '.',
				paths: { 'react-intl': ['./custom.ts'] },
				jsx: 'react-jsx',
				moduleResolution: 'bundler',
			};
			const root = setup({
				...(nested && { 'tsconfig.json': '{}' }),
				[dir + 'tsconfig.json']: JSON.stringify({
					...(nested && { extends: '../tsconfig.json' }),
					compilerOptions: options,
				}),
				[dir + 'custom.ts']: 'export function FormattedList() { return "custom"; }',
				[dir + 'View.tsx']: `import { FormattedList } from 'react-intl';
export function View() { return <section><FormattedList /></section>; }`,
			});
			const [file] = (
				await runCodemod([path.join(root, dir, 'View.tsx')], {
					root,
					write: false,
					strong: true,
					projectTypes: true,
				})
			).files;
			expect(file.code).toContain('ReactCompat');
			expect(file.code).not.toContain('IntlBoundary');
			expect(file.notes.filter((d) => d.message.includes('React Intl formatter'))).toEqual([]);
		},
	);
	it('keeps an Intl package export selected only by a nested runtime condition', async () => {
		const view = `import {useIntl} from 'react-intl';
export function View() { return <b>{useIntl().formatNumber(3)}</b>; }`;
		const root = setup({
			'tsconfig.json': JSON.stringify({
				compilerOptions: { jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler' },
			}),
			'src/conditional/tsconfig.json': JSON.stringify({
				extends: '../../tsconfig.json',
				compilerOptions: { customConditions: ['local-formatter'] },
			}),
			'src/ordinary/tsconfig.json': JSON.stringify({
				extends: '../../tsconfig.json',
				compilerOptions: { customConditions: ['unused-condition'] },
			}),
			'src/conditional/View.tsx': view,
			'src/ordinary/View.tsx': view,
		});
		const modules = path.join(root, 'node_modules');
		const intl = path.join(modules, 'react-intl');
		fs.renameSync(intl, path.join(modules, 'stock-intl'));
		fs.mkdirSync(intl);
		fs.writeFileSync(
			path.join(intl, 'package.json'),
			JSON.stringify({
				name: 'react-intl',
				version: '7.1.0',
				type: 'module',
				peerDependencies: { react: '^19.0.0' },
				exports: {
					'.': { types: './index.d.ts', 'local-formatter': './local.js', default: './index.js' },
					'./other': { 'unused-condition': './local.js', default: './index.js' },
				},
			}),
		);
		fs.writeFileSync(path.join(intl, 'index.d.ts'), "export * from 'stock-intl';");
		fs.writeFileSync(path.join(intl, 'index.js'), "export * from 'stock-intl';");
		fs.writeFileSync(
			path.join(intl, 'local.js'),
			"export function useIntl() { return {formatNumber: n => 'local:' + n}; }",
		);
		const names = ['src/conditional/View.tsx', 'src/ordinary/View.tsx'];
		const { files } = await runCodemod(
			names.map((file) => path.join(root, file)),
			{
				root,
				strong: true,
				write: false,
			},
		);
		const conditional = files.find((file) => file.file === names[0]);
		expect(conditional.code).toContain("from 'react-intl'");
		expect(conditional.notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
		expect(files.find((file) => file.file === names[1]).code).toContain('octane-react-intl.tsrx');

		// A condition in the adapter's config can change its runtime entry too.
		fs.writeFileSync(
			path.join(root, 'src/tsconfig.json'),
			JSON.stringify({
				extends: '../tsconfig.json',
				compilerOptions: { customConditions: ['local-formatter'] },
			}),
		);
		const [adapterConditional] = (
			await runCodemod([path.join(root, names[1])], { root, strong: true, write: false })
		).files;
		expect(adapterConditional.code).toContain("from 'react-intl'");
	});
	it('migrates a locale binding only below its own React Intl provider', async () => {
		const enclosed = `import {IntlProvider as Provider, useIntl} from 'react-intl';
			function Locale() { const { locale } = useIntl(); return <p lang={locale}/>; }
			export function Page() { return <Provider locale="fr"><Locale/></Provider>; }`;
		const direct = enclosed.replace('{ locale } = useIntl()', 'locale = useIntl().locale');
		const sources = {
			'src/Owned.tsx': enclosed,
			'src/OwnedMember.tsx': direct,
			'src/ExternalMember.tsx': direct.replace('function Locale', 'export function Locale'),
			'src/ReflectiveReceiver.tsx': `import {useIntl} from 'react-intl';
				export function Leaf() {
					const intl = useIntl();
					return <b title={intl.formatNumber(1)}>{eval('intl.locale')}</b>;
				}`,
			'src/ReflectiveHook.tsx': String.raw`import {useIntl} from 'react-intl';
				export function Leaf() {
					return <b title={useIntl().formatNumber(1)}>{\u0065val('useIntl().locale')}</b>;
				}`,
			'src/ExternalReceiver.tsx': `import {useIntl} from 'react-intl';
				export function Leaf() {
					const intl = useIntl();
					return <b title={intl.formatNumber(1)}>{intl.locale}</b>;
				}`,
			'src/Exported.tsx': enclosed.replace('function Locale', 'export function Locale'),
			'src/Escaped.tsx': enclosed + '\nexport {Locale as Consumer};',
			'src/Nested.tsx': enclosed
				.replace('Provider, useIntl', 'Provider, IntlContext, useIntl')
				.replace(
					'<p lang={locale}/>',
					'<IntlContext.Consumer>{() => <b lang={locale}/>}</IntlContext.Consumer>',
				),
			'src/Raw.tsx': enclosed
				.replace('IntlProvider as Provider', 'RawIntlProvider as Provider')
				.replace('Page()', 'Page({formatter})')
				.replace('locale="fr"', 'value={formatter}'),
			'src/Spread.tsx': enclosed
				.replace('Page()', 'Page({props})')
				.replace('locale="fr"', 'locale="fr" {...props}'),
			'src/Opaque.tsx': enclosed + '\nexport function Other() { consume(useIntl()); return <b/>; }',
			'src/Rest.tsx': enclosed.replace('{ locale }', '{ locale, ...rest }'),
			'src/Computed.tsx': enclosed.replace('{ locale }', "{ ['locale']: locale }"),
			'src/Default.tsx': enclosed.replace('{ locale }', '{ locale = fallback() }'),
			'src/Method.tsx': enclosed.replace('{ locale }', '{ formatMessage: locale }'),
		};
		const root = setup({
			...sources,
			'tsconfig.json': JSON.stringify({
				compilerOptions: { jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler' },
			}),
		});
		const { files } = await runCodemod(
			Object.keys(sources).map((file) => path.join(root, file)),
			{ root, write: false, strong: true, projectTypes: true },
		);
		for (const file of Object.keys(sources)) {
			const result = files.find((result) => result.file === file);
			const errors = [...result.notes, ...result.diagnostics].filter((d) => d.severity === 'error');
			if (file === 'src/Owned.tsx' || file === 'src/OwnedMember.tsx') {
				expect(result.strong).toBe(true);
				expect.soft(errors, file).toEqual([]);
			} else {
				expect.soft(errors, file).toContainEqual(
					expect.objectContaining({
						rule: 'bindings',
						message: expect.stringContaining('useIntl'),
					}),
				);
			}
		}
	});
	it('checks the actual selected component before forwarding a formatted attribute', async () => {
		const root = setup({
			'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@ui/*': ['./src/*'] } } }),
			'src/Field.tsx':
				'export function Field({busy, ...rest}) { return <input disabled={busy} {...rest}/>; }',
			'src/Greeting.tsx': `import {Field as Input} from '@ui/Field'; import {useIntl} from 'react-intl';
				const Heading = ({caption}) => <h1 title={caption}/>;
				export function Greeting() { const text = useIntl().formatMessage({id:'title'});
				return <div><Heading caption={text}/><Input placeholder={text}/></div>; }`,
		});
		const file = path.join(root, 'src/Greeting.tsx');
		const only = await runCodemod([file], {
			root,
			write: false,
			projectTypes: false,
			strong: true,
		});
		expect(only.files.find((f) => f.file === 'src/Greeting.tsx').notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
		const both = await runCodemod([file, path.join(root, 'src/Field.tsx')], {
			root,
			write: false,
			projectTypes: false,
			strong: true,
		});
		const page = both.files.find((f) => f.file === 'src/Greeting.tsx');
		expect(page.rules['react-intl']).toBe(1);
		expect([...page.notes, ...page.diagnostics].filter((d) => d.severity === 'error')).toEqual([
			opaqueFormatter,
		]);
	});
	it('follows a localized prop through one selected component into its returned input', async () => {
		const pages = {
			Greeting: `import {useIntl} from 'react-intl';import {Field} from './Field';
				export function Greeting(){return <Field caption={useIntl().formatMessage({id:'name'})}/>} `,
			Field: `import {Input} from './Input';
				export function Field({caption, show}){return <label>{show && <Input text={caption}/>}</label>}`,
			Input: `export function Input({text}) {return <input aria-label={text}/>}`,
		};
		for (const [expected, change] of [
			[true, {}],
			[
				false,
				{
					Field: pages.Field.replace('import {Input}', 'import {Input as widget}').replace(
						'<Input ',
						'<widget ',
					),
				},
			],
			[
				false,
				{
					Field: pages.Field.replace(
						'show && <Input text={caption}/>',
						'(show ? <Input text={caption}/> : null) as unknown as string',
					),
				},
			],
			[false, { Field: pages.Field.replace('function Field', 'async function Field') }],
			[false, { Input: pages.Input.replace('function Input', 'function* Input') }],
			[
				false,
				{
					Greeting: pages.Greeting.replace(
						"from './Field';",
						"from './Field' with { type: 'virtual' };",
					),
				},
			],
			[
				false,
				{
					Field: pages.Field.replace(
						'<Input text={caption}/>',
						'<Other><Input text={caption}/></Other>',
					),
				},
			],
			[false, { Field: pages.Field.replace('text={caption}', 'text={caption} {...props}') }],
			[
				false,
				{
					Input:
						'export function Input({text}) {const n=<input aria-label={text}/>;inspect(n.props);return n}',
				},
			],
			[
				false,
				{
					Input:
						'export function Input({text}) {useCustomHook();return <input aria-label={text}/>}',
				},
			],
			[
				false,
				{
					Greeting: pages.Greeting.replace('return <Field', 'const n=<Field').replace(
						'/>}',
						'/>;return inspect(n)}',
					),
				},
			],
		]) {
			const files = Object.fromEntries(
				Object.entries({ ...pages, ...change }).map(([name, source]) => [
					'src/' + name + '.tsx',
					source,
				]),
			);
			const root = setup(files);
			const { files: results } = await runCodemod(
				Object.keys(files).map((f) => path.join(root, f)),
				{ root, write: false, strong: true, projectTypes: false },
			);
			const page = results.find((f) => f.file === 'src/Greeting.tsx');
			const errors = page.notes.filter((n) => n.rule === 'bindings' && n.severity === 'error');
			if (expected) {
				expect(errors).toEqual([opaqueFormatter]);
				expect(page.rules['react-intl']).toBe(1);
			} else {
				expect(errors).toContainEqual(
					expect.objectContaining({ message: expect.stringContaining('is a React hook') }),
				);
			}
		}
	});
	it('defers a forwarded attribute when the caller resolves components in a nested project', async () => {
		const root = setup({
			'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@ui/*': ['./good/*'] } } }),
			'src/tsconfig.json': JSON.stringify({
				extends: '../tsconfig.json',
				compilerOptions: { paths: { '@ui/*': ['../other/*'] } },
			}),
			'src/Greeting.tsx': `import {useIntl} from 'react-intl';import {Field} from '@ui/Field';
				export function Greeting(){return <Field caption={useIntl().formatMessage({id:'name'})}/>} `,
			'good/Field.tsx':
				"import {Input} from './Input';export function Field({caption}){return <Input text={caption}/>}",
			'good/Input.tsx': 'export function Input({text}) {return <input aria-label={text}/>}',
			'other/Field.tsx': 'export function Field({caption}) { return <div>{caption}</div> }',
		});
		const { files } = await runCodemod([root], { root, write: false, strong: true });
		expect(files.find((f) => f.file === 'src/Greeting.tsx').notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	});
	it('keeps the formatter diagnostic when a JavaScript sibling could supply the component at runtime', async () => {
		const root = setup({
			'src/Field.tsx': 'export function Field({caption}) { return <div title={caption}/>; }',
			'src/Field.js': 'export function Field({caption}) { return caption; }',
			'src/Greeting.tsx': `import {Field} from './Field.js'; import {useIntl} from 'react-intl';
			export function Greeting(){return <Field caption={useIntl().formatMessage({id:'x'})}/>;}`,
		});
		const result = await runCodemod(
			['src/Greeting.tsx', 'src/Field.tsx'].map((f) => path.join(root, f)),
			{ root, write: false },
		);
		expect(result.files.find((f) => f.file === 'src/Greeting.tsx').notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
	});
	it('forwards a formatted fallback past unrelated prop reads to a native field', async () => {
		const root = setup({
			'src/Field.tsx': `export function Field({busy, ...props}) {
				if (props.disabled) return <div data-tone={props['tone']}><input {...props}/></div>;
				return <input disabled={busy} {...props}/>;
			}`,
			'src/Greeting.tsx': `import {Field} from './Field'; import {useIntl} from 'react-intl';
			export function Page() { const intl=useIntl(); return <Field placeholder={intl.formatMessage({id:'caption'}, {count: 2}) || 'Untitled'}/>; }`,
			'src/Getter.tsx': `
			import {Field} from './Field'; import {useIntl} from 'react-intl';
			Object.defineProperty(Object.prototype, 'disabled', {get(){ observe(this.placeholder); return true; }});
			export function Page() { return <Field placeholder={useIntl().formatMessage({id:'caption'})}/>; }`,
		});
		const { files } = await runCodemod(
			['src/Greeting.tsx', 'src/Getter.tsx', 'src/Field.tsx'].map((name) => path.join(root, name)),
			{ root, write: false, strong: true, projectTypes: false },
		);
		const page = files.find((f) => f.file === 'src/Greeting.tsx');
		expect(files.find((f) => f.file === 'src/Getter.tsx').notes).toContainEqual(
			expect.objectContaining({ rule: 'bindings', severity: 'error' }),
		);
		expect(page.rules['react-intl']).toBe(1);
		expect([...page.notes, ...page.diagnostics].filter((n) => n.severity === 'error')).toEqual([
			opaqueFormatter,
		]);
	});
	it('keeps the formatter diagnostic when a wrapper may observe or render its raw value', async () => {
		const wrappers = [
			'function Label({caption}) { return <div>{caption ?? "fallback"}</div>; }',
			'function Label({caption}) { inspect(caption); return <div title={caption}/>; }',
			'function Label({caption:safe,caption:live}) { return <div title={safe}>{live}</div>; }',
			'function Label({caption}) { return <div title={caption}>{caption}</div>; }',
			'function Label({caption}) { return <custom-field title={caption}/>; }',
			'function Label({caption}) { return <div is="custom-field" title={caption}/>; }',
			'function Label({caption}) { return <Other caption={caption}/>; }',
			'function Label(props) { const alias=props; return <div title={alias.caption}/>; }',
			'function Label(props) { props.caption = replace(); return <div title={props.caption}/>; }',
			'function Label({caption}) { observe(arguments[0]); return <div title={caption}/>; }',
			'function Label({caption}) { return <div title={caption}/>; } Label=other;',
			'function Label({caption}) { return <div title={caption}/>; } eval("Label=other");',
		];
		const bagWrappers = [
			`Object.defineProperty(Object.prototype, 'busy', {get(){ observe(this.title); return true; }});
			function Label(props) { if (props.busy) return null; return <input {...props}/>; }`,
			'function Label(props) { props.observe(); return <input {...props}/>; }',
			'function Label(props) { if (props.mode) observe(props); return <input {...props}/>; }',
			'function Label(props) { if (props[key]) return null; return <input {...props}/>; }',
			'function Label({...rest}) { return <div {...rest} title="overridden"/>; }',
			'function Label({...rest}) { return <div {...rest} {...unknown}/>; }',
		];
		const entries = Object.fromEntries(
			[
				...wrappers.map((wrapper) => [wrapper, 'caption']),
				...bagWrappers.map((wrapper) => [wrapper, 'title']),
			].map(([wrapper, prop], i) => [
				`src/Test${i}.tsx`,
				`import {useIntl} from 'react-intl'; ${wrapper}
			export function App(){const intl=useIntl(); return <Label ${prop}={intl.formatMessage({id:'message'}) ?? 'Untitled'}/>;}`,
			]),
		);
		for (const [i, props] of [
			'is="custom-div" title={intl.formatMessage({id:"x"})}',
			'{...unknown} title={intl.formatMessage({id:"x"})}',
			'title={intl.formatMessage(descriptor(<b/>))}',
			'title={intl.formatMessage({get id(){ inspect(<b/>); return "x"; }})}',
			'title={intl.formatMessage({id:"x"}, {bad: (<b/> as unknown as string)})}',
		].entries()) {
			entries[`src/Input${i}.tsx`] =
				`import {useIntl} from 'react-intl'; function Label({...rest}) { return <div {...rest}/>; }
			export function App() { const intl=useIntl(); return <Label ${props}/>; }`;
		}
		const root = setup(entries);
		const result = await runCodemod(
			Object.keys(entries).map((name) => path.join(root, name)),
			{ root, write: false, projectTypes: false },
		);
		for (const file of Object.keys(entries)) {
			const f = result.files.find((row) => row.file === file);
			expect(f.notes, f.file).toContainEqual(
				expect.objectContaining({ rule: 'bindings', severity: 'error' }),
			);
		}
	});
	it('previews and writes a single shared, compilable helper across separate migrations', async () => {
		const root = setup({
			'src/other/Provider.tsx': `import {IntlProvider} from 'react-intl';
export function Locale() { return <IntlProvider locale="en"><b>test</b></IntlProvider> }`,
		});
		const file = path.join(root, 'src/Greeting.tsx');
		const helper = path.join(root, 'src/octane-react-intl.tsrx');
		const preview = await runCodemod([file], {
			root,
			write: false,
			strong: true,
			projectTypes: false,
		});
		const result = preview.files.find((f) => f.file === 'src/Greeting.tsx');
		expect(result.strong).toBe(true);
		expect([...result.notes, ...result.diagnostics].filter((d) => d.severity === 'error')).toEqual([
			opaqueFormatter,
			opaqueFormatter,
		]);
		expect(result.code).toContain(
			"useIntl as useLocale, FormattedMessage } from './octane-react-intl.tsrx'",
		);
		expect(result.code).toContain("type IntlShape, defineMessages } from 'react-intl'");
		expect(preview.files.filter((f) => f.rules['react-intl-adapter'])).toHaveLength(1);
		expect(fs.existsSync(helper)).toBe(false);
		await runCodemod([file], { root, strong: true, projectTypes: false });
		const source = fs.readFileSync(helper, 'utf8');
		const next = await runCodemod([path.join(root, 'src/other/Provider.tsx')], {
			root,
			strong: true,
		});
		expect(next.files.some((f) => f.code.includes("'../octane-react-intl.tsrx'"))).toBe(true);
		expect(next.files.some((f) => f.rules['react-intl-adapter'])).toBe(false);
		expect(fs.readFileSync(helper, 'utf8')).toBe(source);
	});
	it('resolves React wrappers before planning component-owned Intl hooks', async () => {
		const root = setup({
			'src/Greeting.tsx': `import { useIntl } from 'react-intl';
import React, { memo as cached } from 'react';
export const Greeting = cached(() => { const intl = useIntl(); return <p title={intl.formatNumber(1)} />; });
export const Field = React.forwardRef((props, ref) => { const intl = useIntl(); return <input ref={ref} title={intl.formatNumber(1)} />; });`,
			'src/Other.tsx': `import {useIntl} from 'react-intl';
function memo(fn) { return fn; }
export const Other = memo(() => { const intl = useIntl(); return <p title={intl.formatNumber(1)} />; });`,
		});
		const { files } = await runCodemod([root], { root, write: false, strong: true });
		const wrapped = files.find((f) => f.file === 'src/Greeting.tsx');
		expect(wrapped.code).toContain("from './octane-react-intl.tsrx'");
		expect(
			[...wrapped.notes, ...wrapped.diagnostics].filter((n) => n.severity === 'error'),
		).toEqual([]);
		const other = files.find((f) => f.file === 'src/Other.tsx');
		expect(other.notes.some((n) => n.severity === 'error' && n.message.includes('useIntl'))).toBe(
			true,
		);
	});
	it('keeps a message inside an authored React island and flags JSX disguised as scalar substitutions', async () => {
		const root = setup({
			'src/Island.tsx': `import {ReactCompat as Island} from 'octane/react';
import {FormattedMessage} from 'react-intl';
export function Message({count}: {count: number}) { return <Island><FormattedMessage id="count" values={{count}} /></Island>; }`,
			'src/Unsafe.tsx': `import {FormattedMessage} from 'react-intl';
export function Unsafe() { const value = (<b/> as unknown as string)!; return <FormattedMessage id="value" values={{value}} />; }`,
			'src/Custom.tsx': `import {useIntl} from 'react-intl';
export function Custom() { const intl = useIntl(); return <Widget placeholder={intl.formatMessage({id:'x'})} />; }`,
		});
		const names = ['Island', 'Unsafe', 'Custom'].map((name) =>
			path.join(root, 'src', name + '.tsx'),
		);
		const { files } = await runCodemod(names, { root, write: false, projectTypes: false });
		const island = files.find((f) => f.file === 'src/Island.tsx');
		expect(island.code).toMatch(/import {\s*FormattedMessage\s*} from 'react-intl'/);
		expect(island.notes.filter((n) => n.severity === 'error')).toEqual([]);
		for (const name of ['Unsafe', 'Custom'])
			expect(
				files
					.find((f) => f.file === 'src/' + name + '.tsx')
					.notes.some((n) => n.severity === 'error'),
			).toBe(true);
	});
	it('retains errors for an escaping formatter and bridges only a genuine React Intl display', async () => {
		const root = setup({
			'src/Greeting.tsx': `import { useIntl, FormattedMessage as Message } from 'react-intl';
export function Greeting({ data }) { const intl = useIntl(); consume(intl); return <Message id="label" values={data} />; }`,
		});
		const result = (await runCodemod([path.join(root, 'src/Greeting.tsx')], { root, write: false }))
			.files[0];
		expect(result.notes.some((n) => n.severity === 'error' && n.message.includes('useIntl'))).toBe(
			true,
		);
		expect(result.code).toContain('contexts={intlContexts}');
		expect(result.code).toContain('<Message id="label"');
	});
	it('previews other candidates but reports an occupied helper path before writing any changes', async () => {
		const files = {
			'src/octane-react-intl.tsrx': 'export const custom = true;',
			'src/Other.tsx': 'export const Other = () => <p />;',
			'index.html': '<script type="module" src="/src/Other.tsx"></script>',
		};
		const root = setup(files);
		const preview = await runCodemod([root], { root, write: false });
		expect(preview.files.find((f) => f.file === 'src/Greeting.tsx').notes).toContainEqual(
			expect.objectContaining({
				rule: 'react-intl',
				severity: 'error',
				message: expect.stringContaining('already in use'),
			}),
		);
		expect(preview.files).toContainEqual(
			expect.objectContaining({ file: 'src/Other.tsx', output: 'src/Other.tsrx', changed: true }),
		);
		expect(preview.html).toContain('index.html');

		const write = spawnSync(
			process.execPath,
			[path.join(REPO, 'packages/codemod/dist/bin.js'), root],
			{ encoding: 'utf8' },
		);
		expect(write.status).toBe(1);
		expect(write.stdout).toContain('No changes were written.');
		expect(write.stdout).toContain('0 module(s) migrated, 0 renamed');
		expect(write.stdout).not.toContain('Updated the entry script');
		expect(write.stdout).not.toContain('Added');
		for (const [file, text] of Object.entries({ ...files, 'src/Greeting.tsx': localeCode }))
			expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(text);
		expect(fs.existsSync(path.join(root, 'src/Greeting.tsrx'))).toBe(false);
		expect(fs.existsSync(path.join(root, 'src/Other.tsrx'))).toBe(false);
	});
	it('reports a planned helper collision through a symlinked source directory', async () => {
		const authored = 'export const Custom = () => <p />;';
		const root = setup({ 'src/octane-react-intl.tsx': authored });
		fs.symlinkSync('src', path.join(root, 'linked'), 'dir');
		const paths = ['src/Greeting.tsx', 'linked/octane-react-intl.tsx'].map((file) =>
			path.join(root, file),
		);
		const { files } = await runCodemod(paths, { root });
		expect(files).toEqual([
			expect.objectContaining({
				file: 'src/Greeting.tsx',
				changed: false,
				notes: [
					expect.objectContaining({
						severity: 'error',
						message: expect.stringContaining('src/octane-react-intl.tsrx is already in use'),
					}),
				],
			}),
		]);
		expect(fs.readFileSync(paths[0], 'utf8')).toBe(localeCode);
		expect(fs.readFileSync(paths[1], 'utf8')).toBe(authored);
		expect(fs.existsSync(path.join(root, 'src/octane-react-intl.tsrx'))).toBe(false);
	});
	it('ignores an occupied helper path when only React Intl utilities are used', async () => {
		const utility =
			'import {defineMessages} from "react-intl"; export const labels = defineMessages({label:{id:"label"}});';
		const helper = 'export const custom = true;';
		const root = setup({
			'src/Greeting.tsx': utility,
			'src/octane-react-intl.tsrx': helper,
			'src/Other.tsx': 'export const Other = () => <p />;',
		});
		const result = await runCodemod([root], { root });
		expect(
			result.files.flatMap((file) => file.notes).filter((note) => note.severity === 'error'),
		).toEqual([]);
		expect(fs.existsSync(path.join(root, 'src/Other.tsrx'))).toBe(true);
		expect(fs.readFileSync(path.join(root, 'src/Greeting.tsrx'), 'utf8')).toMatch(
			/import\s*{\s*defineMessages\s*}\s*from\s*['"]react-intl['"]/,
		);
		expect(fs.readFileSync(path.join(root, 'src/octane-react-intl.tsrx'), 'utf8')).toBe(helper);
	});
	it('keeps rich formatter results and opaque provider children on React for review', async () => {
		const root = setup({
			'src/Greeting.tsx': `import { useIntl as read, IntlProvider } from 'react-intl';
import { Other } from './Other';
export function Panel() { const message = read().formatMessage({id:'rich'}); return <p>{message}</p>; }
export function Owner() { return <IntlProvider locale="en"><Other /></IntlProvider>; }`,
		});
		const result = await runCodemod([path.join(root, 'src/Greeting.tsx')], {
			root,
			write: false,
			strong: true,
		});
		const errors = result.files[0].notes
			.filter((n) => n.severity === 'error')
			.map((n) => n.message);
		expect(errors.some((message) => message.includes('read` is a React hook'))).toBe(true);
		expect(errors.some((message) => message.includes('<IntlProvider>'))).toBe(true);
		expect(result.files.some((f) => f.rules['react-intl-adapter'])).toBe(false);
	});

	it.each([
		['react-intl', './node_modules/react-intl', true],
		['react-*', './src/substitute.ts', false],
	])(
		'checks the resolved package behind the %s path mapping',
		async (pattern, replacement, generated) => {
			const root = setup({
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						moduleResolution: 'bundler',
						module: 'esnext',
						paths: { [pattern]: [replacement] },
					},
				}),
				'src/substitute.ts': 'export const useIntl = () => ({locale: "other"});',
			});
			const result = await runCodemod([path.join(root, 'src/Greeting.tsx')], {
				root,
				write: false,
				strong: true,
			});
			expect(result.files.some((file) => file.rules['react-intl-adapter'])).toBe(generated);
		},
	);
});
