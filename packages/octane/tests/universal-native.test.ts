// @vitest-environment node

import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
	createContext,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalPlan,
	universalValue,
	useContext,
} from 'octane/universal/native';

const RENDERER = 'native-context-test';
const valuePlan = universalPlan(RENDERER, {
	kind: 'host',
	type: 'value',
	bindings: [['theme', 0]],
});

describe('host-neutral universal entry', () => {
	it('provides renderer-local context without a DOM owner', () => {
		const Theme = createContext('default');
		const container = createObjectContainer(RENDERER);
		const root = createUniversalRoot(container, createObjectDriver(RENDERER));
		const DefaultValue = defineUniversalComponent(RENDERER, () =>
			universalValue(valuePlan, [useContext(Theme)]),
		);
		const ProvidedValue = defineUniversalComponent(RENDERER, (props: { theme: string }) =>
			Theme.Provider({
				value: props.theme,
				children: () => universalValue(valuePlan, [useContext(Theme)]),
			}),
		);

		expect(Theme.Provider).toBe(Theme);
		root.render(DefaultValue, undefined);
		expect(container.children[0].props.theme).toBe('default');

		root.render(ProvidedValue, { theme: 'dark' });
		expect(container.children[0].props.theme).toBe('dark');
		root.render(ProvidedValue, { theme: 'light' });
		expect(container.children[0].props.theme).toBe('light');

		root.unmount();
		expect(container.children).toEqual([]);
	});

	it('keeps universal profiling absent from normal bundles and active only when enabled', async () => {
		const source = `
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	markUniversalHostComponent,
	memo,
	universalFor,
	universalHostComponentLeafPlan,
	universalPlan,
	universalProps,
	universalValue,
	useState,
} from 'octane/universal/native';
import { __profileComponent, profiler } from 'octane/profiling';

const renderer = 'profile-proof';
const plan = universalPlan(renderer, {
	kind: 'host',
	type: 'counter',
	propsSlot: 0,
});
const scheduled = [];
let update;
const ProfiledHost = markUniversalHostComponent(
	defineUniversalComponent(renderer, function ProfiledHost(props) {
		return universalValue(plan, [universalProps([['spread', props]])]);
	}),
	renderer,
	plan,
);
const Counter = defineUniversalComponent(renderer, function ProfiledCounter() {
	const [count, setCount] = useState(0, 'count');
	update = setCount;
	return universalFor(
		[count],
		() => 'counter',
		(value) => [value],
		null,
		true,
		true,
		ProfiledHost,
		universalHostComponentLeafPlan(renderer, ProfiledHost, '["value"]'),
		'["value"]',
	);
});

if (__OCTANE_PROFILE_ENABLED__) {
	profiler.start({ timeline: false });
	__profileComponent(Counter, {
		id: 'profile-proof#ProfiledCounter',
		name: 'ProfiledCounter',
		file: 'profile-proof.tsrx',
		line: 1,
		column: 0,
		kind: 'component',
	});
	__profileComponent(ProfiledHost, {
		id: 'profile-proof#ProfiledHost',
		name: 'ProfiledHost',
		file: 'profile-proof.tsrx',
		line: 2,
		column: 0,
		kind: 'component',
	});
}

const WrappedCounter = memo(Counter);
const container = createObjectContainer(renderer);
const objectDriver = createObjectDriver(renderer);
const root = createUniversalRoot(container, {
	...objectDriver,
	capabilities: { ...objectDriver.capabilities, compilerLeafProps: true },
}, {
	scheduleMicrotask(callback) {
		scheduled.push(callback);
	},
});
root.render(WrappedCounter, undefined);
update(1);
scheduled.shift()();
globalThis.renderedValue = container.children[0].props.value;
`;
		const run = async (enabled: boolean) => {
			const result = await build({
				stdin: {
					contents: source,
					resolveDir: resolve(import.meta.dirname, '..'),
					sourcefile: 'universal-profile-proof.ts',
				},
				bundle: true,
				define: { __OCTANE_PROFILE_ENABLED__: JSON.stringify(enabled) },
				format: 'iife',
				metafile: true,
				minify: true,
				platform: 'neutral',
				target: 'esnext',
				treeShaking: true,
				write: false,
			});
			const context: {
				renderedValue?: number;
				__OCTANE_PROFILER__?: typeof import('../src/profiling.js').profiler;
			} = {};
			runInNewContext(result.outputFiles[0].text, context);
			return {
				context,
				inputs: Object.keys(Object.values(result.metafile!.outputs)[0].inputs),
			};
		};

		const disabled = await run(false);
		expect(disabled.context.renderedValue).toBe(1);
		expect(disabled.context.__OCTANE_PROFILER__).toBeUndefined();
		expect(
			disabled.inputs.some((input) => /packages\/octane\/src\/profiling\.ts$/.test(input)),
		).toBe(false);

		const enabled = await run(true);
		expect(enabled.context.renderedValue).toBe(1);
		expect(
			enabled.inputs.some((input) => /packages\/octane\/src\/profiling\.ts$/.test(input)),
		).toBe(true);
		const profileEvents = enabled.context.__OCTANE_PROFILER__?.getEvents().map((event) => ({
			component: event.component,
			phase: event.phase,
			causes: event.causes.map((cause) => cause.type),
		}));
		expect(profileEvents?.filter((event) => event.component === 'ProfiledCounter')).toEqual([
			{ component: 'ProfiledCounter', phase: 'mount', causes: ['mount'] },
			{ component: 'ProfiledCounter', phase: 'update', causes: ['state'] },
		]);
		expect(profileEvents?.filter((event) => event.component === 'ProfiledHost')).toEqual([
			{ component: 'ProfiledHost', phase: 'mount', causes: ['mount'] },
			{ component: 'ProfiledHost', phase: 'update', causes: ['parent'] },
		]);
	});

	it('bundles the public native entry without DOM or React runtime modules', async () => {
		const result = await build({
			stdin: {
				contents: "export * from 'octane/universal/native';",
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'native-consumer.ts',
			},
			bundle: true,
			format: 'esm',
			metafile: true,
			minify: true,
			platform: 'neutral',
			target: 'esnext',
			write: false,
		});
		const output = result.outputFiles[0].text;
		const inputs = Object.keys(Object.values(result.metafile!.outputs)[0].inputs);

		expect(inputs).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/packages\/octane\/src\/universal-core\.ts$/),
				expect.stringMatching(/packages\/octane\/src\/universal-native\.ts$/),
			]),
		);
		expect(
			inputs.some((input) =>
				/(?:^|\/)(?:runtime\.ts|dom-tables\.[jt]s|hydration(?:\/|\.))|react|preact/i.test(input),
			),
		).toBe(false);
		expect(output).not.toMatch(/\b(?:document|window|MutationObserver|HTMLElement)\b/);
	});

	it('keeps a DOM-only public root independent of universal renderer modules', async () => {
		const result = await build({
			stdin: {
				contents:
					"import { createRoot } from 'octane'; globalThis.__octaneCreateRoot = createRoot;",
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'dom-only-consumer.ts',
			},
			bundle: true,
			define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			format: 'iife',
			metafile: true,
			minify: true,
			platform: 'browser',
			target: 'esnext',
			treeShaking: true,
			write: false,
		});
		const inputs = Object.keys(Object.values(result.metafile!.outputs)[0].inputs);

		expect(inputs).toEqual(
			expect.arrayContaining([expect.stringMatching(/packages\/octane\/src\/runtime\.ts$/)]),
		);
		expect(
			inputs.some((input) =>
				/packages\/octane\/src\/universal-(?:core|native|dom-boundary)\.ts$/.test(input),
			),
		).toBe(false);
	});

	it('requires a host scheduler when queueMicrotask is absent and preserves thrown errors', async () => {
		const result = await build({
			stdin: {
				contents: "export * from 'octane/universal/native';",
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'native-microtask-consumer.ts',
			},
			bundle: true,
			define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			format: 'iife',
			globalName: 'OctaneNative',
			platform: 'neutral',
			target: 'es2017',
			write: false,
		});
		const context = {} as { OctaneNative: typeof import('octane/universal/native') };
		runInNewContext(result.outputFiles[0].text, context);
		const native = context.OctaneNative;
		expect('createUniversalHostBoundaryAdapter' in native).toBe(false);
		const container = native.createObjectContainer(RENDERER);
		const driver = native.createObjectDriver(RENDERER);
		expect(() =>
			native.createUniversalRoot(container, driver, {
				scheduleMicrotask: 1 as never,
			}),
		).toThrow(/scheduleMicrotask must be a function/);
		expect(() => native.createUniversalRoot(container, driver)).toThrow(
			/options\.scheduleMicrotask/,
		);

		const scheduled: Array<() => void> = [];
		const root = native.createUniversalRoot(container, driver, {
			scheduleMicrotask(callback) {
				scheduled.push(callback);
			},
		});
		let update!: (value: number) => void;
		const Counter = native.defineUniversalComponent(RENDERER, () => {
			const [count, setCount] = native.useState(0);
			update = setCount;
			return native.universalValue(valuePlan, [count]);
		});

		root.render(Counter, undefined);
		expect(container.children[0].props.theme).toBe(0);
		update(1);
		expect(scheduled).toHaveLength(1);
		scheduled.shift()!();
		expect(container.children[0].props.theme).toBe(1);

		const actionContainer = native.createObjectContainer(RENDERER);
		const actionRoot = native.createUniversalRoot(actionContainer, driver, {
			scheduleMicrotask(callback) {
				scheduled.push(callback);
			},
		});
		let dispatch!: (payload: undefined) => void;
		const ThrowingAction = native.defineUniversalComponent(RENDERER, () => {
			const [value, run] = native.useActionState<number, undefined>(() => {
				throw new Error('action-fault');
			}, 0);
			dispatch = run;
			return native.universalValue(valuePlan, [value]);
		});

		actionRoot.render(ThrowingAction, undefined);
		expect(() => dispatch(undefined)).not.toThrow();
		expect(scheduled).toHaveLength(1);
		expect(scheduled.shift()!).toThrow('action-fault');

		root.unmount();
		actionRoot.unmount();
	});
});
