import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runCodemod } from '../dist/index.js';
import { bundleRuntime } from './bundle-runtime.js';

const previous = fs.readFileSync(
	new URL('./fixtures/react-intl/previous-helper.tsrx', import.meta.url),
	'utf8',
);
const current = fs.readFileSync(new URL('../templates/react-intl.tsrx', import.meta.url), 'utf8');
const page = `import {FormattedMessage} from 'react-intl';
export function Greeting({name}: {name: string}) {
	return <p><FormattedMessage id="greeting" values={{name}} /></p>;
}`;
const provider = `import {IntlProvider} from './octane-react-intl.tsrx';
export function PreviouslyMigrated({children}) @{
	<IntlProvider locale="en" messages={{greeting: 'Hello, {name}!'}}>{children}</IntlProvider>
}`;
const nativeOwnership = expect.objectContaining({
	rule: 'bindings',
	severity: 'error',
	message: expect.stringContaining('generated native adapter'),
});
let root;
function project() {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-intl-upgrade-'));
	fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
	fs.symlinkSync(
		path.join(import.meta.dirname, '../node_modules'),
		path.join(root, 'node_modules'),
		'dir',
	);
	const src = path.join(root, 'src');
	fs.mkdirSync(src);
	const helper = path.join(src, 'octane-react-intl.tsrx');
	const input = path.join(src, 'Greeting.tsx');
	fs.writeFileSync(input, page);
	fs.writeFileSync(path.join(src, 'PreviouslyMigrated.tsrx'), provider);
	return { src, helper, input };
}
afterEach(() => {
	vi.restoreAllMocks();
	if (root) fs.rmSync(root, { recursive: true, force: true });
});

