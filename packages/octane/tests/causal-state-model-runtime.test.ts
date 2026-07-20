import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import * as ClientRuntime from '../src/index.js';
import * as ServerRuntime from '../src/server/index.js';
import * as UniversalRuntime from '../src/universal.js';
import { evaluateCompiledModule } from './_compiled-module.js';
import { flushEffects, mount } from './_helpers.js';

const CLIENT_CAUSAL_SOURCE = `
import { useEffect, useReducer, useState } from 'octane';

export function OpaqueStateWrite(props) @{
	const [count, setCount] = useState(0);
	props.write(setCount);
	<span>{'Count: ' + count}</span>
}

export function OpaqueReducerWrite(props) @{
	const [count, dispatch] = useReducer((state, action) => {
		props.onReducer();
		return state + action;
	}, 0);
	props.write(dispatch);
	<span>{'Count: ' + count}</span>
}

export function EventWrite() @{
	const [count, setCount] = useState(0);
	<button id="increment" onClick={() => setCount((value) => value + 1)}>{'Count: ' + count}</button>
}

export function LaterWrite(props) @{
	const [count, setCount] = useState(0);
	props.capture(setCount);
	<span id="later">{'Count: ' + count}</span>
}

export function EffectWrite() @{
	const [count, setCount] = useState(0);
	useEffect(() => {
		if (count === 0) setCount(1);
	}, [count]);
	<span id="effect">{'Count: ' + count}</span>
}
`;

const PERMISSIVE_SOURCE = `
import { useState } from 'octane';

export function RenderWrite() @{
	const [count, setCount] = useState(0);
	if (count === 0) setCount(1);
	<span id="permissive">{'Count: ' + count}</span>
}
`;

const SERVER_CAUSAL_SOURCE = `
import { useReducer, useState } from 'octane';

export function OpaqueStateWrite(props) @{
	const [count, setCount] = useState(0);
	props.write(setCount);
	<span>{'Count: ' + count}</span>
}

export function OpaqueReducerWrite(props) @{
	const [count, dispatch] = useReducer((state, action) => {
		props.onReducer();
		return state + action;
	}, 0);
	props.write(dispatch);
	<span>{'Count: ' + count}</span>
}

export function LaterWrite(props) @{
	const [count, setCount] = useState(0);
	props.capture(setCount);
	<span>{'Count: ' + count}</span>
}
`;

const UNIVERSAL_CAUSAL_SOURCE = `
import { useReducer, useState } from 'octane/universal';

export function OpaqueStateWrite(props) @{
	const [count, setCount] = useState(0);
	props.write(setCount);
	<scene count={count} />
}

export function OpaqueReducerWrite(props) @{
	const [count, dispatch] = useReducer((state, action) => {
		props.onReducer();
		return state + action;
	}, 0);
	props.write(dispatch);
	<scene count={count} />
}

export function EventWrite() @{
	const [count, setCount] = useState(0);
	<scene count={count} onFire={() => setCount((value) => value + 1)} />
}

export function LaterWrite(props) @{
	const [count, setCount] = useState(0);
	props.capture(setCount);
	<scene count={count} />
}
`;

const causalWriteError =
	/causal state model does not allow a state update while a component is rendering/i;
const causalAnyWriteError = /causal state model does not allow a state update while/i;

function evaluateClient(source: string, stateModel: 'causal' | 'permissive') {
	const result = compile(source, `/src/client-${stateModel}.tsrx`, {
		stateModel,
		hmr: false,
		dev: true,
		autoMemo: false,
	});
	return {
		...result,
		module: evaluateCompiledModule(result.code, { octane: ClientRuntime }),
	};
}

function evaluateServer(
	source: string,
	stateModel: 'causal' | 'permissive',
	modules: Record<string, any> = {},
) {
	const result = compile(source, `/src/server-${stateModel}.tsrx`, {
		stateModel,
		mode: 'server',
		dev: true,
	});
	return evaluateCompiledModule(result.code, {
		octane: ServerRuntime,
		'octane/server': ServerRuntime,
		...modules,
	});
}

function evaluateUniversal(
	source: string,
	stateModel: 'causal' | 'permissive',
	modules: Record<string, any> = {},
) {
	const result = compile(source, `/src/Scene-${stateModel}.object.tsrx`, {
		stateModel,
		hmr: false,
		dev: true,
		autoMemo: false,
		renderer: {
			id: 'object',
			module: 'octane/universal',
			target: 'universal',
		},
	});
	return evaluateCompiledModule(result.code, {
		octane: UniversalRuntime,
		'octane/universal': UniversalRuntime,
		...modules,
	});
}

function createUniversalRoot() {
	const container = UniversalRuntime.createObjectContainer();
	const root = UniversalRuntime.createUniversalRoot(
		container,
		UniversalRuntime.createObjectDriver(),
	);
	return { container, root };
}

