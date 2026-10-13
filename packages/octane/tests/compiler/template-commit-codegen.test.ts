import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { parseModule } from '@tsrx/core';

function compiled(source: string, dev: boolean, mode: 'client' | 'server' = 'client') {
	const { code } = compile(source, 'template-commit-codegen.tsrx', { hmr: false, dev, mode });
	const program = parseModule(code, 'template-commit-codegen.js');
	const imports = new Set(
		program.body.flatMap((node) =>
			node.type === 'ImportDeclaration' && node.source.value.startsWith('octane')
				? node.specifiers.flatMap((specifier) =>
						specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
							? [specifier.imported.name]
							: [],
					)
				: [],
		),
	);
	const writers = program.body.filter(
		(node) => node.type === 'FunctionDeclaration' && node.id?.name.startsWith('__commit$'),
	);
	return { code, imports, writers };
}

describe.each([false, true])('template prepare/commit compiler ABI (dev %s)', (dev) => {
	it('hoists one writer for text and proven native scalar bindings across multiple elements', () => {
		const { imports, writers, code } = compiled(
			`export function View(p) @{
				<section title={p.title} data-state={p.state}>
					<span>{p.left as string}</span>
					<button hidden={p.hidden} aria-label={p.label}>{p.right as string}</button>
				</section>
			}`,
			dev,
		);
		expect(writers).toHaveLength(1);
		for (const helper of [
			'templateValues',
			'prepareTemplate',
			'commitTemplate',
			'prepareTemplateText',
			'prepareTemplatePlain',
			'prepareTemplateStringData',
			'prepareTemplateBoolean',
			'prepareTemplateAria',
			'htext',
		]) {
			expect(imports, helper).toContain(helper);
		}
		// The hoisted writer must not capture any render-local expression. Only
		// the mounted bag and prepared values may cross the delayed commit ABI.
		const writer = writers[0];
		expect(code.slice(writer.start, writer.end)).not.toMatch(
			/\bp\.(title|state|left|hidden|label|right)\b/,
		);
	});

	it('keeps scalar shell writers out of static, SSR and unsupported host plans', () => {
		const sources = [
			`export function Static() @{<section><h1>Heading</h1><p>content</p></section>}`,
			`export function Foreign(p) @{
				<a href={p.href}>
					<octane-input title={p.title}/>
					<input value={p.value}/>
					<button is="fancy-button" title={p.title}>go</button>
				</a>
			}`,
			`export function Spread(p) @{<div title={p.first} {...p.rest}>child</div>}`,
		];
		for (const source of sources) {
			const result = compiled(source, dev);
			expect(result.writers, source).toHaveLength(0);
			expect(result.imports, source).not.toContain('prepareTemplate');
		}
		const ssr = compiled(
			`export function Server(p) @{<p title={p.title}>{p.label as string}</p>}`,
			dev,
			'server',
		);
		expect(ssr.writers).toHaveLength(0);
		expect(ssr.imports).not.toContain('prepareTemplate');
	});

	it('keeps a bare renderable generic when it can change to empty or structural content', () => {
		const result = compiled(
			`export function Generic(p: { value: unknown }) @{
				<div>{p.value}</div>
			}`,
			dev,
		);
		expect(result.writers).toHaveLength(1);
		expect(result.imports).toContain('prepareTemplateText');
		expect(result.imports).toContain('childTextHoleUpdate');
		expect(result.imports).not.toContain('htext');
	});

	it('publishes a wide template once, after its final generic child can succeed', () => {
		const holes = Array.from({ length: 16 }, (_, index) => `<p>{p.values[${index}]}</p>`).join('');
		const result = compiled(
			`export function Wide(p) @{<section title={p.title}>${holes}</section>}`,
			dev,
		);
		expect(result.writers).toHaveLength(1);
		const commits = [...result.code.matchAll(/_\$commitTemplate\(/g)];
		expect(commits).toHaveLength(1);
		const updates = [...result.code.matchAll(/_\$childTextHoleUpdate\(/g)];
		expect(updates).toHaveLength(16);
		expect(commits[0].index).toBeGreaterThan(updates[15].index!);
	});
});