it('uses shorthand project types for stable exported scalar props with external callers', async () => {
	const { src } = project();
	fs.writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			type: 'module',
			name: 'shorthand-props-fixture',
			exports: { './self': { types: './src/self-shim.d.ts', default: './src/self-shim.js' } },
		}),
	);
	fs.writeFileSync(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				module: 'ESNext',
				moduleResolution: 'bundler',
				target: 'ESNext',
				jsx: 'react-jsx',
			},
		}),
	);
	fs.writeFileSync(
		path.join(src, 'labels.ts'),
		'export type Label = string & { readonly brand: unique symbol };',
	);
	fs.writeFileSync(
		path.join(src, 'producer.tsx'),
		"import type {Label} from './labels'; export const label = <b>rich</b> as unknown as Label;",
	);
	fs.writeFileSync(
		path.join(src, 'erased-export.ts'),
		"export type {Missing} from 'runtime-only-self'; export const heading = 'Ready';",
	);
	const view =
		'<section><FormattedMessage id="hello" defaultMessage="Hello {label}" values={{label}} /></section>';
	const throughShim = (specifier, binding = '{Again}') =>
		`import ${binding} from '${specifier}'; export function Pane({label}: {label: Label}) { return ${view}; } export function Other(){return <Again label={rendererLabel}/>;}`;
	const cases = {
		relativeDeclaration: throughShim('./relative-shim.js'),
		packageDeclaration: throughShim('shorthand-props-fixture/self'),
		declarationTypeOnly: `import {type Again} from './type-shim.js'; export type Same = typeof Again; export function Pane({label}: {label: Label}) { return ${view}; }`,
		symlinkBarrel: throughShim('../linked/linked-shim'),
		unresolvedNamed: throughShim('runtime-only-self'),
		unresolvedDefault: throughShim('runtime-only-self', 'Again'),
		unresolvedTypeOnly: `import type Default from 'runtime-only-self'; import {type Again} from 'runtime-only-self'; export type Same = [typeof Default, typeof Again]; export function Pane({label}: {label: Label}) { return ${view}; }`,
		unresolvedTypeExport: `import * as content from './erased-export'; export function Pane({label}: {label: Label}) { return <>{content.heading}{${view}}</>; }`,
		safe: `export function Pane({label}: {label: Label}) { return ${view}; }
			export type Props = Parameters<typeof Pane>; export {Pane as Renamed};`,
		siblingRenderable: `import type {ReactNode} from 'react'; export function Pane({label, sibling}: {label: Label, sibling?: ReactNode}) { return <>{sibling}{${view}}</>; }`,
		sibling: `export function Pane({label, sibling = rendererLabel}: {label: Label, sibling?: Label}) { return ${view}; }`,
		siblingWrite: `export function Pane({sibling = (arguments[0].label = rendererLabel), label}: {label: Label, sibling?: Label}) { return ${view}; }`,
		varRedeclaration: `export function Pane({label}: {label: Label}) { var label = rendererLabel; return ${view}; }`,
		forInWrite: `export function Pane({label}: {label: Label}) { for (label in {saved: true}) break; return ${view}; }`,
		localBarrel: `import {Renamed as Again} from './caller-barrel'; export function Pane({label}: {label: Label}) { return ${view}; } export function Other(){return <Again label={rendererLabel}/>;}`,
		namespaceBarrel: `import * as Self from './namespace-barrel'; export function Pane({label}: {label: Label}) { return ${view}; } export function Other(){return <Self.Renamed label={rendererLabel}/>;}`,
		nestedNamespace: `import * as Self from './outer-barrel'; export function Pane({label}: {label: Label}) { return ${view}; } export function Other(){return <Self.Inner.Renamed label={rendererLabel}/>;}`,
		dynamicSelf: `export function Pane({label}: {label: Label}) { return ${view}; } export async function Other(){const {Pane: Again} = await import('./dynamicSelf'); return <Again label={rendererLabel}/>;}`,
		dynamicBarrel: `export function Pane({label}: {label: Label}) { return ${view}; } export async function Other(){const {Renamed: Again} = await import('./dynamic-barrel'); return <Again label={rendererLabel}/>;}`,
		typeAlias: `import type {Renamed as Again} from './type-barrel'; export type Same = typeof Again; export function Pane({label}: {label: Label}) { return ${view}; }`,
		dynamicExternal: `export function load(){return import('./labels');} export function Pane({label}: {label: Label}) { return ${view}; }`,
		imported: `const label = rendererLabel; export function Pane() { return ${view}; }`,
		evalWrite: `export function Pane({label}: {label: Label}) { eval("label = rendererLabel"); return ${view}; }`,
		reassigned: `export function Pane({label}: {label: Label}) { label = rendererLabel; return ${view}; }`,
		parameterDefault: `export function Pane({label}: {label: Label} = {label: rendererLabel}) { return ${view}; }`,
		bindingDefault: `export function Pane({label = rendererLabel}: {label?: Label}) { return ${view}; }`,
		nestedDefault: `export function Pane({inner: {label} = {label: rendererLabel}}: {inner?: {label: Label}}) { return ${view}; }`,
		localCall: `export function Render(label: Label) { return ${view}; } export function Pane() { return Render(rendererLabel); }`,
		localJsx: `export function Child({label}: {label: Label}) { return ${view}; } export function Pane() { return <Child label={rendererLabel}/>; }`,
	};
	for (const [name, body] of Object.entries(cases)) {
		fs.writeFileSync(
			path.join(src, name + '.tsx'),
			`import {FormattedMessage} from 'react-intl';
			import type {Label} from './labels'; import {label as rendererLabel} from './producer';
			${body}`,
		);
	}
	for (const [name, owner] of [
		['caller-barrel', 'localBarrel'],
		['namespace-barrel', 'namespaceBarrel'],
		['nested-barrel', 'nestedNamespace'],
		['dynamic-barrel', 'dynamicBarrel'],
		['type-barrel', 'typeAlias'],
	]) {
		fs.writeFileSync(path.join(src, name + '.ts'), `export {Pane as Renamed} from './${owner}';`);
	}
	fs.writeFileSync(path.join(src, 'outer-barrel.ts'), "export * as Inner from './nested-barrel';");
	for (const [shim, owner] of [
		['relative-shim', 'relativeDeclaration'],
		['self-shim', 'packageDeclaration'],
		['type-shim', 'declarationTypeOnly'],
	]) {
		fs.writeFileSync(path.join(src, shim + '.js'), `export {Pane as Again} from './${owner}';`);
		fs.writeFileSync(
			path.join(src, shim + '.d.ts'),
			"import type {Label} from './labels'; export declare function Again(props: {label: Label}): import('react').ReactElement;",
		);
	}
	fs.writeFileSync(
		path.join(src, 'linked-shim.ts'),
		"export {Pane as Again} from './symlinkBarrel';",
	);
	fs.symlinkSync(src, path.join(root, 'linked'), 'dir');
	const files = [...Object.keys(cases), 'producer'].map((name) => path.join(src, name + '.tsx'));
	const options = { root, strong: true, verify: true, write: false };
	const result = await runCodemod(files, { ...options, projectTypes: true });
	for (const name of Object.keys(cases)) {
		const file = result.files.find((entry) => entry.file === 'src/' + name + '.tsx');
		const errors = [...file.notes, ...file.diagnostics].filter((note) => note.severity === 'error');
		if (
			name === 'safe' ||
			name === 'siblingRenderable' ||
			name === 'typeAlias' ||
			name === 'declarationTypeOnly' ||
			name === 'unresolvedTypeOnly' ||
			name === 'unresolvedTypeExport' ||
			name === 'dynamicExternal'
		) {
			expect(file.strong).toBe(true);
			expect(errors, name).toEqual([nativeOwnership]);
		} else {
			expect(errors, name).toContainEqual(
				expect.objectContaining({
					rule: 'bindings',
					message: expect.not.stringContaining('generated native adapter'),
				}),
			);
		}
	}
	const local = await runCodemod([path.join(src, 'safe.tsx')], { ...options, projectTypes: false });
	expect(local.files[0].notes).toContainEqual(
		expect.objectContaining({
			rule: 'bindings',
			severity: 'error',
			message: expect.not.stringContaining('generated native adapter'),
		}),
	);
});

