import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { lynxRenderer } from '../../../lynx/src/config.js';
import { compile } from '../../src/compiler/compile.js';

const { parseModule } = createRequire(import.meta.url)('@tsrx/core') as {
	parseModule(source: string, filename: string): { body: any[] };
};

const baseRenderer = {
	id: 'object',
	module: 'octane/universal',
	target: 'universal',
} as const;

const resolvedLynxRenderer = { id: 'lynx', ...lynxRenderer } as const;

const threeRenderer = {
	id: 'three',
	module: '@octanejs/three/renderer',
	target: 'universal',
	text: 'ignore',
} as const;

const extendedThreeComponent = `
	import { extend as register } from '@octanejs/three';
	class DisposableObject {}
	const Disposable = register(DisposableObject);
	export function Scene({ items, version }) @{
		@for (const item of items; key item.id) {
			<Disposable args={[item.id, version]} />
		}
	}
`;

function compiledUniversalForArguments(source: string, options: Record<string, any> = {}): any[] {
	const code = compile(source, '/src/Scene.three.tsrx', {
		renderer: threeRenderer,
		hmr: false,
		...options,
	}).code;
	const ast = parseModule(code, '/dist/Scene.three.js');
	let local: string | undefined;
	for (const statement of ast.body as any[]) {
		if (statement.type !== 'ImportDeclaration') continue;
		for (const specifier of statement.specifiers ?? []) {
			if (
				specifier.type === 'ImportSpecifier' &&
				(specifier.imported.name ?? specifier.imported.value) === 'universalFor'
			) {
				local = specifier.local.name;
			}
		}
	}
	expect(local).toBeDefined();
	const calls: any[] = [];
	const seen = new WeakSet<object>();
	const visit = (node: any) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'CallExpression' && node.callee?.name === local) calls.push(node);
		for (const [key, child] of Object.entries(node)) {
			if (key !== 'loc' && key !== 'metadata' && key !== 'parent') visit(child);
		}
	};
	visit(ast);
	expect(calls).toHaveLength(1);
	return calls[0].arguments;
}

describe('universal compiler renderer capabilities', () => {
	it('requires an explicit policy for authored host text', () => {
		expect(() =>
			compile(
				'export function Scene() @{ <label>authored text</label> }',
				'/src/Scene.object.tsrx',
				{ renderer: baseRenderer, hmr: false },
			),
		).toThrow(
			/renderer "object" rejects authored text children\. at \/src\/Scene\.object\.tsrx:1:/,
		);
	});

	it('lowers or omits authored text according to the typed renderer policy', () => {
		const source = 'export function Scene() @{ <label>authored text</label> }';
		const host = compile(source, '/src/Scene.object.tsrx', {
			renderer: { ...baseRenderer, text: 'host' as const },
			hmr: false,
		}).code;
		const ignored = compile(source, '/src/Scene.object.tsrx', {
			renderer: { ...baseRenderer, text: 'ignore' as const },
			hmr: false,
		}).code;

		expect(host).toContain('"kind": "text", "value": "authored text"');
		expect(ignored).not.toContain('"kind": "text"');
	});

	it('enforces legal raw-text topology with the Lynx renderer preset', () => {
		const legal = compile(
			'export function Scene() @{ <text>Hello <raw-text text="world" /></text> }',
			'/src/Scene.lynx.tsrx',
			{ renderer: resolvedLynxRenderer, hmr: false },
		).code;

		expect(legal).toContain('"kind": "text", "value": "Hello"');
		expect(legal).toContain('"type": "raw-text"');
		expect(() =>
			compile('export function Scene() @{ <view>illegal</view> }', '/src/Illegal.lynx.tsrx', {
				renderer: resolvedLynxRenderer,
				hmr: false,
			}),
		).toThrow(
			/renderer "lynx" does not allow authored JSX text under <view>\. at \/src\/Illegal\.lynx\.tsrx:1:/,
		);
		expect(() =>
			compile(
				'export function Scene() @{ <view><raw-text text="illegal" /></view> }',
				'/src/IllegalRawText.lynx.tsrx',
				{ renderer: resolvedLynxRenderer, hmr: false },
			),
		).toThrow(
			/renderer "lynx" does not allow <raw-text> under <view>\. at \/src\/IllegalRawText\.lynx\.tsrx:1:/,
		);

		const componentOwned = compile(
			`function Label({children}) @{ <text>{children}</text> }
			 export function Scene() @{ <Label><raw-text text="component-owned" /></Label> }`,
			'/src/ComponentOwnedRawText.lynx.tsrx',
			{ renderer: resolvedLynxRenderer, hmr: false },
		).code;
		expect(componentOwned).toContain('"type": "raw-text"');
	});

	it('lowers Activity only for renderers that advertise visibility', () => {
		const source = `
			import { Activity } from 'octane';
			export function Scene({mode}) @{
				<Activity mode={mode}><node /></Activity>
			}
		`;

		expect(() =>
			compile(source, '/src/Scene.object.tsrx', {
				renderer: { ...baseRenderer, text: 'host' },
				hmr: false,
			}),
		).toThrow(/Activity requires an explicit renderer visibility capability/);

		const output = compile(source, '/src/Scene.object.tsrx', {
			renderer: {
				...baseRenderer,
				text: 'host' as const,
				capabilities: ['visibility'],
			},
			hmr: false,
		}).code;

		expect(output).toContain('universalActivity as __octaneUniversalActivity');
		expect(output).toContain('__octaneUniversalActivity(mode, () =>');
		expect(output).not.toContain('<Activity');
	});

	it('diagnoses invalid static Activity modes at the authored source', () => {
		expect(() =>
			compile(
				`import { Activity } from 'octane';
				 export function Scene() @{ <Activity mode="collapsed"><node /></Activity> }`,
				'/src/Scene.object.tsrx',
				{
					renderer: {
						...baseRenderer,
						text: 'host',
						capabilities: ['visibility'],
					},
					hmr: false,
				},
			),
		).toThrow(
			/Activity mode must be either "visible" or "hidden"\. at \/src\/Scene\.object\.tsrx:2:/,
		);
	});

	it('keeps scoped styles behind an explicit renderer style/assets capability', () => {
		expect(() =>
			compile(
				`export function Scene() @{
					<><node /><style>.node { color: red; }</style></>
				}`,
				'/src/Scene.object.tsrx',
				{ renderer: { ...baseRenderer, text: 'host' }, hmr: false },
			),
		).toThrow(
			/scoped <style> requires a renderer style\/assets capability\. at \/src\/Scene\.object\.tsrx:/,
		);
	});
});

