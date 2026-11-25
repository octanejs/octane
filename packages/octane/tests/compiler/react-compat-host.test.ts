import { parseModule } from '@tsrx/core';
import { compile } from 'octane/compiler';
import { describe, expect, it } from 'vitest';
import * as domBindings from '../../src/dom-bindings.js';
import { createReactCompatHost } from '../../src/react/react-compat-host.js';
import { evaluateCompiledFixtureCode } from '../_server-fixture.js';

const children = '{unbound(props.children)}';
const template = `<div class={props.className} aria-live={props["aria-live"]}>${children}</div>`;
const call = 'export const Frame = host(Host)';
const source = `
  'use strong';
  import { createReactCompatHost as host } from 'octane/react';
  import { unbound } from 'octane/behavior';
  function Host(props) @{
    'use dom bindings';
    ${template}
  }
  ${call}
`;

function imports(code: string) {
	return parseModule(code, 'frame.js').body.flatMap((node) =>
		node.type === 'ImportDeclaration' ? [node.source.value] : [],
	);
}

it('shares a stamp across build roots and retains only the scalar adopter on the client', () => {
	const { code: client } = compile(
		source + 'function shadow(Host) { return Host }',
		'/web/client/frame.tsrx',
	);
	const { code: server } = compile(source, '/node/build/frame.tsrx', { mode: 'server' });
	const adapter = { createReactCompatHost: (view: unknown) => view };
	const modules = {
		'octane/dom-bindings': domBindings,
		'octane/react': adapter,
		'octane/react/server': adapter,
	};
	const { Frame: stamp } = evaluateCompiledFixtureCode(server, 'frame.tsrx', 'server', modules);
	const { Frame: descriptor } = evaluateCompiledFixtureCode(
		client,
		'frame.tsrx',
		'client',
		modules,
	);
	expect(typeof stamp).toBe('string');
	expect(descriptor).toMatchObject({ id: stamp });
	expect(imports(server)).toEqual(['octane/react/server']);
	expect(imports(client).sort()).toEqual(['octane/dom-bindings', 'octane/react']);
});

it('preserves the module directive prologue', () => {
	const { code } = compile("'use client';" + source, 'frame.tsrx');
	expect(parseModule(code, 'frame.js').body[0]).toMatchObject({
		expression: { value: 'use client' },
	});
});

it('keeps the same runtime imports for an incidental mention of the factory', () => {
	const view =
		"'use strong'; export function Example(props) @{ <div class={props.className}>{props.value}</div> }";
	const specifiers = (text: string) =>
		parseModule(compile(text, 'view.tsrx').code, 'view.js').body.flatMap((node) =>
			node.type === 'ImportDeclaration'
				? node.specifiers.map((specifier) => specifier.local.name)
				: [],
		);
	expect(specifiers(view + ' // createReactCompatHost')).toEqual(specifiers(view));
});

it.each([
	'export function Other() @{ <Host.Other/> }',
	'export const Other = Host<unknown>',
	'export namespace Other { export const view = Host }',
])('retains the authored view for a separate value reference in %s', (use) => {
	expect(compile(source + use, 'frame.tsrx').code).toMatch(/\b(?:const|function) Host\b/);
});