describe('causal state model — DOM runtime', () => {
	it('rejects an opaque render-time state write before evaluating its updater', () => {
		const { module } = evaluateClient(CLIENT_CAUSAL_SOURCE, 'causal');
		let updaterRuns = 0;

		expect(() =>
			mount(module.OpaqueStateWrite, {
				write(setCount: (update: (value: number) => number) => void) {
					setCount((value) => {
						updaterRuns++;
						return value;
					});
				},
			}),
		).toThrow(causalWriteError);
		expect(updaterRuns).toBe(0);
	});

	it('rejects an opaque render-time dispatch before evaluating its reducer', () => {
		const { module } = evaluateClient(CLIENT_CAUSAL_SOURCE, 'causal');
		let reducerRuns = 0;

		expect(() =>
			mount(module.OpaqueReducerWrite, {
				onReducer() {
					reducerRuns++;
				},
				write(dispatch: (action: number) => void) {
					dispatch(1);
				},
			}),
		).toThrow(causalWriteError);
		expect(reducerRuns).toBe(0);
	});

	it('enforces the same guard during the hydration adoption pass', () => {
		const { module } = evaluateClient(CLIENT_CAUSAL_SOURCE, 'causal');
		const container = document.createElement('div');
		container.innerHTML = '<span>Count: 0</span>';
		document.body.appendChild(container);
		let updaterRuns = 0;
		try {
			expect(() =>
				ClientRuntime.hydrateRoot(container, module.OpaqueStateWrite, {
					write(setCount: (update: (value: number) => number) => void) {
						setCount((value) => {
							updaterRuns++;
							return value;
						});
					},
				}),
			).toThrow(causalWriteError);
			expect(updaterRuns).toBe(0);
		} finally {
			container.remove();
		}
	});

	it('allows event and later-callback transitions after render', () => {
		const { module } = evaluateClient(CLIENT_CAUSAL_SOURCE, 'causal');
		const event = mount(module.EventWrite);
		event.click('#increment');
		expect(event.find('#increment').textContent).toBe('Count: 1');
		event.unmount();

		let setLater!: (update: (value: number) => number) => void;
		const later = mount(module.LaterWrite, {
			capture(setCount: typeof setLater) {
				setLater = setCount;
			},
		});
		ClientRuntime.flushSync(() => setLater((value) => value + 1));
		expect(later.find('#later').textContent).toBe('Count: 1');
		later.unmount();
	});

	it('keeps effect writes operational while they remain report-only', () => {
		const compiled = evaluateClient(CLIENT_CAUSAL_SOURCE, 'causal');
		expect(compiled.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'OCTANE_CAUSAL_STATE_EFFECT_WRITE',
					reportOnly: true,
				}),
			]),
		);
		const rendered = mount(compiled.module.EffectWrite);
		flushEffects();
		ClientRuntime.flushSync(() => {});
		flushEffects();
		expect(rendered.find('#effect').textContent).toBe('Count: 1');
		rendered.unmount();
	});

	it('preserves converging render writes in the permissive model', () => {
		const { module } = evaluateClient(PERMISSIVE_SOURCE, 'permissive');
		const rendered = mount(module.RenderWrite);
		expect(rendered.find('#permissive').textContent).toBe('Count: 1');
		rendered.unmount();
	});

	it('does not inherit an outer render guard in cleanup or ref-detach callbacks', () => {
		const lifecycle = evaluateClient(
			`import { useLayoutEffect, useState } from 'octane';

function Child(props) @{
	useLayoutEffect(() => () => props.onCleanup(), []);
	<div ref={props.onRef} />
}

export function Parent(props) @{
	const [visible, setVisible] = useState(true);
	const [callbacks, setCallbacks] = useState(0);
	<>
		<button id="hide" onClick={() => setVisible(false)}>Hide</button>
		@if (visible) {
			<Child
				onCleanup={() => props.update(setCallbacks)}
				onRef={(value) => value === null && props.update(setCallbacks)}
			/>
		}
		<span id="lifecycle-count">{'Callbacks: ' + callbacks}</span>
	</>
}`,
			'causal',
		);
		const parent = mount(lifecycle.module.Parent, {
			update(setCount: (update: (value: number) => number) => void) {
				setCount((value) => value + 1);
			},
		});

		try {
			expect(() => parent.click('#hide')).not.toThrow();
			expect(parent.find('#lifecycle-count').textContent).toBe('Callbacks: 2');
		} finally {
			parent.unmount();
		}
	});

	it('does not inherit an outer render guard in an effect setup callback', () => {
		const nested = evaluateClient(
			`import { useLayoutEffect, useState } from 'octane';

export function NestedEffect(props) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.write(setCount);
	}, []);
	<span id="nested-effect">{'Count: ' + count}</span>
}`,
			'causal',
		);
		const outer = evaluateClient(
			`export function OuterRender(props) @{
	props.mountNested();
	<span id="outer-render">Outer</span>
}`,
			'causal',
		);
		let nestedRoot: ReturnType<typeof mount> | null = null;
		let updaterRuns = 0;
		const rendered = mount(outer.module.OuterRender, {
			mountNested() {
				nestedRoot = mount(nested.module.NestedEffect, {
					write(setCount: (update: (value: number) => number) => void) {
						setCount((value) => {
							updaterRuns++;
							return value;
						});
					},
				});
			},
		});

		try {
			expect(nestedRoot).not.toBeNull();
			expect(updaterRuns).toBe(1);
			expect(nestedRoot!.find('#nested-effect').textContent).toBe('Count: 0');
		} finally {
			nestedRoot?.unmount();
			rendered.unmount();
		}
	});
});

