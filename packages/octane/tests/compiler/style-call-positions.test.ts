import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// `style(expr)` is Octane's class-string expression (core has no such
// intrinsic). The style-scope pre-pass resolves it to the scope chain plus the
// value only where TSRX reads a class value — the expression of a JSX attribute
// value or of a template expression-container child, directly or nested in the
// array/conditional/logical/template expressions of that container — which is
// the set of positions the emitters expanded before the pre-pass existed. The
// `style` attribute is excluded on purpose: its value is CSS, never a class
// list, so a `style(...)` there is a user helper (the pre-pass-less compiler
// did rewrite it, a quirk this suite retires). Everywhere else — a statement, a
// declaration initializer, a call argument, a callback body — `style(...)` is
// an ordinary user call and prints as authored.

const MODES = [
	['client', {}],
	['client prod', { hmr: false as const }],
	['server', { mode: 'server' as const }],
] as const;

function hashOf(code: string): string {
	return code.match(/injectStyle\("(tsrx-[a-z0-9]+)"/)![1];
}

describe('style(...) resolves only in class-string positions', () => {
	it.each(MODES)(
		'an imported style helper in a style attribute is left alone — %s',
		(_label, options) => {
			const { code } = compile(
				`import { style } from './helpers.js';
export function A(props) @{
	<>
		<style>.a { color: red; }</style>
		<div class="a" style={style(props)}>{'x'}</div>
	</>
}`,
				'style-attr.tsrx',
				options,
			);
			const hash = hashOf(code);
			expect(code).toContain('style(props)');
			expect(code).not.toContain(`"${hash} " +`);
			expect(code.replace(/\\"/g, '"')).toContain(`class="a ${hash}"`);
		},
	);

	it.each(MODES)(
		'a local style helper called in setup and in a callback is left alone — %s',
		(_label, options) => {
			const { code } = compile(
				`export function B(props) @{
	const style = (p) => ({ color: p.color });
	const s = style(props);
	const all = props.items.map((item) => style(item));
	<>
		<style>.b { color: blue; }</style>
		<div class="b" style={s} data-count={all.length}>{'x'}</div>
	</>
}`,
				'style-setup.tsrx',
				options,
			);
			expect(code).toContain('const s = style(props);');
			expect(code).toContain('style(item)');
			expect(code).not.toContain('const s = props;');
		},
	);

	it.each(MODES)(
		'class={style(…)} resolves to the chain plus the value — %s',
		(_label, options) => {
			const { code } = compile(
				`import { theme } from './theme.tsrx';
export function C(props) @{
	<>
		<style>.row { color: red; }</style>
		<p class={style('row')}>{'p'}</p>
		<i class={style(theme.dark)}>{'i'}</i>
	</>
}`,
				'style-class.tsrx',
				options,
			);
			const hash = hashOf(code);
			expect(code).not.toMatch(/\bstyle\(/);
			expect(code.replace(/\\"/g, '"')).toContain(`class="${hash} row"`);
			expect(code).toContain(`"${hash} " + theme.dark`);
		},
	);

	it.each(MODES)('style(…) nested in an array class value resolves — %s', (_label, options) => {
		const { code } = compile(
			`export function D(props) @{
	<>
		<style>.a { color: red; } .b { color: blue; }</style>
		<i class={[style('a'), props.cond && style('b')]}>{'i'}</i>
	</>
}`,
			'style-nested.tsrx',
			options,
		);
		const hash = hashOf(code);
		expect(code).not.toMatch(/\bstyle\(/);
		expect(code).toMatch(new RegExp(`["']${hash} a["']`));
		expect(code).toMatch(new RegExp(`props\\.cond && ["']${hash} b["']`));
	});

	it.each(MODES)(
		'a template child hole {style(…)} resolves, its call argument does not — %s',
		(_label, options) => {
			const { code } = compile(
				`export function E(props) @{
	<>
		<style>.x { color: red; }</style>
		<p class="x">{style('x y')}</p>
		<b class="x">{props.render(style)}</b>
	</>
}`,
				'style-child.tsrx',
				options,
			);
			const hash = hashOf(code);
			expect(code).toContain(`${hash} x y`);
			expect(code).toContain('props.render(style)');
		},
	);
});