describe('constructor-backed Three components in keyed loops', () => {
	it.each([
		['an aliased import', extendedThreeComponent],
		[
			'a direct import',
			extendedThreeComponent
				.replace('extend as register', 'extend')
				.replace('register(DisposableObject)', 'extend(DisposableObject)'),
		],
		[
			'an exported immutable binding',
			extendedThreeComponent.replace('const Disposable =', 'export const Disposable ='),
		],
	])('elides item owners for %s with a trusted immutable host component', (_label, source) => {
		const args = compiledUniversalForArguments(source);

		expect(args.slice(3, 6).map((argument) => argument.value)).toEqual([null, true, true]);
		expect(args[6]).toMatchObject({ type: 'Identifier', name: 'Disposable' });
		expect(args[2].body).toMatchObject({ type: 'ArrayExpression' });
		expect(args[7]).toMatchObject({
			type: 'CallExpression',
			arguments: [
				{ type: 'Literal', value: 'three' },
				{ type: 'Identifier', name: 'Disposable' },
				{ type: 'Literal', value: '["args"]' },
			],
		});
		expect(args[8]).toMatchObject({ type: 'Literal', value: '["args"]' });
	});

	it('preserves the ordered values of boolean, static, and dynamic host props', () => {
		const source = extendedThreeComponent.replace(
			'<Disposable args={[item.id, version]} />',
			'<Disposable enabled label="retained" args={[item.id, version]} />',
		);
		const args = compiledUniversalForArguments(source);

		expect(JSON.parse(args[8].value)).toEqual(['enabled', 'label', 'args']);
		expect(args[2].body.elements).toMatchObject([
			{ type: 'Literal', value: true },
			{ type: 'Literal', value: 'retained' },
			{ type: 'ArrayExpression' },
		]);
	});

	it.each([
		[
			'a parameter shadows the trusted binding',
			extendedThreeComponent.replace('{ items, version }', '{ items, version, Disposable }'),
		],
		[
			'a component-local binding shadows the trusted binding',
			extendedThreeComponent.replace(
				'export function Scene({ items, version }) @{',
				'export function Scene({ items, version, replacement }) @{\nconst Disposable = replacement;',
			),
		],
		[
			'the loop item shadows the trusted binding',
			extendedThreeComponent
				.replace('const item of items; key item.id', 'const Disposable of items; key Disposable.id')
				.replace('[item.id, version]', '[Disposable.id, version]'),
		],
		[
			'the component binding can be reassigned',
			extendedThreeComponent.replace(
				'const Disposable = register(DisposableObject);',
				'let Disposable = register(DisposableObject); Disposable = replacement;',
			),
		],
		[
			'extend comes from another package',
			extendedThreeComponent.replace("'@octanejs/three'", "'another-three-binding'"),
		],
		[
			'extend is called through an unproven namespace',
			extendedThreeComponent
				.replace(
					"import { extend as register } from '@octanejs/three';",
					"import * as Three from '@octanejs/three';",
				)
				.replace('register(DisposableObject)', 'Three.extend(DisposableObject)'),
		],
		[
			'a generic component wraps extend',
			extendedThreeComponent.replace(
				'const Disposable = register(DisposableObject);',
				'const wrap = (constructor) => register(constructor);\nconst Disposable = wrap(DisposableObject);',
			),
		],
		[
			'the constructor registration has additional arguments',
			extendedThreeComponent.replace(
				'register(DisposableObject)',
				'register(DisposableObject, options)',
			),
		],
	])('preserves component ownership when %s', (_label, source) => {
		expect(compiledUniversalForArguments(source)).toHaveLength(3);
	});

	it.each([
		['a ref', '<Disposable ref={reference} args={[item.id, version]} />'],
		['spread props', '<Disposable {...extra} args={[item.id, version]} />'],
		['an event handler', '<Disposable onClick={handler} args={[item.id, version]} />'],
		['an explicit key', '<Disposable key={item.id} args={[item.id, version]} />'],
		['explicit children', '<Disposable children={child} args={[item.id, version]} />'],
		['host attachment', '<Disposable attach="material" args={[item.id, version]} />'],
		['a prototype-sensitive prop', '<Disposable __proto__={prototype} />'],
		['duplicate props', '<Disposable args={first} args={second} />'],
		['children', '<Disposable args={[item.id, version]}><mesh /></Disposable>'],
	])('retains scoped item semantics for %s', (_label, element) => {
		const source = extendedThreeComponent.replace(
			'<Disposable args={[item.id, version]} />',
			element,
		);

		expect(compiledUniversalForArguments(source)).toHaveLength(3);
	});

	it.each([
		['development compilation', { dev: true }],
		['HMR', { hmr: true }],
		['Webpack HMR', { hmr: 'webpack' }],
		['profiling', { profile: true }],
		['a different renderer', { renderer: { ...threeRenderer, id: 'other' } }],
		['an untrusted renderer module', { renderer: { ...threeRenderer, module: 'other/renderer' } }],
	])('does not elide component ownership with %s enabled', (_label, options) => {
		expect(compiledUniversalForArguments(extendedThreeComponent, options)).toHaveLength(3);
	});
});