describe('causal state model — memo provenance', () => {
	function evaluateMemoStateDependency() {
		const result = compile(
			`import { useState } from 'octane';
export function usePackageState() {
	return useState(0);
}`,
			'/node_modules/memo-state/index.ts',
			{ stateModel: 'permissive', hmr: false, dev: true, autoMemo: false },
		);
		return evaluateCompiledModule(result.code, { octane: ClientRuntime });
	}

	function evaluateMemoDependency(stateModel: 'causal' | 'permissive') {
		const result = compile(
			`import { memo } from 'octane';
function Base(props) @{
	<span>{'Version: ' + props.version}</span>
}
export const MemoChild = memo(Base, (previous, next) => {
	next.compare();
	return false;
});`,
			`/node_modules/memo-${stateModel}/index.tsrx`,
			{ stateModel, hmr: false, dev: true, autoMemo: false },
		);
		return evaluateCompiledModule(result.code, { octane: ClientRuntime });
	}

	function evaluateMemoParent(
		stateModel: 'causal' | 'permissive',
		memoDependency: Record<string, any>,
		stateDependency: Record<string, any>,
	) {
		const result = compile(
			`import { MemoChild } from 'memo-package';
import { usePackageState } from 'state-package';
export function Parent(props) @{
	const [count, setCount] = usePackageState();
	<>
		<MemoChild
			version={props.version}
			compare={() => props.compare(setCount)}
		/>
		<span id="memo-count">{'Count: ' + count}</span>
	</>
}`,
			`/src/memo-parent-${stateModel}.tsrx`,
			{ stateModel, hmr: false, dev: true, autoMemo: false },
		);
		return evaluateCompiledModule(result.code, {
			octane: ClientRuntime,
			'memo-package': memoDependency,
			'state-package': stateDependency,
		});
	}

	it('lets a permissive comparator update a permissive cell under a causal parent', () => {
		const dependency = evaluateMemoDependency('permissive');
		const stateDependency = evaluateMemoStateDependency();
		const parentModule = evaluateMemoParent('causal', dependency, stateDependency);
		const compare = (setCount: (value: number) => void) => setCount(1);
		const parent = mount(parentModule.Parent, { version: 0, compare });

		try {
			expect(() => parent.update(parentModule.Parent, { version: 1, compare })).not.toThrow();
			expect(parent.find('#memo-count').textContent).toBe('Count: 1');
		} finally {
			parent.unmount();
		}
	});

	it('rejects a causal comparator write under a permissive parent', () => {
		const dependency = evaluateMemoDependency('causal');
		const stateDependency = evaluateMemoStateDependency();
		const parentModule = evaluateMemoParent('permissive', dependency, stateDependency);
		const compare = (setCount: (value: number) => void) => setCount(0);
		const parent = mount(parentModule.Parent, { version: 0, compare });

		try {
			expect(() => parent.update(parentModule.Parent, { version: 1, compare })).toThrow(
				causalAnyWriteError,
			);
		} finally {
			parent.unmount();
		}
	});
});

