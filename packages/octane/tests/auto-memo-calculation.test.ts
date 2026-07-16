import { describe, expect, it } from 'vitest';
import { parseModule } from '@tsrx/core';
import { compile } from 'octane/compiler';

const SOURCE = `
	import { buildRows } from './rows';
	export function App(props) @{
		const rows = buildRows(props.items);
		<ul>{rows}</ul>
	}
`;

function expectDirectCalculation(code: string, call: string): void {
	expect(code).toContain(`const rows = ${call};`);
	expect(code).not.toContain('__memoCommitted');
	expect(code).not.toContain('compilerCacheContext');
}

function expectFlatCalculationCache(code: string): void {
	// The calculation cache is compiler-owned state on the render scope. It
	// snapshots the live helper and its argument once, copies the committed cell
	// before a miss writes it, and publishes only after the output region ran.
	expect(code).toMatch(/const __memoCommitted[\w$]* = __s\.slots\._m\$\d+;/);
	expect(code).toMatch(
		/let __memoCache[\w$]* = __memoCommitted[\w$]* === undefined \? \[\] : __memoCommitted[\w$]*;/,
	);
	expect(code).toMatch(/const rows = \(\(\) => \{/);
	expect(code).toMatch(/const __memoDep\d+ = buildRows;/);
	expect(code).toMatch(/const __memoDep\d+ = props\.items;/);
	expect(code).toMatch(/__memoCache[\w$]*\[\d+\] !== __memoDep\d+/);
	expect(code).toMatch(
		/if \(__memoCache[\w$]*\[\d+\] !== true[\s\S]*?\) \{\s*const __memoValue[\w$]* = __memoDep\d+\(__memoDep\d+\);/,
	);
	expect(code).toMatch(
		/if \(__memoCache[\w$]* === __memoCommitted[\w$]*\) __memoCache[\w$]* = __memoCache[\w$]*\.slice\(\);/,
	);
	expect(code).toMatch(
		/if \(__memoCache[\w$]* !== __memoCommitted[\w$]*\) __s\.slots\._m\$\d+ = __memoCache[\w$]*;/,
	);
	expect(code).toContain('childTextHole as');
	expect(code).toContain('compilerCacheContext as');
	expect(code).toMatch(
		/if \(__memoCache[\w$]*\[\d+\] !== true \|\| __memoCache[\w$]*\[\d+\] !== \(_v\)\) \{[^\n]*_\$childTextHole\(/,
	);
	expect(code).not.toMatch(/\buseMemo as /);
}

describe('compiler-owned render calculations', () => {
	it('caches imported render calculations and their output by default in production', () => {
		const code = compile(SOURCE, 'auto-memo-calculation.tsrx', { hmr: false }).code;

		// The output shape is the optimization contract: unchanged inputs must skip
		// both the imported calculation and the renderable output region.
		expectFlatCalculationCache(code);
		expect(code).not.toContain('const rows = buildRows(props.items);');
	});

	it('keeps authored render evaluation in observable compiler modes and when opted out', () => {
		const builds = [
			compile(SOURCE, 'auto-memo-calculation-disabled.tsrx', {
				hmr: false,
				autoMemo: false,
			}).code,
			compile(SOURCE, 'auto-memo-calculation-dev.tsrx', {
				hmr: false,
				dev: true,
				autoMemo: true,
			}).code,
			compile(SOURCE, 'auto-memo-calculation-hmr.tsrx', {
				hmr: 'vite',
				autoMemo: true,
			}).code,
			compile(SOURCE, 'auto-memo-calculation-profile.tsrx', {
				hmr: false,
				profile: true,
				autoMemo: true,
			}).code,
			compile(SOURCE, 'auto-memo-calculation-server.tsrx', {
				mode: 'server',
				autoMemo: true,
			}).code,
		];

		for (const code of builds) {
			expectDirectCalculation(code, 'buildRows(props.items)');
		}
	});

	it('does not treat a shadowed imported callee as the module helper', () => {
		const code = compile(
			`
				import { buildRows } from './rows';
				export function App(props) @{
					const buildRows = props.buildRows;
					const rows = buildRows(props.items);
					<ul>{rows}</ul>
				}
			`,
			'auto-memo-calculation-callee-shadow.tsrx',
			{ hmr: false },
		).code;

		expectDirectCalculation(code, 'buildRows(props.items)');
	});

	it('keeps an authored useMemo binding separate from the compiler-owned cache', () => {
		const code = compile(
			`
				import { buildRows } from './rows';
				export function App(props) @{
					const useMemo = props.useMemo;
					const rows = buildRows(props.items);
					<ul data-observer={useMemo}>{rows}</ul>
				}
			`,
			'auto-memo-calculation-use-memo-shadow.tsrx',
			{ hmr: false },
		).code;

		expect(code).toContain('const useMemo = props.useMemo;');
		expectFlatCalculationCache(code);
		expect(code).not.toMatch(/\buseMemo as /);
	});

	it('keeps calculations live for ambient values, refs, state getters, and setup escapes', () => {
		const cases = [
			{
				name: 'ambient',
				source: `
					import { buildRows } from './rows';
					let currentItems = [];
					export function App() @{
						const rows = buildRows(currentItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(currentItems)',
			},
			{
				name: 'ref',
				source: `
					import { useRef } from 'octane';
					import { buildRows } from './rows';
					export function App(props) @{
						const itemsRef = useRef(props.items);
						const rows = buildRows(itemsRef.current);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(itemsRef.current)',
			},
			{
				name: 'ref-destructure',
				source: `
					import { useRef } from 'octane';
					import { buildRows } from './rows';
					export function App(props) @{
						const { current: store } = useRef(props.store);
						const rows = buildRows(store);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(store)',
			},
			{
				name: 'state-getter',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const [, , getItems] = useState([]);
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'state-getter-at',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const tuple = useState([]);
						const getItems = tuple.at(2);
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'state-getter-direct-object-pattern',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const { 2: getItems } = useState([]);
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'state-getter-rest',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const [value, ...rest] = useState([]);
						const getItems = rest[1];
						const rows = buildRows(getItems);
						<ul data-value={value}>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'state-getter-default',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const [, , getItems = (() => [])] = useState([]);
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'state-getter-object-pattern',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const tuple = useState([]);
						const { 2: getItems } = tuple;
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'state-getter-spread',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const tuple = useState([]);
						const getItems = [...tuple][2];
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'ref-callback',
				source: `
					import { useRef } from 'octane';
					import { buildRows } from './rows';
					export function App(props) @{
						const itemsRef = useRef(props.items);
						itemsRef.current = props.items;
						const readItems = () => itemsRef.current;
						const rows = buildRows(readItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(readItems)',
			},
			{
				name: 'explicit-callback',
				source: `
					import { useCallback } from 'octane';
					import { buildRows } from './rows';
					export function App(props) @{
						const readItems = useCallback(() => props.items, [props.items]);
						const rows = buildRows(readItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(readItems)',
			},
			{
				name: 'custom-hook-getter',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					function useItemsGetter() {
						const [, , getItems] = useState([]);
						return getItems;
					}
					export function App() @{
						const getItems = useItemsGetter();
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'computed-custom-hook-getter',
				source: `
					import { buildRows } from './rows';
					import * as hooks from './hooks';
					export function App(props) @{
						const getItems = hooks['useItemsGetter']();
						const rows = buildRows(getItems, props.items);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems, props.items)',
			},
			{
				name: 'unknown-call-result',
				source: `
					import { buildRows } from './rows';
					export function App(props) @{
						const getItems = props.makeGetter();
						const rows = buildRows(getItems, props.items);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems, props.items)',
			},
			{
				name: 'assigned-state-getter',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const [, , getItems] = useState([]);
						let readItems;
						readItems = getItems;
						const rows = buildRows(readItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(readItems)',
			},
			{
				name: 'assigned-tuple-getter',
				source: `
					import { useState } from 'octane';
					import { buildRows } from './rows';
					export function App() @{
						const tuple = useState([]);
						let getItems;
						[, , getItems] = tuple;
						const rows = buildRows(getItems);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(getItems)',
			},
			{
				name: 'setup-escape',
				source: `
					import { buildRows } from './rows';
					export function App(props) @{
						const rows = buildRows(props.items);
						props.observe(rows);
						<ul>{rows}</ul>
					}
				`,
				call: 'buildRows(props.items)',
			},
		];

		for (const testCase of cases) {
			const code = compile(testCase.source, `auto-memo-calculation-${testCase.name}.tsrx`, {
				hmr: false,
			}).code;
			expectDirectCalculation(code, testCase.call);
		}
	});

	it('carries cached output through a directive helper', () => {
		const code = compile(
			`
				import { buildRows } from './rows';
				export function App(props) @{
					const rows = buildRows(props.items);
					@if (props.show) { <ul>{rows}</ul> }
				}
			`,
			'auto-memo-calculation-directive.tsrx',
			{ hmr: false },
		).code;

		expectFlatCalculationCache(code);
		// One cache owns the imported calculation; a distinct cache in the hoisted
		// directive arm owns the renderable output region that captures `rows`.
		expect(code.match(/const __memoCommitted[\w$]* = __s\.slots\._m\$\d+;/g)?.length).toBe(2);
	});

	it('does not leak a memo tag into a directive arm that shadows the cached value', () => {
		const code = compile(
			`
				import { buildRows } from './rows';
				export function App(props) @{
					const rows = buildRows(props.items);
					@if (props.show) {
						const rows = props.other;
						<ul>{rows}</ul>
					} @else {
						<ol>{rows}</ol>
					}
				}
			`,
			'auto-memo-calculation-directive-shadow.tsrx',
			{ hmr: false },
		).code;

		expect(() => parseModule(code, 'auto-memo-calculation-directive-shadow.js')).not.toThrow();
		const shadowStart = code.indexOf('const rows = props.other;');
		const nextHelper = code.indexOf('\nfunction ', shadowStart + 1);
		const appStart = code.indexOf('\nexport const ', nextHelper + 1);
		expect(shadowStart).toBeGreaterThan(-1);
		expect(nextHelper).toBeGreaterThan(shadowStart);
		expect(appStart).toBeGreaterThan(nextHelper);
		expect(code.slice(shadowStart, nextHelper)).not.toContain('__memoCommitted');
		expect(code.slice(nextHelper, appStart)).toContain('__memoCommitted');
	});

	it('publishes a changed cache only after later output regions complete', () => {
		const code = compile(
			`
				import { buildRows, LaterSibling } from './rows';
				export function App(props) @{
					const rows = buildRows(props.items);
					<>
						<ul>{rows}</ul>
						<LaterSibling value={props.value} />
					</>
				}
			`,
			'auto-memo-calculation-late-failure.tsrx',
			{ hmr: false },
		).code;

		const laterSibling = code.lastIndexOf(', LaterSibling,');
		const finalPublish = code.search(
			/if \(__memoCache[\w$]* !== __memoCommitted[\w$]*\) __s\.slots\._m\$\d+ = __memoCache[\w$]*;/,
		);
		expect(laterSibling).toBeGreaterThan(-1);
		expect(finalPublish).toBeGreaterThan(laterSibling);
	});
});