describe('compact intrinsic host loops', () => {
	const source = `
		export function Scene({ items }) @{
			@for (const item of items; key item.id) {
				<mesh name={item.name} position={[item.x, 0, 0]} />
			}
		}
	`;

	it('passes one hoisted leaf plan and emits raw authored prop values per item', () => {
		const args = compiledUniversalForArguments(source);

		expect(args.slice(3, 6).map((argument) => argument.value)).toEqual([null, true, true]);
		expect(args[6]).toMatchObject({ type: 'UnaryExpression', operator: 'void' });
		expect(args[7]?.type).toBe('Identifier');
		expect(args[2].body).toMatchObject({
			type: 'ArrayExpression',
			elements: [{ type: 'MemberExpression' }, { type: 'ArrayExpression' }],
		});
	});

	it('keeps an empty raw-value array for static intrinsic props', () => {
		const args = compiledUniversalForArguments(
			source.replace('<mesh name={item.name} position={[item.x, 0, 0]} />', '<mesh visible />'),
		);

		expect(args[2].body).toMatchObject({ type: 'ArrayExpression', elements: [] });
		expect(args[7]?.type).toBe('Identifier');
	});

	it('retains ordinary scoped callbacks while HMR is active', () => {
		const args = compiledUniversalForArguments(source, { hmr: true });

		expect(args).toHaveLength(3);
		expect(args[2].body.type).toBe('BlockStatement');
	});
});