describe('causal state model — package boundary provenance', () => {
	function evaluateStateHook(stateModel: 'causal' | 'permissive') {
		const result = compile(
			`import { useState } from 'octane';\nexport function usePackageState() { return useState(0); }`,
			`/node_modules/state-${stateModel}/index.ts`,
			{ stateModel, hmr: false, dev: true, autoMemo: false },
		);
		return evaluateCompiledModule(result.code, { octane: ClientRuntime });
	}

	function evaluateHookConsumer(
		stateModel: 'causal' | 'permissive',
		dependency: Record<string, any>,
	) {
		const result = compile(
			`import { usePackageState } from 'state-package';
export function Consumer(props) @{
	const [count, setCount] = usePackageState();
	props.write(setCount);
	<span>{'Count: ' + count}</span>
}`,
			`/src/consumer-${stateModel}.tsrx`,
			{ stateModel, hmr: false, dev: true, autoMemo: false },
		);
		return evaluateCompiledModule(result.code, {
			octane: ClientRuntime,
			'state-package': dependency,
		});
	}

	function evaluateComponentDependency(stateModel: 'causal' | 'permissive') {
		const result = compile(
			`import { useState } from 'octane';
export function Child(props) @{
	const [count, setCount] = useState(0);
	props.write(setCount);
	<span id="package-child">{'Count: ' + count}</span>
}`,
			`/node_modules/component-${stateModel}/index.tsrx`,
			{ stateModel, hmr: false, dev: true, autoMemo: false },
		);
		return evaluateCompiledModule(result.code, { octane: ClientRuntime });
	}

	function evaluateComponentParent(
		stateModel: 'causal' | 'permissive',
		dependency: Record<string, any>,
	) {
		const result = compile(
			`import { Child } from 'component-package';
export function Parent(props) @{
	<Child write={props.write} />
}`,
			`/src/component-parent-${stateModel}.tsrx`,
			{ stateModel, hmr: false, dev: true, autoMemo: false },
		);
		return evaluateCompiledModule(result.code, {
			octane: ClientRuntime,
			'component-package': dependency,
		});
	}

	it('rejects a causal cell write from a permissive component render', () => {
		const dependency = evaluateStateHook('causal');
		const consumer = evaluateHookConsumer('permissive', dependency);

		expect(() =>
			mount(consumer.Consumer, {
				write(setCount: (value: number) => void) {
					setCount(0);
				},
			}),
		).toThrow(causalWriteError);
	});

	it('rejects a permissive cell write from a causal component render', () => {
		const dependency = evaluateStateHook('permissive');
		const consumer = evaluateHookConsumer('causal', dependency);

		expect(() =>
			mount(consumer.Consumer, {
				write(setCount: (value: number) => void) {
					setCount(0);
				},
			}),
		).toThrow(causalWriteError);
	});

	it('rejects a permissive cell write from a lowercase createElement component', () => {
		const dependency = evaluateStateHook('permissive');
		const result = compile(
			`import { createElement as h } from 'octane';
import { usePackageState } from 'state-package';
const child = (props) => {
	props.write();
	return null;
};
export function Parent() {
	const [, setCount] = usePackageState();
	return h(child, { write: () => setCount(0) });
}`,
			'/src/create-element-parent.tsx',
			{ stateModel: 'causal', hmr: false, dev: true, autoMemo: false },
		);
		const parent = evaluateCompiledModule(result.code, {
			octane: ClientRuntime,
			'state-package': dependency,
		});

		expect(() => mount(parent.Parent)).toThrow(causalWriteError);
	});

	it('lets an approved permissive child update its own permissive cell', () => {
		const dependency = evaluateComponentDependency('permissive');
		const parent = evaluateComponentParent('causal', dependency);
		const rendered = mount(parent.Parent, {
			write(setCount: (value: number) => void) {
				setCount(1);
			},
		});

		expect(rendered.find('#package-child').textContent).toBe('Count: 1');
		rendered.unmount();
	});

	it('rejects a causal child write under a permissive parent', () => {
		const dependency = evaluateComponentDependency('causal');
		const parent = evaluateComponentParent('permissive', dependency);

		expect(() =>
			mount(parent.Parent, {
				write(setCount: (value: number) => void) {
					setCount(0);
				},
			}),
		).toThrow(causalWriteError);
	});

	it.each([
		[
			'conditional',
			`@if (props.enabled) {
		<span>{props.write(setCount) as string}</span>
	}`,
			{ enabled: true },
		],
		[
			'keyed list',
			`@for (const item of props.items; key item) {
		<span>{props.write(setCount) as string}</span>
	}`,
			{ items: [1] },
		],
	])('preserves causal source provenance through a %s block', (_label, body, props) => {
		const dependency = evaluateStateHook('permissive');
		const result = compile(
			`import { usePackageState } from 'state-package';
export function StructuralWrite(props) @{
	const [, setCount] = usePackageState();
	${body}
}`,
			'/src/structural-write.tsrx',
			{ stateModel: 'causal', hmr: false, dev: true, autoMemo: false },
		);
		const module = evaluateCompiledModule(result.code, {
			octane: ClientRuntime,
			'state-package': dependency,
		});

		expect(() =>
			mount(module.StructuralWrite, {
				...props,
				write(setCount: (value: number) => void) {
					setCount(0);
					return '';
				},
			}),
		).toThrow(causalWriteError);
	});
});