it('previews and atomically upgrades the released helper while sharing context with an existing consumer', async () => {
	const { src, helper, input } = project();
	fs.writeFileSync(helper, previous);
	fs.chmodSync(helper, 0o640);
	const previousInode = path.join(root, 'original-helper');
	fs.linkSync(helper, previousInode);
	const preview = await runCodemod([input], { root, strong: true, write: false });
	expect(preview.files.find((f) => f.rules['react-intl-adapter'])).toMatchObject({
		changed: true,
		output: 'src/octane-react-intl.tsrx',
		code: current,
	});
	expect(fs.readFileSync(helper, 'utf8')).toBe(previous);
	const result = await runCodemod([input], { root, strong: true });
	expect(result.files.flatMap((f) => f.notes).filter((n) => n.severity === 'error')).toEqual([
		nativeOwnership,
	]);
	expect(fs.readFileSync(helper, 'utf8')).toBe(current);
	expect(fs.readFileSync(previousInode, 'utf8')).toBe(previous);
	expect(fs.statSync(helper).mode & 0o777).toBe(fs.statSync(previousInode).mode & 0o777);
	expect(fs.readFileSync(path.join(src, 'PreviouslyMigrated.tsrx'), 'utf8')).toBe(provider);
	expect((await runCodemod([src], { root, strong: true })).files.filter((f) => f.changed)).toEqual(
		[],
	);

	const server = await bundleRuntime(
		root,
		'server',
		`export {PreviouslyMigrated} from './src/PreviouslyMigrated.tsrx';
		export {Greeting} from './src/Greeting.tsrx';
		export {createElement as h} from 'octane/server'; export {prerender} from 'octane/static';`,
		['react-intl'],
	);
	const rendered = await server.prerender(() =>
		server.h(server.PreviouslyMigrated, { children: server.h(server.Greeting, { name: 'Ada' }) }),
	);
	expect(rendered.html).toContain('Hello, Ada!');
});

