// @vitest-environment node

import { parseModule } from '../../src/compiler/parser.node.js';
import { compile } from 'octane/compiler';
import { describe, expect, it } from 'vitest';

// Inspect the compiler/runtime ABI, rather than generated identifier names or
// formatting. This capability must be reachable for custom descriptor tags and
// absent from native-only and server programs so their bundles can omit it.
function descriptorCapabilities(source: string, mode: 'client' | 'server'): Set<string> {
	const { code } = compile(source, 'descriptor-capability.tsx', { mode });
	const result = new Set<string>();
	const ast = parseModule(code, 'compiled.js');
	for (const statement of ast.body) {
		if (
			statement.type !== 'ImportDeclaration' ||
			!['octane/internal/client', 'octane/internal/server'].includes(String(statement.source.value))
		) {
			continue;
		}
		for (const specifier of statement.specifiers) {
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.imported.type === 'Identifier' &&
				specifier.imported.name.startsWith('enableDescriptor')
			) {
				result.add(specifier.imported.name);
			}
		}
	}
	return result;
}

const custom = 'enableDescriptorCustomHosts';
const forms = 'enableDescriptorFormActions';
const fragmentRefs = 'enableDescriptorFragmentRefs';

const tagCases = [
	{
		name: 'literal custom tag without props',
		source: 'export const view = <my-editor />;',
		capabilities: [custom],
	},
	{
		name: 'literal native host without props',
		source: 'export const view = <main />;',
		capabilities: [],
	},
	{
		name: 'locally declared immutable component',
		source: 'function Editor() { return null; } export const view = <Editor />;',
		capabilities: [],
	},
	{
		name: 'immutable arrow-function component',
		source: 'const Editor = () => null; export const view = <Editor />;',
		capabilities: [],
	},
	{
		name: 'mutable function binding can become a custom tag',
		source: 'let Editor = () => null; Editor = "my-editor"; export const view = <Editor />;',
		capabilities: [custom],
	},
	{
		name: 'Octane boundary imported under an alias',
		source: "import { Suspense as Boundary } from 'octane'; export const view = <Boundary />;",
		capabilities: [],
	},
	{
		name: 'shadowed Octane boundary may be a custom tag',
		source:
			"import { Suspense as Boundary } from 'octane'; export function view(Boundary) { return <Boundary />; }",
		capabilities: [custom],
	},
	{
		name: 'imported component or host tag',
		source: "import Editor from './editor'; export const view = <Editor />;",
		capabilities: [custom],
	},
	{
		name: 'local dynamic tag without props',
		source: 'export function view(Tag) { return <Tag />; }',
		capabilities: [custom],
	},
	{
		name: 'dynamic member tag without props',
		source: 'export function view(tags) { return <tags.Editor />; }',
		capabilities: [custom],
	},
	{
		name: 'locally shadowed module component',
		source: `
			function Editor() { return null; }
			export function view(Editor) { return <Editor />; }`,
		capabilities: [custom],
	},
	{
		name: 'stable octane Fragment',
		source: "import { Fragment } from 'octane'; export const view = <Fragment />;",
		capabilities: [],
	},
	{
		name: 'locally shadowed Fragment may be a custom tag',
		source: `
			import { Fragment } from 'octane';
			export function view(Fragment) { return <Fragment />; }`,
		capabilities: [custom],
	},
	{
		name: 'native form action does not require custom descriptor activation',
		source: 'export function view(save) { return <form action={save} />; }',
		capabilities: [],
	},
	{
		name: 'stable Fragment ref does not require custom descriptor activation',
		source: `
			import { Fragment } from 'octane';
			export function view(ref) { return <Fragment ref={ref} />; }`,
		capabilities: [],
	},
	{
		name: 'spread on an unknown tag preserves all possible host and Fragment behavior',
		source: 'export function view(Tag, props) { return <Tag {...props} />; }',
		capabilities: [custom, forms, fragmentRefs],
	},
];

describe('descriptor custom host capability', () => {
	for (const mode of ['client', 'server'] as const) {
		it.each(tagCases)(`${mode}: $name`, ({ source, capabilities }) => {
			expect(descriptorCapabilities(source, mode)).toEqual(
				new Set(mode === 'client' ? capabilities : []),
			);
		});
	}
});