describe('causal state model — staged callback provenance ABI', () => {
	type RendererKind = 'client' | 'universal';
	type StateModel = 'causal' | 'permissive';

	function evaluateCallbackHooks(renderer: RendererKind, stateModel: StateModel) {
		const runtimeImport = renderer === 'client' ? 'octane' : 'octane/universal';
		const result = compile(
			`import { useReducer, useState } from '${runtimeImport}';
export function usePackageState() {
	return useState(0);
}
export function usePackageReducer(reducer) {
	return useReducer(reducer, 0);
}`,
			`/node_modules/callback-${renderer}-${stateModel}/index.ts`,
			{
				stateModel,
				hmr: false,
				dev: true,
				autoMemo: false,
				...(renderer === 'universal'
					? {
							renderer: {
								id: 'object',
								module: 'octane/universal',
								target: 'universal' as const,
							},
						}
					: null),
			},
		);
		return evaluateCompiledModule(result.code, {
			octane: renderer === 'client' ? ClientRuntime : UniversalRuntime,
			'octane/universal': UniversalRuntime,
		});
	}

	function evaluateCallbackConsumer(
		renderer: RendererKind,
		stateModel: StateModel,
		outer: Record<string, any>,
		nested: Record<string, any>,
	) {
		const output =
			renderer === 'client'
				? `<span id={props.id}>{outer + ':' + nested}</span>`
				: `<scene outer={outer} nested={nested} />`;
		const result = compile(
			`import {
	usePackageReducer as useOuterReducer,
	usePackageState as useOuterState,
} from 'outer-state';
import { usePackageState as useNestedState } from 'nested-state';

export function UpdaterCase(props) @{
	const [outer, setOuter] = useOuterState();
	const [nested, setNested] = useNestedState();
	props.capture(() => setOuter((value) => {
		setNested(1);
		return value + 1;
	}));
	${output}
}

export function ReducerCase(props) @{
	const [nested, setNested] = useNestedState();
	const [outer, dispatch] = useOuterReducer((value, action) => {
		setNested(1);
		return value + action;
	});
	props.capture(() => dispatch(1));
	${output}
}`,
			`/${stateModel}-${renderer}-callback-consumer.${renderer === 'client' ? '' : 'object.'}tsrx`,
			{
				stateModel,
				hmr: false,
				dev: true,
				autoMemo: false,
				...(renderer === 'universal'
					? {
							renderer: {
								id: 'object',
								module: 'octane/universal',
								target: 'universal' as const,
							},
						}
					: null),
			},
		);
		return evaluateCompiledModule(result.code, {
			octane: renderer === 'client' ? ClientRuntime : UniversalRuntime,
			'octane/universal': UniversalRuntime,
			'outer-state': outer,
			'nested-state': nested,
		});
	}

	function exerciseClientCallback(
		module: Record<string, any>,
		component: 'UpdaterCase' | 'ReducerCase',
		expected: 'allow' | 'reject',
	): void {
		let invoke!: () => void;
		const rendered = mount(module[component], {
			id: 'callback-result',
			capture(callback: () => void) {
				invoke = callback;
			},
		});
		try {
			const run = () => ClientRuntime.flushSync(invoke);
			if (expected === 'reject') {
				expect(run).toThrow(causalAnyWriteError);
				expect(rendered.find('#callback-result').textContent).toBe('0:0');
			} else {
				expect(run).not.toThrow();
				expect(rendered.find('#callback-result').textContent).toBe('1:1');
			}
		} finally {
			rendered.unmount();
		}
	}

	function exerciseUniversalCallback(
		module: Record<string, any>,
		component: 'UpdaterCase' | 'ReducerCase',
		expected: 'allow' | 'reject',
	): void {
		let invoke!: () => void;
		const rendered = createUniversalRoot();
		rendered.root.render(module[component], {
			capture(callback: () => void) {
				invoke = callback;
			},
		});
		try {
			const run = () => UniversalRuntime.flushUniversalSync(invoke);
			if (expected === 'reject') {
				expect(run).toThrow(causalAnyWriteError);
				expect(rendered.container.children[0].props).toMatchObject({ outer: 0, nested: 0 });
			} else {
				expect(run).not.toThrow();
				expect(rendered.container.children[0].props).toMatchObject({ outer: 1, nested: 1 });
			}
		} finally {
			rendered.root.unmount();
		}
	}

	it.each([
		['functional updater', 'UpdaterCase'],
		['reducer', 'ReducerCase'],
	] as const)(
		'uses the permissive DOM cell model for a causal %s until Callback Provenance ABI',
		(_label, component) => {
			const permissive = evaluateCallbackHooks('client', 'permissive');
			const module = evaluateCallbackConsumer('client', 'causal', permissive, permissive);
			// Callback Provenance ABI will attribute the callback to this causal module
			// and change this temporary owning-cell expectation from allow to reject.
			exerciseClientCallback(module, component, 'allow');
		},
	);

	it.each([
		['functional updater', 'UpdaterCase'],
		['reducer', 'ReducerCase'],
	] as const)(
		'uses the causal DOM cell model for a permissive %s until Callback Provenance ABI',
		(_label, component) => {
			const causal = evaluateCallbackHooks('client', 'causal');
			const permissive = evaluateCallbackHooks('client', 'permissive');
			const module = evaluateCallbackConsumer('client', 'permissive', causal, permissive);
			// Callback Provenance ABI will attribute the callback to this permissive
			// module and change this temporary owning-cell expectation from reject to allow.
			exerciseClientCallback(module, component, 'reject');
		},
	);

	it.each([
		['functional updater', 'UpdaterCase'],
		['reducer', 'ReducerCase'],
	] as const)(
		'uses the permissive universal cell model for a causal %s until Callback Provenance ABI',
		(_label, component) => {
			const permissive = evaluateCallbackHooks('universal', 'permissive');
			const module = evaluateCallbackConsumer('universal', 'causal', permissive, permissive);
			// Callback Provenance ABI will attribute the callback to this causal module
			// and change this temporary owning-cell expectation from allow to reject.
			exerciseUniversalCallback(module, component, 'allow');
		},
	);

	it.each([
		['functional updater', 'UpdaterCase'],
		['reducer', 'ReducerCase'],
	] as const)(
		'uses the causal universal cell model for a permissive %s until Callback Provenance ABI',
		(_label, component) => {
			const causal = evaluateCallbackHooks('universal', 'causal');
			const permissive = evaluateCallbackHooks('universal', 'permissive');
			const module = evaluateCallbackConsumer('universal', 'permissive', causal, permissive);
			// Callback Provenance ABI will attribute the callback to this permissive
			// module and change this temporary owning-cell expectation from reject to allow.
			exerciseUniversalCallback(module, component, 'reject');
		},
	);

	it.each([
		['client', 'functional updater', 'UpdaterCase'],
		['client', 'reducer', 'ReducerCase'],
		['universal', 'functional updater', 'UpdaterCase'],
		['universal', 'reducer', 'ReducerCase'],
	] as const)(
		'rejects a causal target written from a permissive %s %s purity callback',
		(renderer, _label, component) => {
			const permissive = evaluateCallbackHooks(renderer, 'permissive');
			const causal = evaluateCallbackHooks(renderer, 'causal');
			const module = evaluateCallbackConsumer(renderer, 'permissive', permissive, causal);
			if (renderer === 'client') {
				exerciseClientCallback(module, component, 'reject');
			} else {
				exerciseUniversalCallback(module, component, 'reject');
			}
		},
	);
});

