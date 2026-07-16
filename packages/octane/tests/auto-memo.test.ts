import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { mount } from './_helpers';
import { AutoMemoApp } from './_fixtures/auto-memo.tsrx';

function trailingVersion(text: string | null): number {
	return Number(text?.match(/(\d+)$/)?.[1]);
}

function expectCompilerRegion(code: string): void {
	expect(code).toMatch(/const __memoCommitted[\w$]* = __s\.slots\._m\$\d+;/);
	expect(code).toMatch(/__s\.slots\[\d+\] === undefined \|\| __memoCache/);
	expect(code).toMatch(/__memoCache[\w$]*\[\d+\] !== \([^)]+\)/);
	expect(code).toMatch(
		/if \(__memoCache[\w$]* === __memoCommitted[\w$]*\) __memoCache[\w$]* = __memoCache[\w$]*\.slice\(\);/,
	);
	expect(code).toMatch(
		/if \(__memoCache[\w$]* !== __memoCommitted[\w$]*\) __s\.slots\._m\$\d+ = __memoCache[\w$]*;/,
	);
}

function expectNoCompilerRegion(code: string): void {
	expect(code).not.toContain('__memoCommitted');
	expect(code).not.toContain('compilerCacheContext');
}

describe('compiler-owned component-region memoization', () => {
	it('preserves dependency, context, child-state, and custom-comparator behavior', () => {
		const root = mount(AutoMemoApp);
		const initialOpaqueVersion = trailingVersion(root.find('.opaque').textContent);
		expect(root.find('.own-1').textContent).toBe('t0:a:0');
		expect(trailingVersion(root.find('.custom').textContent)).toBe(initialOpaqueVersion);
		expect(trailingVersion(root.find('.returned-opaque-a').textContent)).toBe(initialOpaqueVersion);

		root.click('#auto-tick');
		// Opaque imports, custom comparators, and imported return-JSX components all
		// retain ordinary parent-entry semantics when a module value changes.
		expect(trailingVersion(root.find('.opaque').textContent)).toBe(initialOpaqueVersion + 1);
		expect(trailingVersion(root.find('.custom').textContent)).toBe(initialOpaqueVersion + 1);
		expect(trailingVersion(root.find('.returned-opaque-a').textContent)).toBe(
			initialOpaqueVersion + 1,
		);

		root.click('.own-1');
		expect(root.find('.own-1').textContent).toBe('t0:a:1');

		root.click('#auto-context');
		expect(root.find('.own-1').textContent).toBe('t0!:a:1');
		expect(root.find('#auto-returned').textContent).toBe('returned t0!');

		root.click('#auto-item');
		expect(root.find('.own-1').textContent).toBe('t0!:a!:1');

		// A dependency miss and Provider change can commit in the same render. The
		// changed row re-enters through the keyed list, while the unchanged row must
		// still receive the context refresh despite its PURE survivor bailout.
		root.click('#auto-item-context');
		expect(root.find('.own-1').textContent).toBe('t0!!:a!!:1');
		expect(root.find('.own-2').textContent).toBe('t0!!:b:0');

		root.unmount();
	});

	it('emits the full memo boundary by default only for a production-safe call', () => {
		const source = `
			function Rows(props) @{
				<ul>@for (const item of props.items; key item.id) { <li>{item.label}</li> }</ul>
			}
			function Returned(props) { return <p>{props.label}</p>; }
			export function App(props) @{ <><Rows items={props.items} /><Returned label={props.label} /></> }
		`;
		const defaultBuild = compile(source, 'auto-memo-codegen.tsrx', { hmr: false }).code;
		const optedOut = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: false,
			autoMemo: false,
		}).code;
		const hmrBuild = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: 'vite',
			autoMemo: true,
		}).code;
		const devBuild = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: false,
			dev: true,
			autoMemo: true,
		}).code;
		const profileBuild = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: false,
			profile: true,
			autoMemo: true,
		}).code;
		const serverBuild = compile(source, 'auto-memo-codegen.tsrx', {
			mode: 'server',
			autoMemo: true,
		}).code;

		expectCompilerRegion(defaultBuild);
		expect(defaultBuild).toContain('componentSlotVoid as');
		expect(defaultBuild).toContain('componentSlot as');
		expect(defaultBuild).toMatch(/__memoCache[\w$]*\[\d+\] !== \(props\.items\)/);
		expect(defaultBuild).toMatch(/__memoCache[\w$]*\[\d+\] !== \(props\.label\)/);
		expect(defaultBuild).not.toMatch(/__memoCache[\w$]*\[\d+\] !== \(props\)/);
		expect(defaultBuild).toMatch(
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== \([^)]+\)\) \{ _\$componentSlotVoid\([^;\n]*, Rows,/,
		);
		expect(defaultBuild).toMatch(
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== \([^)]+\)\) \{ _\$componentSlot\([^;\n]*, Returned,/,
		);
		expectNoCompilerRegion(optedOut);
		expectNoCompilerRegion(hmrBuild);
		expectNoCompilerRegion(devBuild);
		expectNoCompilerRegion(profileBuild);
		expectNoCompilerRegion(serverBuild);

		const typed = compile(
			`import { type Foo, value } from './types';
			 function Child(props) @{ const x = props.x as Foo; <span>{x}</span> }
			 function App(props) @{ <Child x={props.x} /> }`,
			'auto-memo-types.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(typed);
		expect(typed).toContain('componentSlotVoid as');
		expect(typed).toMatch(
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== \([^)]+\)\) \{ _\$componentSlotVoid\([^;\n]*, Child,/,
		);
		expect(typed).not.toMatch(/__memoCache[\w$]*\[\d+\] !== \(Foo\)/);

		const shadowed = compile(
			`function Other() @{ <i>{'module component'}</i> }
			 function Child(props) @{ <span>{props.value}</span> }
			 function App(props) @{ const Other = props.value; <Child value={Other} /> }`,
			'auto-memo-shadow.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(shadowed);
		expect(shadowed).toMatch(
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== \(Other\)\) \{ _\$componentSlotVoid\([^;\n]*, Child, \{ "value": \(Other\) \}/,
		);

		const nestedDefaultMemo = compile(
			`import { memo } from 'octane';
			 function RowImpl(props) @{ <li>{props.value}</li> }
			 const Row = memo(RowImpl);
			 function Rows(props) @{ <ul><Row value={props.value} /></ul> }
			 function App(props) @{ <Rows value={props.value} /> }`,
			'auto-memo-nested-default.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(nestedDefaultMemo);
		expect(nestedDefaultMemo).toContain('componentSlotVoid as');
		expect(nestedDefaultMemo).toContain('compilerCacheContext as');
		expect(nestedDefaultMemo).toMatch(
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== \([^)]+\)\) \{ _\$componentSlotVoid\([^;\n]*, Rows,/,
		);

		const nestedCustomMemo = compile(
			`import { memo } from 'octane';
			 function RowImpl(props) @{ <li>{props.value}</li> }
			 const Row = memo(RowImpl, () => false);
			 function Rows(props) @{ <ul><Row value={props.value} /></ul> }
			 function App(props) @{ <Rows value={props.value} /> }`,
			'auto-memo-nested-custom.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(nestedCustomMemo);

		const transitiveCapture = compile(
			`import { live } from './live';
			 function Inner() @{ <span>{live}</span> }
			 function Wrapper() @{ <div><Inner /></div> }
			 function App() @{ <Wrapper /> }`,
			'auto-memo-transitive-capture.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expect(transitiveCapture.match(/__memoCache[\w$]*\[\d+\] !== \(live\)/g)).toHaveLength(2);
	});

	it('falls back for impure calls, refs, and direct Suspense boundaries', () => {
		const cases = [
			`function Child(props) @{ <div>{props.read()}</div> }`,
			`function Child(props) @{ delete props.source.value; <div /> }`,
			`function Child(props) @{ <div ref={props.refObj}>{props.value}</div> }`,
			`function Child(props) @{ <div>{props.refObj['current']}</div> }`,
			`function Child(props) @{ <div>{props.refObj[props.field]}</div> }`,
			`function Child(props) @{ const { current } = props.refObj; <div>{current}</div> }`,
			`import { memo } from 'octane'; function SinkImpl(props) @{ <span>{props.render()}</span> } const Sink = memo(SinkImpl); function Child(props) @{ <Sink render={() => props.refObj.current} /> }`,
			`function Child(props) @{ const box = { get value() { return props.source.current; } }; <div>{box.value}</div> }`,
			`function Child(props) @{ const box = { toString() { return props.source.current; } }; <div>{box as string}</div> }`,
			`import { Suspense } from 'octane'; function Child(props) @{ <Suspense fallback={null}>{props.value}</Suspense> }`,
			`import { ViewTransition as VT } from 'octane'; function Child(props) @{ <VT>{props.value}</VT> }`,
			`import { ErrorBoundary as Boundary } from 'octane'; function Child(props) @{ <Boundary fallback={null}>{props.value}</Boundary> }`,
			`let ambient = 'a'; function Child() @{ <div>{ambient}</div> }`,
		];
		for (const child of cases) {
			const code = compile(
				`${child}\nexport function App(props) @{ <Child value={props.value} read={props.read} refObj={props.refObj} source={props.source} /> }`,
				'auto-memo-fallback.tsrx',
				{ hmr: false, autoMemo: true },
			).code;
			expectNoCompilerRegion(code);
		}

		const nonlocalCallSites = [
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ <Child value={props.enabled && props.data.value} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ <Child value={props.enabled ? props.data.value : 'off'} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ <Child value={props.data?.value} /> }`,
			`import { createContext, useContext } from 'octane'; const Context = createContext('a'); function Consumer() @{ const value = useContext(Context); <span>{value}</span> } function Sink(props) @{ <div>{props.icon}</div> } function App() @{ <Sink icon={<Consumer />} /> }`,
			`let ambient = 'a'; function Child(props) @{ <div>{props.value}</div> } function App() @{ <Child value={ambient} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App() @{ <Child value={window.value} /> }`,
			`import * as live from './live'; function Child() @{ <div>{live.value}</div> } function App() @{ <Child /> }`,
			`import * as live from './live'; function Child(props) @{ <div>{props.value}</div> } function App() @{ const ns = live; <Child value={ns.value} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ const value = props.refObj.current; <Child value={value} /> }`,
			`import { cell } from './live'; function Child(props) @{ <div>{props.value}</div> } function App() @{ <Child value={cell.value} /> }`,
			`import { cell } from './live'; function Child(props) @{ <div>{props.value}</div> } function App() @{ const value = cell.value; <Child value={value} /> }`,
			`import { cell } from './live'; function Child() @{ <div>{cell.value}</div> } function App() @{ <Child /> }`,
		];
		for (const source of nonlocalCallSites) {
			const code = compile(source, 'auto-memo-nonlocal.tsrx', {
				hmr: false,
				autoMemo: true,
			}).code;
			expectNoCompilerRegion(code);
		}

		const transitiveImpurity = compile(
			`let count = 0;
			 function Impure() @{ count++; <span>{count as string}</span> }
			 function Wrapper() @{ <div><Impure /></div> }
			 function App() @{ <Wrapper /> }`,
			'auto-memo-transitive.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(transitiveImpurity);

		const destructuringDefault = compile(
			`import { fallback } from './live';
			 function Rows(props) @{
				<ul>@for (const &{ label = fallback } of props.items; key label) { <li>{label}</li> }</ul>
			 }
			 function App(props) @{ <Rows items={props.items} /> }`,
			'auto-memo-binding-default.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(destructuringDefault);

		const computedBinding = compile(
			`import { field } from './live';
			 function Child(props) @{ const { [field]: value } = props.source; <span>{value}</span> }
			 function App(props) @{ <Child source={props.source} /> }`,
			'auto-memo-computed-binding.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(computedBinding);

		const dynamicImport = compile(
			`function Child() @{ const promise = import('./lazy'); <span>{promise as string}</span> }
			 function App() @{ <Child /> }`,
			'auto-memo-dynamic-import.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(dynamicImport);
	});
});