describe.each(['client', 'server'] as const)('createReactCompatHost in %s output', (mode) => {
	it('keeps the view type for TypeScript consumers', () => {
		const src = source.replace(
			'Host(props)',
			'Host(props: { className: string; "aria-live": "polite"; children: unknown })',
		);
		const { code } = compile(src + 'export type View = typeof Host', 'frame.tsrx', {
			mode,
			output: 'ts',
		});
		expect(code).toContain('declare function Host(');
		expect(code).toContain('as unknown as typeof Host');
	});

	it.each([
		`<section class={props.className}>${children}</section>`,
		'<div class={props.className}>{unbound(props.content)}</div>',
		'<div class={props.className}>{props.children}</div>',
		`<div class={props.className}>${children}${children}</div>`,
		`<div class={props.className}>${children}<span /></div>`,
		`<div class={props.className} data-id="static">${children}</div>`,
		`<div class={props.className} ref={unbound(props.ref)}>${children}</div>`,
		`<div class={props.className} onClick={unbound(props.onClick)}>${children}</div>`,
		`<div {...unbound(props)} class={props.className}>${children}</div>`,
		`<div data-octane-owner={props["data-octane-owner"]}>${children}</div>`,
		`<div data-octane-bindings={props["data-octane-bindings"]}>${children}</div>`,
		`<div data-oct-b={props["data-oct-b"]}>${children}</div>`,
		`<div title={props.title}>${children}</div>`,
		`<div class={props.active ? 'open' : 'closed'}>${children}</div>`,
		`<div class={props.input.get()}>${children}</div>`,
		`<div class={(props.input.touch()<unknown>)}>${children}</div>`,
		`<div class={import('./other') ? 'one' : 'two'}>${children}</div>`,
		`<div class={props.input === unbound ? 'one' : 'two'}>${children}</div>`,
		`<div data-active={props.active}>${children}</div>`,
		`<div style={{color: props.color}}>${children}</div>`,
		`<div class={props.className}>${children}<style>div { color:red; }</style></div>`,
	])('rejects %s before emitting a projection', (invalid) => {
		expect(() => compile(source.replace(template, invalid), 'frame.tsrx', { mode })).toThrow(
			/Octane DOM bindings/,
		);
	});

	it.each([
		['a missing directive', source.replace("'use dom bindings';", '')],
		['a non-Strong view', source.replace("'use strong';", '')],
		[
			'an imported view',
			source.replace(call, "import { Other } from './other'; export const Frame = host(Other)"),
		],
		['a nested call', source.replace(call, 'export function render() { return host(Host) }')],
		[
			'an indirect factory',
			source.replace(call, 'const alias = host; export const Frame = alias(Host)'),
		],
		['a mismatched tag', source.replace('host(Host)', "host(Host, 'button')")],
		['a dynamic tag', source.replace('host(Host)', 'host(Host, name)')],
		['extra arguments', source.replace('host(Host)', "host(Host, 'div', {})")],
	])('rejects %s', (_, invalid) => {
		expect(() => compile(invalid, 'frame.tsrx', { mode })).toThrow(/createReactCompatHost/);
	});
});
it.each(['section', 'nav', 'button', 'select', 'textarea', 'input', 'linearGradient'])(
	'projects private input for <%s> without a server adopter',
	(tag) => {
		const attrs = 'class={props.input.active ? "active" : props.className}';
		const element =
			tag === 'input' || tag === 'textarea'
				? `<${tag} ${attrs} />`
				: `<${tag} ${attrs}>${children}</${tag}>`;
		const src = source.replace(template, element).replace('host(Host)', `host(Host, '${tag}')`);
		const { code } = compile(src, 'frame.tsrx', { mode: 'server' });
		expect(imports(code)).toEqual(['octane/react/server']);
		const { Frame } = evaluateCompiledFixtureCode(code, 'frame.tsrx', 'server', {
			'octane/react/server': { createReactCompatHost },
		});
		const rendered = Frame({ input: { active: true }, className: 'ignored', id: 'example' });
		expect(rendered.type).toBe(tag);
		expect(rendered.props).toMatchObject({ className: 'active', id: 'example' });
		expect(rendered.props).not.toHaveProperty('input');
	},
);

it('retains a pure helper and distinguishes shadowed parameter reads', () => {
	const src =
		source.replace(
			template,
			'<div style={{width: size(props.input.find(props => props.active))}} />',
		) + "import { size } from './size';";
	const { code } = compile(src, 'frame.tsrx', { mode: 'server' });
	const { Frame } = evaluateCompiledFixtureCode(code, 'frame.tsrx', 'server', {
		'octane/react/server': { createReactCompatHost },
		'./size': { size: (item: { width: number }) => item.width },
	});
	expect(Frame({ input: [{ active: true, width: 42 }] }).props.style).toEqual({ width: 42 });
});