describe('causal state model — cross-renderer provenance', () => {
	it('rejects a universal permissive-cell write from a DOM causal render', () => {
		const universal = evaluateUniversal(UNIVERSAL_CAUSAL_SOURCE, 'permissive');
		const universalRoot = createUniversalRoot();
		let setUniversal!: (value: number) => void;
		universalRoot.root.render(universal.LaterWrite, {
			capture(setCount: typeof setUniversal) {
				setUniversal = setCount;
			},
		});
		const dom = evaluateClient(CLIENT_CAUSAL_SOURCE, 'causal');

		try {
			expect(() =>
				mount(dom.module.OpaqueStateWrite, {
					write() {
						setUniversal(0);
					},
				}),
			).toThrow(causalWriteError);
		} finally {
			universalRoot.root.unmount();
		}
	});

	it('rejects a DOM permissive-cell write from a universal causal render', () => {
		const dom = evaluateClient(CLIENT_CAUSAL_SOURCE, 'permissive');
		let setDom!: (value: number) => void;
		const domRoot = mount(dom.module.LaterWrite, {
			capture(setCount: typeof setDom) {
				setDom = setCount;
			},
		});
		const universal = evaluateUniversal(UNIVERSAL_CAUSAL_SOURCE, 'causal');
		const universalRoot = createUniversalRoot();

		try {
			expect(() =>
				universalRoot.root.render(universal.OpaqueStateWrite, {
					write() {
						setDom(0);
					},
				}),
			).toThrow(causalWriteError);
		} finally {
			universalRoot.root.unmount();
			domRoot.unmount();
		}
	});
});

