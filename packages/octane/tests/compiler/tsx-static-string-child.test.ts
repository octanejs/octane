import { parseModule } from '@tsrx/core';
import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// `.tsx` return-form hosts extract dynamic children as `hN` holes. A string
// literal expression (`{" "}`, commonly inserted by Prettier) is static text,
// not a hole: the server and `.tsrx` bake it into the template. Client/server
// hole counts must agree or hydration consumes the next sibling and duplicates it.

const PRETTIER_SPACE = `
	function Link(props) {
		return <a href={props.to}>{props.children}</a>;
	}
	export function Example() {
		return (
			<p>
				Try the{" "}
				<Link to="/items">items</Link> page
			</p>
		);
	}
`;

const LITERAL_RUNS = `
	export function Example() {
		return <p>foo{"bar"}{"!"}baz</p>;
	}
`;

const EMPTY_LITERAL = `
	function Emph(props) {
		return <em>{props.children}</em>;
	}
	export function Example() {
		return (
			<p>
				before{""}
				<Emph>mid</Emph>
				{""}after
			</p>
		);
	}
`;

const DYNAMIC_TEXT = `
	function Link(props) {
		return <a href={props.to}>{props.children}</a>;
	}
	export function Example(props) {
		return (
			<p>
				Try the{props.space as string}
				<Link to="/items">items</Link> page
			</p>
		);
	}
`;

const TSRX_PRETTIER_SPACE = `
	function Link(props) @{
		<a href={props.to}>{props.children}</a>
	}
	export function Example() @{
		<p>
			Try the{" "}
			<Link to="/items">items</Link> page
		</p>
	}
`;

function compileClient(src: string, filename = 'f.tsx'): string {
	return compile(src, filename, {}).code;
}

function compileServer(src: string, filename = 'f.tsx'): string {
	return compile(src, filename, { mode: 'server' }).code;
}

function runtimeLocal(code: string, imported: string): string | null {
	const program = parseModule(code, 'compiled.js');
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type !== 'ImportSpecifier') continue;
			if (specifier.imported?.name === imported) return specifier.local.name;
		}
	}
	return null;
}

function templateStrings(code: string): string[] {
	const templateName = runtimeLocal(code, 'template');
	if (templateName === null) return [];
	const found: string[] = [];
	const seen = new WeakSet<object>();
	function visit(node: any): void {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			node.callee.name === templateName &&
			node.arguments[0]?.type === 'Literal' &&
			typeof node.arguments[0].value === 'string'
		) {
			found.push(node.arguments[0].value);
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata') continue;
			if (Array.isArray(value)) {
				for (const item of value) visit(item);
			} else {
				visit(value);
			}
		}
	}
	visit(parseModule(code, 'compiled.js'));
	return found;
}

function hostParagraphTemplate(code: string): string | undefined {
	return templateStrings(code).find(function (html) {
		return html.startsWith('<p>');
	});
}

function stringLiteralHoleValues(code: string): string[] {
	const createName = runtimeLocal(code, 'createElement');
	if (createName === null) return [];
	const values: string[] = [];
	const seen = new WeakSet<object>();
	function visit(node: any): void {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'Identifier' &&
			node.callee.name === createName &&
			node.arguments[1]?.type === 'ObjectExpression'
		) {
			for (const prop of node.arguments[1].properties) {
				if (prop.type !== 'Property' || prop.computed) continue;
				const key = prop.key?.name ?? prop.key?.value;
				if (typeof key !== 'string' || !/^h\d+$/.test(key)) continue;
				if (prop.value?.type === 'Literal' && typeof prop.value.value === 'string') {
					values.push(prop.value.value);
				}
			}
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata') continue;
			if (Array.isArray(value)) {
				for (const item of value) visit(item);
			} else {
				visit(value);
			}
		}
	}
	visit(parseModule(code, 'compiled.js'));
	return values;
}

function countAnchors(html: string | undefined): number {
	if (html === undefined) return 0;
	return html.split('<!>').length - 1;
}

describe('.tsx string-literal expression children — client matches server/.tsrx fold', function () {
	it('folds Prettier {" "} between text and a component (issue #965)', function () {
		const client = compileClient(PRETTIER_SPACE);
		const server = compileServer(PRETTIER_SPACE);
		const tsrx = compileClient(TSRX_PRETTIER_SPACE, 'f.tsrx');

		expect(stringLiteralHoleValues(client)).toEqual([]);
		expect(hostParagraphTemplate(client)).toBe('<p>Try the <!> page</p>');
		expect(countAnchors(hostParagraphTemplate(client))).toBe(1);
		expect(countAnchors(hostParagraphTemplate(tsrx))).toBe(1);
		expect(server).toContain('Try the ');
		expect(server).toContain('ssrComponent');
		expect(server).not.toContain('ssrText');
	});

	it('folds adjacent constant string expression holes into the template', function () {
		const client = compileClient(LITERAL_RUNS);
		const server = compileServer(LITERAL_RUNS);
		expect(stringLiteralHoleValues(client)).toEqual([]);
		expect(hostParagraphTemplate(client)).toBe('<p>foobar!baz</p>');
		expect(countAnchors(hostParagraphTemplate(client))).toBe(0);
		expect(server).toContain('foobar!baz');
		expect(server).not.toContain('ssrText');
	});

	it('treats empty string literals as adjacency-transparent, not holes', function () {
		const client = compileClient(EMPTY_LITERAL);
		expect(stringLiteralHoleValues(client)).toEqual([]);
		expect(hostParagraphTemplate(client)).toBe('<p>before<!>after</p>');
		expect(countAnchors(hostParagraphTemplate(client))).toBe(1);
	});

	it('keeps a dynamic text expression as a hole on both compilers', function () {
		const client = compileClient(DYNAMIC_TEXT);
		const server = compileServer(DYNAMIC_TEXT);
		expect(stringLiteralHoleValues(client)).toEqual([]);
		expect(countAnchors(hostParagraphTemplate(client))).toBe(2);
		expect(hostParagraphTemplate(client)).toBe('<p>Try the<!><!> page</p>');
		expect(server).toContain('ssrText');
		expect(server).toContain('ssrComponent');
	});
});