it.each(['edited', 'symlink'])(
	'leaves a prior %s helper and its caller untouched',
	async (kind) => {
		const { src, helper, input } = project();
		const custom = previous + '\n// project customization\n';
		if (kind === 'edited') fs.writeFileSync(helper, custom);
		else {
			const external = path.join(root, 'original-helper');
			fs.writeFileSync(external, previous);
			fs.symlinkSync(external, helper);
		}
		const out = await runCodemod([input], { root });
		expect(out.files.flatMap((f) => f.notes)).toContainEqual(
			expect.objectContaining({
				severity: 'error',
				message: expect.stringContaining('already in use'),
			}),
		);
		expect(fs.lstatSync(helper).isSymbolicLink()).toBe(kind === 'symlink');
		expect(fs.readFileSync(helper, 'utf8')).toBe(kind === 'edited' ? custom : previous);
		expect(fs.readFileSync(input, 'utf8')).toBe(page);
		expect(fs.existsSync(path.join(src, 'Greeting.tsrx'))).toBe(false);
	},
);

it.each([
	['an identical upgrade', current, true],
	['a concurrent edit', '// mine\n', false],
])('rechecks the target before publishing over %s', async (_, other, accepted) => {
	const { src, helper, input } = project();
	fs.writeFileSync(helper, previous);
	const mkdtemp = fs.mkdtempSync;
	vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix, ...args) => {
		if (path.dirname(prefix) === src) fs.writeFileSync(helper, other);
		return mkdtemp(prefix, ...args);
	});
	const out = await runCodemod([input], { root });
	const errors = out.files.flatMap((f) => f.notes).filter((n) => n.severity === 'error');
	expect(errors).toEqual(
		accepted
			? [nativeOwnership]
			: [
					expect.objectContaining({
						rule: 'react-intl',
						message: expect.stringContaining('changed during migration'),
					}),
				],
	);
	expect(fs.readFileSync(helper, 'utf8')).toBe(other);
	expect(fs.existsSync(input)).toBe(!accepted);
	expect(fs.existsSync(path.join(src, 'Greeting.tsrx'))).toBe(accepted);
	expect(fs.readdirSync(src).filter((f) => f.startsWith('.octane-'))).toEqual([]);
});

it('adopts an identical concurrent creation without truncating its file', async () => {
	const { helper, input } = project();
	const write = fs.writeFileSync;
	vi.spyOn(fs, 'writeFileSync').mockImplementation((name, data, opts) => {
		if (name === helper && !fs.existsSync(name)) {
			write(helper, current, { flag: 'wx', mode: 0o600 });
		}
		return write(name, data, opts);
	});
	const out = await runCodemod([input], { root });
	expect(out.files.flatMap((f) => f.notes).filter((n) => n.severity === 'error')).toEqual([
		nativeOwnership,
	]);
	expect(fs.readFileSync(helper, 'utf8')).toBe(current);
	expect(fs.existsSync(input)).toBe(false);
});

it('retains the prior helper and can retry an interrupted atomic replacement', async () => {
	const { helper, input, src } = project();
	fs.writeFileSync(helper, previous);
	const rename = fs.renameSync;
	const busy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
		if (to === helper) throw new Error('replace interrupted');
		return rename(from, to);
	});
	await expect(runCodemod([input], { root })).rejects.toThrow('replace interrupted');
	expect(fs.readFileSync(helper, 'utf8')).toBe(previous);
	expect(fs.readFileSync(input, 'utf8')).toBe(page);
	expect(fs.readdirSync(src).filter((f) => f.startsWith('.octane-'))).toEqual([]);
	busy.mockRestore();
	await runCodemod([input], { root });
	expect(fs.readFileSync(helper, 'utf8')).toBe(current);
	expect(fs.existsSync(path.join(src, 'Greeting.tsrx'))).toBe(true);
});