describe('causal state model — server runtime', () => {
	it('rejects state and reducer writes before evaluating user code', () => {
		const module = evaluateServer(SERVER_CAUSAL_SOURCE, 'causal');
		let updaterRuns = 0;
		expect(() =>
			ServerRuntime.renderToString(module.OpaqueStateWrite, {
				write(setCount: (update: (value: number) => number) => void) {
					setCount((value) => {
						updaterRuns++;
						return value;
					});
				},
			}),
		).toThrow(causalWriteError);
		expect(updaterRuns).toBe(0);

		let reducerRuns = 0;
		expect(() =>
			ServerRuntime.renderToString(module.OpaqueReducerWrite, {
				onReducer() {
					reducerRuns++;
				},
				write(dispatch: (action: number) => void) {
					dispatch(1);
				},
			}),
		).toThrow(causalWriteError);
		expect(reducerRuns).toBe(0);
	});

	it('preserves causal provenance when lazy resolves to a transparent boundary', () => {
		const statePackage = evaluateServer(
			`import { useState } from 'octane';
export function usePackageState() {
	return useState(0);
}`,
			'permissive',
		);
		const module = evaluateServer(
			`import { Hydrate, lazy } from 'octane';
import { usePackageState } from 'state-package';

const LazyHydrate = lazy(() => ({
	then(resolve) {
		resolve({ default: Hydrate });
	},
}));

export function LazyBoundaryWrite(props) @{
	const [, setCount] = usePackageState();
	<LazyHydrate>
		<span>{props.write(setCount) as string}</span>
	</LazyHydrate>
}`,
			'causal',
			{ 'state-package': statePackage },
		);

		expect(() =>
			ServerRuntime.renderToString(module.LazyBoundaryWrite, {
				write(setCount: (value: number) => void) {
					setCount(1);
					return '';
				},
			}),
		).toThrow(causalWriteError);
	});

	it('allows a captured dispatch after the server pass has finished', () => {
		const module = evaluateServer(SERVER_CAUSAL_SOURCE, 'causal');
		let setLater!: (value: number) => void;
		const result = ServerRuntime.renderToString(module.LaterWrite, {
			capture(setCount: typeof setLater) {
				setLater = setCount;
			},
		});
		expect(result.html).toContain('Count: 0');
		expect(() => setLater(1)).not.toThrow();
	});

	it('preserves converging server render writes in the permissive model', () => {
		const module = evaluateServer(PERMISSIVE_SOURCE, 'permissive');
		expect(ServerRuntime.renderToString(module.RenderWrite).html).toContain('Count: 1');
	});

	it('preserves the server recursion limit while causal provenance is active', () => {
		const module = evaluateServer(
			`function Recursive(props) {
	if (props.depth === 0) return <span id="deep-causal-leaf">done</span>;
	return <Recursive depth={props.depth - 1} />;
}

export function DeepTree(props) @{
	<div><Recursive depth={props.depth} /></div>
}`,
			'causal',
		);
		expect(ServerRuntime.renderToString(module.DeepTree, { depth: 1_000 }).html).toContain(
			'<span id="deep-causal-leaf">done</span>',
		);
	});

	it('preserves permissive memo identity without relabeling a causal wrapper target', () => {
		const base = evaluateServer(
			`import { useState } from 'octane';
export function Base(props) @{
	const [count, setCount] = useState(0);
	if (count === 0) props.write(setCount);
	<span>{'Count: ' + count}</span>
}`,
			'permissive',
		);
		const wrapperSource = `import { memo } from 'octane';
import { Base } from 'base-package';
export const Wrapped = memo(Base);`;
		const permissive = evaluateServer(wrapperSource, 'permissive', {
			'base-package': base,
		});
		expect(permissive.Wrapped).toBe(base.Base);

		const causal = evaluateServer(wrapperSource, 'causal', {
			'base-package': base,
		});
		expect(causal.Wrapped).not.toBe(base.Base);

		const result = ServerRuntime.renderToString(causal.Wrapped, {
			write(setCount: (value: number) => void) {
				setCount(1);
			},
		});
		expect(result.html).toContain('Count: 1');
	});

	it('emits the causal memo ABI only for causal server output', () => {
		const source = `import { memo } from 'octane';
import { Base } from 'base-package';
export const Wrapped = memo(Base);`;
		const permissive = compile(source, '/src/permissive-server-memo.ts', {
			mode: 'server',
			stateModel: 'permissive',
			hmr: false,
			dev: true,
		});
		const causal = compile(source, '/src/causal-server-memo.ts', {
			mode: 'server',
			stateModel: 'causal',
			hmr: false,
			dev: true,
		});

		expect(permissive.code).toContain('memo(Base)');
		expect(permissive.code).not.toContain('memo(Base, undefined, 1)');
		expect(causal.code).toContain('memo(Base, undefined, 1)');
	});
});

