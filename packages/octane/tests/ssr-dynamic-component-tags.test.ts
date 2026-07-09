import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';

// Dynamic JSX tags (`<Wrap/>` where Wrap is a local binding) whose RUNTIME value
// is a COMPONENT FUNCTION — the shape @octanejs/tanstack-router's Match pipeline uses for
// its conditional boundaries (`const SuspenseWrap = cond ? Suspense : SafeFragment;
// <SuspenseWrap fallback=…>…</SuspenseWrap>`). The host-STRING case is covered by
// ssr-host-string-tags.test.ts; these pin the function case, with children.

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

const mod = evalServer(
	`
	import { Suspense, createContext } from 'octane';

	const ctx = createContext(null);

	function PassThrough(props) @{
		<>
			{props.children}
		</>
	}
	export function StaticWrap() @{
		<PassThrough><span>static-wrap</span></PassThrough>
	}
	export function DynamicWrap() {
		const Wrap = PassThrough;
		return <Wrap><span>dynamic-wrap</span></Wrap>;
	}
	export function TemplateDynamicWrap() @{
		const Wrap = PassThrough;
		<Wrap><span>template-dynamic-wrap</span></Wrap>
	}
	export function DynamicSuspense() {
		const Wrap = Suspense;
		return <Wrap fallback={null}><span>dynamic-suspense</span></Wrap>;
	}
	export function DynamicChoice(props) {
		const Wrap = props.suspense ? Suspense : PassThrough;
		return <Wrap fallback={null}><span>dynamic-choice</span></Wrap>;
	}

	// REGRESSION (@octanejs/tanstack-router Match pipeline): a nested component whose
	// children are a DIRECTIVE BLOCK, one sub deep — ssrCompileBody used to reset
	// synthetic subs (@if branches, __schildren) to VALUE position, where
	// lowerJsxChild cannot lower an @if, so the nested component rendered
	// childless. The router's "MatchesInner > Provider > CatchBoundary >
	// @if { <Match/> }" chain hit exactly this and SSR'd every page empty.
	export function NestedDirectiveChildren(props) @{
		<PassThrough>
			<PassThrough>
				@if (props.on) {
					<span>nested-directive</span>
				}
			</PassThrough>
		</PassThrough>
	}
	export function ProviderDirectiveChildren(props) @{
		<ctx.Provider value={1}>
			<PassThrough>
				@if (props.on) {
					<span>provider-directive</span>
				}
			</PassThrough>
		</ctx.Provider>
	}
	export function MixedDirectiveChildren(props) @{
		<ctx.Provider value={1}>
			<PassThrough>
				<b>lead</b>
				@if (props.on) {
					<span>mixed-directive</span>
				}
			</PassThrough>
		</ctx.Provider>
	}
	`,
	'/test/ssr-dynamic-component-tags.tsrx',
);

describe('SSR dynamic component-function tags', () => {
	it('static component tag with children (control)', () => {
		expect(RT.renderToString(mod.StaticWrap).html).toContain('<span>static-wrap</span>');
	});

	it('dynamic tag resolving to a component function renders its children', () => {
		expect(RT.renderToString(mod.DynamicWrap).html).toContain('<span>dynamic-wrap</span>');
	});

	it('template-body dynamic component tag renders its children', () => {
		expect(RT.renderToString(mod.TemplateDynamicWrap).html).toContain(
			'<span>template-dynamic-wrap</span>',
		);
	});

	it('dynamic tag resolving to Suspense renders resolved children', () => {
		expect(RT.renderToString(mod.DynamicSuspense).html).toContain('<span>dynamic-suspense</span>');
	});

	it('conditionally-chosen wrapper (Suspense vs passthrough) renders children either way', () => {
		expect(RT.renderToString(mod.DynamicChoice, { suspense: true }).html).toContain(
			'<span>dynamic-choice</span>',
		);
		expect(RT.renderToString(mod.DynamicChoice, { suspense: false }).html).toContain(
			'<span>dynamic-choice</span>',
		);
	});
});

describe('SSR nested component with directive-block children (regression)', () => {
	it('component > component > @if children render one sub deep', () => {
		expect(RT.renderToString(mod.NestedDirectiveChildren, { on: true }).html).toContain(
			'<span>nested-directive</span>',
		);
		expect(RT.renderToString(mod.NestedDirectiveChildren, { on: false }).html).not.toContain(
			'nested-directive',
		);
	});

	it('Provider > component > @if children render', () => {
		expect(RT.renderToString(mod.ProviderDirectiveChildren, { on: true }).html).toContain(
			'<span>provider-directive</span>',
		);
	});

	it('element + @if siblings both render as nested children', () => {
		const html = RT.renderToString(mod.MixedDirectiveChildren, { on: true }).html;
		expect(html).toContain('<b>lead</b>');
		expect(html).toContain('<span>mixed-directive</span>');
	});
});
