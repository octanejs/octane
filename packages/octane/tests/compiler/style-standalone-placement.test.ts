import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { compileToVolarMappings } from 'octane/compiler/volar';

// RFC tsrx-org/RFCs#1, amendment A1, rules B and C. Raw CSS in <style> is TSRX
// template syntax: a standalone block is allowed only lexically inside a
// `@{ … }` body or an @if/@for/@switch/@try body, and anywhere else the core
// analyzer (which Octane runs in compile.js and volar.js) reports
// `tsrx-style-standalone-outside-template`. In plain TSX, `<style>` is an
// ordinary element whose content is an expression child — `<style>{css}</style>`
// — and both emitters pass it through untouched: no scope, no `injectStyle`,
// no hash, no head hoist.

const OUTSIDE_TEMPLATE = 'tsrx-style-standalone-outside-template';

const RAW_IN_PLAIN_RETURN = `export function C() {
	return <section><style>.a { color: red; }</style><div class="a" /></section>;
}
`;

const MODES = [
	['client', {}],
	['client prod', { hmr: false as const }],
	['server', { mode: 'server' as const }],
] as const;

function thrownBy(source: string, options: Record<string, unknown>): any {
	try {
		compile(source, 'placement.tsrx', options);
	} catch (error) {
		return error;
	}
	return null;
}

describe('rule B: raw CSS in <style> needs a TSRX container', () => {
	it.each(MODES)(
		'a block in a plain-function return is the analyzer error — %s',
		(_label, options) => {
			const error = thrownBy(RAW_IN_PLAIN_RETURN, options);
			expect(error).not.toBeNull();
			expect(error.code).toBe(OUTSIDE_TEMPLATE);
			expect(error.message).toContain('<style>{css}</style>');
		},
	);

	it.each([
		[
			'an assigned element at module scope',
			`export const card = <div><style>.p { margin: 0; }</style><p class="p" /></div>;\n`,
		],
		[
			'an assigned element in a plain function',
			`export function C() {\n\tconst card = <div><style>.p { margin: 0; }</style><p class="p" /></div>;\n\treturn card;\n}\n`,
		],
	])('%s is the same error', (_label, source) => {
		const error = thrownBy(source, {});
		expect(error).not.toBeNull();
		expect(error.code).toBe(OUTSIDE_TEMPLATE);
	});

	it('a bare block statement at module scope keeps its own code', () => {
		const error = thrownBy(`<style>.a { color: red; }</style>;\n`, {});
		expect(error).not.toBeNull();
		expect(error.code).toBe('tsrx-style-standalone-at-module-scope');
	});

	it.each([
		[
			'a @{ … } body',
			`export function C() @{ <section><style>.a { color: red; }</style><div class="a" /></section> }\n`,
		],
		[
			'an @if body inside returned JSX',
			`export function C(props) {\n\treturn <section>@if (props.x) { <><style>.a { color: red; }</style><div class="a" /></> }</section>;\n}\n`,
		],
		[
			'an assigned element inside a @{ … } body',
			`export function C() @{\n\tconst card = <div><style>.p { margin: 0; }</style><p class="p" /></div>;\n\t<>{card}</>\n}\n`,
		],
		[
			'a callback template inside a @{ … } body',
			`export function C(props) @{ <ul>{props.items.map((i) => <li><style>b { color: red; }</style><b>{i as string}</b></li>)}</ul> }\n`,
		],
	])('%s is a container: the block compiles to a scope', (_label, source) => {
		for (const [, options] of MODES) {
			const { code } = compile(source, 'container.tsrx', options);
			expect(code).toMatch(/injectStyle\("tsrx-[a-z0-9]+"/);
			expect(code).not.toContain('<style');
		}
	});

	it('the editor path collects the diagnostic instead of throwing', () => {
		const result = compileToVolarMappings(RAW_IN_PLAIN_RETURN, 'placement.tsrx');
		expect(result.errors.map((error: any) => error.code)).toContain(OUTSIDE_TEMPLATE);
	});
});

describe('rule C: <style>{expr}</style> is an ordinary element', () => {
	const PLAIN = `export function C(props) {
	return <section><style>{props.css}</style><div class="a" /></section>;
}
`;
	const IN_BODY = `export function C(props) @{
	<>
		<style>.a { color: red; }</style>
		<section><style>{props.css}</style><div class="a" /></section>
	</>
}
`;

	it('client: the element and its text hole pass through with no scope or injectStyle', () => {
		for (const options of [{}, { hmr: false as const }]) {
			const { code } = compile(PLAIN, 'style-value.tsrx', options);
			expect(code).not.toContain('injectStyle');
			expect(code).not.toMatch(/tsrx-[a-z0-9]+/);
			expect(code).toContain('<section><style></style><div class=\\"a\\"></div></section>');
			expect(code).toContain('props.css');
			expect(code).not.toContain('HeadHoist');
			expect(code).not.toContain('styleResource');
		}
	});

	it('server: the element renders inline around the escaped text', () => {
		const { code } = compile(PLAIN, 'style-value.tsrx', { mode: 'server' });
		expect(code).not.toContain('injectStyle');
		expect(code).not.toMatch(/tsrx-[a-z0-9]+/);
		expect(code).toContain('<style>${_$ssrChildText(props.css, __s)}</style>');
		expect(code).not.toContain('ssrStyleResource');
	});

	it.each(MODES)('inside a scope the style element is never stamped — %s', (_label, options) => {
		const { code } = compile(IN_BODY, 'style-value-scoped.tsrx', options);
		const hash = code.match(/injectStyle\("(tsrx-[a-z0-9]+)"/)![1];
		const unescaped = code.replace(/\\"/g, '"');
		// The section (a fragment sibling of the block) and the div carry the
		// hash; the style host between them is emitted bare on both sides — one
		// static template on the client, nested template-literal runs with the
		// text hole on the server.
		expect(unescaped).toContain(`<section class="${hash}">`);
		expect(unescaped).toContain(`<div class="a ${hash}">`);
		expect(unescaped).not.toContain('<style class=');
		expect(unescaped).not.toContain(`<style ${hash}`);
		if ('mode' in options && options.mode === 'server') {
			expect(unescaped).toContain('<style>${_$ssrChildText(props.css, __s)}</style>');
		} else {
			expect(unescaped).toContain(
				`<section class="${hash}"><style></style><div class="a ${hash}"></div></section>`,
			);
		}
	});
});