describe('causal state model — universal runtime', () => {
	it('rejects state and reducer writes before evaluating user code', () => {
		const module = evaluateUniversal(UNIVERSAL_CAUSAL_SOURCE, 'causal');
		let updaterRuns = 0;
		const stateRoot = createUniversalRoot();
		expect(() =>
			stateRoot.root.render(module.OpaqueStateWrite, {
				write(setCount: (update: (value: number) => number) => void) {
					setCount((value) => {
						updaterRuns++;
						return value;
					});
				},
			}),
		).toThrow(causalWriteError);
		expect(updaterRuns).toBe(0);
		stateRoot.root.unmount();

		let reducerRuns = 0;
		const reducerRoot = createUniversalRoot();
		expect(() =>
			reducerRoot.root.render(module.OpaqueReducerWrite, {
				onReducer() {
					reducerRuns++;
				},
				write(dispatch: (action: number) => void) {
					dispatch(1);
				},
			}),
		).toThrow(causalWriteError);
		expect(reducerRuns).toBe(0);
		reducerRoot.root.unmount();
	});

	it('allows event and later-callback transitions after render', () => {
		const module = evaluateUniversal(UNIVERSAL_CAUSAL_SOURCE, 'causal');
		const event = createUniversalRoot();
		event.root.render(module.EventWrite, undefined);
		UniversalRuntime.flushUniversalSync(() => {
			event.container.dispatchEvent(event.container.children[0], 'fire', undefined);
		});
		expect(event.container.children[0].props.count).toBe(1);
		event.root.unmount();

		let setLater!: (update: (value: number) => number) => void;
		const later = createUniversalRoot();
		later.root.render(module.LaterWrite, {
			capture(setCount: typeof setLater) {
				setLater = setCount;
			},
		});
		UniversalRuntime.flushUniversalSync(() => setLater((value) => value + 1));
		expect(later.container.children[0].props.count).toBe(1);
		later.root.unmount();
	});

	it('preserves converging render writes in the permissive model', () => {
		const source = PERMISSIVE_SOURCE.replace("from 'octane'", "from 'octane/universal'").replace(
			'<span id="permissive">{\'Count: \' + count}</span>',
			'<scene count={count} />',
		);
		const module = evaluateUniversal(source, 'permissive');
		const rendered = createUniversalRoot();
		rendered.root.render(module.RenderWrite, undefined);
		expect(rendered.container.children[0].props.count).toBe(1);
		rendered.root.unmount();
	});

	it('preserves permissive memo identity without relabeling a universal wrapper target', () => {
		const base = evaluateUniversal(
			`import { useState } from 'octane/universal';
export function Base(props) @{
	const [count, setCount] = useState(0);
	if (count === 0) props.write(setCount);
	<scene count={count} />
}`,
			'permissive',
		);
		const wrapperSource = `import { memo } from 'octane/universal';
import { Base } from 'base-package';
export const Wrapped = memo(Base);`;
		const permissive = evaluateUniversal(wrapperSource, 'permissive', {
			'base-package': base,
		});
		expect(permissive.Wrapped).toBe(base.Base);

		const causal = evaluateUniversal(wrapperSource, 'causal', {
			'base-package': base,
		});
		expect(causal.Wrapped).not.toBe(base.Base);
		const rendered = createUniversalRoot();

		try {
			rendered.root.render(causal.Wrapped, {
				write(setCount: (value: number) => void) {
					setCount(1);
				},
			});
			expect(rendered.container.children[0].props.count).toBe(1);
		} finally {
			rendered.root.unmount();
		}
	});

	it('treats a permissive zero-argument state initializer as undefined', () => {
		const module = evaluateUniversal(
			`import { useState } from 'octane/universal';
export function ZeroArgumentState() @{
	const [value] = useState();
	<scene value={value === undefined ? 'empty' : typeof value} />
}`,
			'permissive',
		);
		const rendered = createUniversalRoot();

		rendered.root.render(module.ZeroArgumentState, undefined);
		expect(rendered.container.children[0].props.value).toBe('empty');
		rendered.root.unmount();
	});

	it.each([
		[
			'conditional',
			`@if (props.enabled) {
		<scene value={props.write(setCount)} />
	}`,
			{ enabled: true },
		],
		[
			'keyed list',
			`@for (const item of props.items; key item) {
		<scene value={props.write(setCount)} />
	}`,
			{ items: [1] },
		],
	])('preserves causal source provenance through a universal %s', (_label, body, props) => {
		const dependency = evaluateUniversal(
			`import { useState } from 'octane/universal';
export function usePackageState() {
	return useState(0);
}`,
			'permissive',
		);
		const module = evaluateUniversal(
			`import { usePackageState } from 'state-package';
export function StructuralWrite(props) @{
	const [, setCount] = usePackageState();
	${body}
}`,
			'causal',
			{ 'state-package': dependency },
		);
		const rendered = createUniversalRoot();

		try {
			expect(() =>
				rendered.root.render(module.StructuralWrite, {
					...props,
					write(setCount: (value: number) => void) {
						setCount(0);
						return '';
					},
				}),
			).toThrow(causalWriteError);
		} finally {
			rendered.root.unmount();
		}
	});
});
