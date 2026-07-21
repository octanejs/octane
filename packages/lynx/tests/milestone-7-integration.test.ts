import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import type { UniversalComponent } from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import {
	activateLynxMainThreadWorklet,
	releaseLynxMainThreadWorklet,
	unregisterBackgroundFunction,
	unregisterMainThreadWorklet,
	unwrapThreadFunctionDescriptor,
	type LynxActivatedMainThreadWorklet,
	type LynxBackgroundFunctionDescriptor,
	type LynxMainThreadRefDescriptor,
	type LynxMainThreadWorkletDescriptor,
	type LynxWorkletRecord,
} from '../src/core/worklets.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	type LynxBackgroundInboundMessage,
	type LynxBackgroundOutboundMessage,
	type LynxContextProxy,
} from '../src/core/protocol.js';
import * as firstScreenApi from '../src/first-screen.js';
import * as rootApi from '../src/index.js';
import * as mainRenderer from '../src/main-renderer.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import * as backgroundRenderer from '../src/renderer.js';
import type { LynxRoot } from '../src/root.js';

const THREAD_SOURCE = `
import { runOnMainThread, useMainThreadRef } from '@octanejs/lynx';
import { useLayoutEffect } from 'octane';
import { markMainCancelled } from './main-observer.js';
import { markBackgroundCancelled, markBackgroundEvent } from './background-observer.js';

export const mainStateControl = { increment: null, layoutValue: null };

export const mainEcho = (value) => {
  'main thread';
  return { thread: 'main', value };
};
export const mainThrow = () => {
  'main thread';
  throw new RangeError('main failed');
};
export const mainCancelled = () => {
  'main thread';
  markMainCancelled();
  return 'unexpected';
};
export const backgroundEcho = async (value) => {
  'background only';
  return await Promise.resolve({ thread: 'background', value });
};
export const backgroundThrow = () => {
  'background only';
  throw new SyntaxError('background failed');
};
export const backgroundCancelled = () => {
  'background only';
  markBackgroundCancelled();
  return 'unexpected';
};

export function setupCapturedDeclaration() {
  const call = () => {
    'background only';
    return later();
  };
  const value = call();
  function later() {
    'background only';
    return 9;
  }
  return value;
}

export function Scene({ prefix }) @{
  const node = useMainThreadRef();
  const onBackgroundEvent = (value) => {
    'background only';
    markBackgroundEvent(value);
    return { thread: 'background-event', value };
  };
  const onTap = () => {
    'main thread';
    if (node.current === null) return null;
    node.current.setAttribute('data-main-hit', prefix);
    return onBackgroundEvent(prefix);
  };
  <view id="main-target" main-thread:ref={node} main-thread:bindtap={onTap} />
}

export function StateRefScene() @{
  const count = useMainThreadRef(0);
  const incrementOnMain = () => {
    'main thread';
    count.current += 1;
    return count.current;
	};
	const increment = runOnMainThread(incrementOnMain);
	mainStateControl.increment = increment;
	useLayoutEffect(() => {
		void increment().then((value) => {
			mainStateControl.layoutValue = value;
		});
	}, []);
	<view id="state-ref-target" />
}

export function RefOnlyScene() @{
	const state = useMainThreadRef(0);
	<view id={'faulted-ref-' + state._wvid} />
}
`;

const EXPORT_NAMES = [
	'Scene',
	'StateRefScene',
	'RefOnlyScene',
	'mainStateControl',
	'mainEcho',
	'mainThrow',
	'mainCancelled',
	'backgroundEcho',
	'backgroundThrow',
	'backgroundCancelled',
	'setupCapturedDeclaration',
] as const;

interface CompiledLayer {
	readonly Scene: UniversalComponent<{ readonly prefix: string }>;
	readonly StateRefScene: UniversalComponent<Record<string, never>>;
	readonly RefOnlyScene: UniversalComponent<Record<string, never>>;
	readonly mainStateControl: {
		increment: (() => Promise<number>) | null;
		layoutValue: number | null;
	};
	readonly mainEcho: unknown;
	readonly mainThrow: unknown;
	readonly mainCancelled: unknown;
	readonly backgroundEcho: unknown;
	readonly backgroundThrow: unknown;
	readonly backgroundCancelled: unknown;
	readonly setupCapturedDeclaration: () => number;
}

interface WorkletListener {
	readonly type: 'worklet';
	readonly value: LynxActivatedMainThreadWorklet;
}

interface InstalledEnvironment {
	readonly dom: JSDOM;
	readonly main: LynxMainThreadController;
	readonly background: CompiledLayer;
	readonly mainLayer: CompiledLayer;
	readonly context: LynxContextProxy;
	readonly workletListeners: WorkletListener[];
	readonly cancellationRuns: { main: number; background: number };
	readonly backgroundEventRuns: string[];
}

let installed: InstalledEnvironment | null = null;
let backgroundRoot: LynxRoot | null = null;

function importBindings(specifiers: string): string {
	return specifiers
		.split(',')
		.map((specifier) => specifier.trim())
		.filter(Boolean)
		.map((specifier) => specifier.replace(/\s+as\s+/, ': '))
		.join(', ');
}

function evaluateCompiledLayer(
	code: string,
	modules: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): CompiledLayer {
	const withoutImports = code.replace(
		/import\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\2\s*;/g,
		(_statement, specifiers: string, _quote: string, request: string) =>
			`const { ${importBindings(specifiers)} } = modules[${JSON.stringify(request)}];`,
	);
	const executable = withoutImports.replace(/\bexport\s+(const|let|var|function|class)\s+/g, '$1 ');
	if (/\b(?:import|export)\b/.test(executable)) {
		throw new Error(`Unexpected module syntax in compiled test output:\n${executable}`);
	}
	return Function(
		'modules',
		`"use strict";\n${executable}\nreturn { ${EXPORT_NAMES.join(', ')} };`,
	)(modules) as CompiledLayer;
}

function contextFromBackground(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getCoreContext(): LynxContextProxy };
		}
	).lynx.getCoreContext();
}

async function flushMicrotasks(count = 8): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

function compileLayers(): {
	readonly backgroundCode: string;
	readonly mainCode: string;
} {
	const repository = fileURLToPath(new URL('../../../', import.meta.url));
	const result = execFileSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`import { compile } from './packages/octane/src/compiler/compile.js';
import { lynxBackgroundRenderer, lynxMainThreadRenderer } from './packages/lynx/src/config.runtime.js';
let source = '';
for await (const chunk of process.stdin) source += chunk;
const compileLayer = (renderer, thread) => compile(
  source,
  '/src/milestone-7-integration.tsrx',
  {
    hmr: false,
    renderer: { ...renderer, id: 'lynx' },
    universalRuntime: { runtime: 'lynx', thread },
  },
).code;
process.stdout.write(JSON.stringify({
  backgroundCode: compileLayer(lynxBackgroundRenderer, 'background'),
  mainCode: compileLayer(lynxMainThreadRenderer, 'main-thread'),
}));`,
		],
		{ cwd: repository, input: THREAD_SOURCE, encoding: 'utf8' },
	);
	const { backgroundCode, mainCode } = JSON.parse(result) as {
		backgroundCode: string;
		mainCode: string;
	};

	expect(backgroundCode).toContain("from './background-observer.js'");
	expect(backgroundCode).not.toContain("from './main-observer.js'");
	expect(mainCode).toContain("from './main-observer.js'");
	expect(mainCode).not.toContain("from './background-observer.js'");
	return { backgroundCode, mainCode };
}

function installEnvironment(
	prepareMainThread?: (target: Record<string, unknown>) => void,
): InstalledEnvironment {
	const { backgroundCode, mainCode } = compileLayers();
	for (const match of `${backgroundCode}\n${mainCode}`.matchAll(/["'](tf_[a-z0-9]+)["']/g)) {
		unregisterMainThreadWorklet(match[1]);
		unregisterBackgroundFunction(match[1]);
	}
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	const testing = globalThis.lynxTestingEnv;
	const workletListeners: WorkletListener[] = [];
	const cancellationRuns = { main: 0, background: 0 };
	const backgroundEventRuns: string[] = [];

	testing.switchToMainThread();
	const target = globalThis as unknown as Record<string, unknown>;
	const addEvent = target.__AddEvent as (
		node: object,
		kind: string,
		name: string,
		listener: unknown,
	) => void;
	target.__AddEvent = (node: object, kind: string, name: string, listener: unknown) => {
		if (
			listener !== null &&
			typeof listener === 'object' &&
			(listener as { readonly type?: unknown }).type === 'worklet'
		) {
			workletListeners.push(listener as WorkletListener);
		}
		addEvent.call(target, node, kind, name, listener);
	};
	prepareMainThread?.(target);
	const mainLayer = evaluateCompiledLayer(mainCode, {
		'@octanejs/lynx/main-renderer': mainRenderer,
		'@octanejs/lynx': firstScreenApi,
		'./main-observer.js': {
			markMainCancelled() {
				cancellationRuns.main++;
			},
		},
	});
	const main = installLynxMainThread();

	testing.switchToBackgroundThread();
	const background = evaluateCompiledLayer(backgroundCode, {
		'@octanejs/lynx/renderer': backgroundRenderer,
		'@octanejs/lynx': rootApi,
		'./background-observer.js': {
			markBackgroundCancelled() {
				cancellationRuns.background++;
			},
			markBackgroundEvent(value: string) {
				backgroundEventRuns.push(value);
			},
		},
	});
	const context = contextFromBackground();
	return (installed = {
		dom,
		main,
		background,
		mainLayer,
		context,
		workletListeners,
		cancellationRuns,
		backgroundEventRuns,
	});
}

afterEach(async () => {
	if (installed !== null) globalThis.lynxTestingEnv.switchToBackgroundThread();
	if (backgroundRoot !== null) {
		try {
			await backgroundRoot.unmount();
		} catch {
			// A failed assertion may leave a root whose transport has already closed.
		}
	}
	backgroundRoot = null;
	if (installed !== null) {
		globalThis.lynxTestingEnv.switchToMainThread();
		installed.main.close();
		globalThis.lynxTestingEnv.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		installed.dom.window.close();
	}
	installed = null;
});

describe.sequential('Lynx Milestone 7 compiler/runtime integration', () => {
	it('executes a compiled native event on main, resolves its live ref, and rejects removed lifetimes', async () => {
		const environment = installEnvironment();
		const inbound: LynxBackgroundInboundMessage[] = [];
		const outbound: LynxBackgroundOutboundMessage[] = [];
		environment.context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			outbound.push(event.data as LynxBackgroundOutboundMessage);
		});
		environment.context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		backgroundRoot = rootApi.createLynxRoot();
		expect(environment.background.setupCapturedDeclaration()).toBe(9);
		await backgroundRoot.render(environment.background.Scene, { prefix: 'adopted' });
		await backgroundRoot.flushTransport();

		const mainDescriptor = unwrapThreadFunctionDescriptor(environment.mainLayer.mainEcho);
		const backgroundDescriptor = unwrapThreadFunctionDescriptor(environment.background.mainEcho);
		expect(mainDescriptor).toEqual(backgroundDescriptor);
		expect(mainDescriptor).toMatchObject({ _wkltId: expect.stringMatching(/^tf_/) });

		const active = environment.workletListeners.at(-1);
		expect(active).toMatchObject({
			type: 'worklet',
			value: { _wkltId: expect.stringMatching(/^tf_/), _owlt: expect.any(Number) },
		});
		const element = environment.dom.window.document.querySelector('#main-target');
		expect(element).not.toBeNull();
		inbound.length = 0;
		globalThis.lynxTestingEnv.switchToMainThread();
		element!.dispatchEvent(new environment.dom.window.Event('bindEvent:tap', { bubbles: true }));
		expect(element?.getAttribute('data-main-hit')).toBe('adopted');
		for (let index = 0; index < 4; index++) await Promise.resolve();
		expect(environment.backgroundEventRuns).toEqual(['adopted']);
		expect(inbound.filter(({ type }) => type === 'call-background')).toHaveLength(1);
		expect(outbound.filter(({ type }) => type === 'call-background-result')).toEqual([
			expect.objectContaining({
				type: 'call-background-result',
				value: { thread: 'background-event', value: 'adopted' },
			}),
		]);

		const captures = active!.value._c as LynxWorkletRecord & {
			readonly values: readonly unknown[];
		};
		const ref = captures.values.find(
			(value): value is LynxMainThreadRefDescriptor =>
				value !== null && typeof value === 'object' && '_wvid' in value,
		);
		expect(ref?._wvid).toMatch(/^octane:/);

		globalThis.lynxTestingEnv.switchToBackgroundThread();
		const Empty = backgroundRenderer.defineUniversalComponent('lynx', () => null);
		await backgroundRoot.render(Empty, {});
		await backgroundRoot.flushTransport();
		expect(environment.dom.window.document.querySelector('#main-target')).toBeNull();

		globalThis.lynxTestingEnv.switchToMainThread();
		const runWorklet = (
			globalThis as typeof globalThis & {
				runWorklet(worklet: LynxMainThreadWorkletDescriptor): unknown;
			}
		).runWorklet;
		expect(() => runWorklet(active!.value)).toThrow(/stale or foreign/);

		const reactivated = activateLynxMainThreadWorklet({
			_wkltId: active!.value._wkltId,
			...(active!.value._c === undefined ? null : { _c: active!.value._c }),
		});
		try {
			expect(() => runWorklet(reactivated)).not.toThrow();
			expect(element?.getAttribute('data-main-hit')).toBe('adopted');
		} finally {
			releaseLynxMainThreadWorklet(reactivated);
		}
	});

	it('persists state-only refs across repeated main calls and releases them with their owner', async () => {
		const environment = installEnvironment();
		backgroundRoot = rootApi.createLynxRoot();
		await backgroundRoot.render(environment.background.StateRefScene, {});
		await backgroundRoot.flushTransport();
		await flushMicrotasks();

		const increment = environment.background.mainStateControl.increment;
		expect(increment).not.toBeNull();
		expect(await increment!()).toBe(2);
		expect(environment.background.mainStateControl.layoutValue).toBe(1);
		expect(await increment!()).toBe(3);

		globalThis.lynxTestingEnv.switchToBackgroundThread();
		const Empty = backgroundRenderer.defineUniversalComponent('lynx', () => null);
		await backgroundRoot.render(Empty, {});
		await backgroundRoot.flushTransport();
		await flushMicrotasks();
		environment.background.mainStateControl.layoutValue = null;
		await backgroundRoot.render(environment.background.StateRefScene, {});
		await backgroundRoot.flushTransport();
		await flushMicrotasks();

		const remountedIncrement = environment.background.mainStateControl.increment;
		expect(remountedIncrement).not.toBeNull();
		expect(remountedIncrement).not.toBe(increment);
		expect(environment.background.mainStateControl.layoutValue).toBe(1);
		expect(await remountedIncrement!()).toBe(2);
	});

	it('cleans up a ref owner after its background transport has closed', async () => {
		const environment = installEnvironment();
		const outbound: LynxBackgroundOutboundMessage[] = [];
		environment.context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			outbound.push(event.data as LynxBackgroundOutboundMessage);
		});
		backgroundRoot = rootApi.createLynxRoot();
		await backgroundRoot.render(environment.background.StateRefScene, {});
		await backgroundRoot.flushTransport();
		await flushMicrotasks();
		const commit = outbound.find(
			(message): message is Extract<LynxBackgroundOutboundMessage, { type: 'commit' }> =>
				message.type === 'commit',
		);
		expect(commit).toBeDefined();

		environment.context.dispatchEvent({
			type: LYNX_MAIN_TO_BACKGROUND_EVENT,
			data: {
				protocol: commit!.protocol,
				renderer: commit!.renderer,
				root: commit!.root,
				version: commit!.version,
				type: 'host-fault',
				error: {
					name: 'Error',
					message: 'Octane Lynx background transport was closed.',
				},
			},
		});
		await flushMicrotasks();
		await expect(backgroundRoot.unmount()).resolves.toBeUndefined();
		await flushMicrotasks();

		environment.background.mainStateControl.layoutValue = null;
		backgroundRoot = rootApi.createLynxRoot();
		await backgroundRoot.render(environment.background.StateRefScene, {});
		await backgroundRoot.flushTransport();
		await flushMicrotasks();
		expect(environment.background.mainStateControl.layoutValue).toBe(1);
	});

	it('does not surface a second ref-owner failure after an accepted host fault', async () => {
		let shouldFail = true;
		const environment = installEnvironment((target) => {
			const setId = target.__SetID as (node: object, id: string | null) => void;
			target.__SetID = (node: object, id: string | null) => {
				setId(node, id);
				if (!shouldFail) return;
				shouldFail = false;
				throw new Error('injected ref-owner host fault');
			};
		});
		const backgroundOutbound: LynxBackgroundOutboundMessage[] = [];
		const mainOutbound: LynxBackgroundInboundMessage[] = [];
		environment.context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			backgroundOutbound.push(event.data as LynxBackgroundOutboundMessage);
		});
		environment.context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			mainOutbound.push(event.data as LynxBackgroundInboundMessage);
		});
		backgroundRoot = rootApi.createLynxRoot();

		await expect(backgroundRoot.render(environment.background.RefOnlyScene, {})).rejects.toThrow(
			'injected ref-owner host fault',
		);
		expect(shouldFail).toBe(false);
		expect(
			mainOutbound.find(
				(message) =>
					message.type === 'fault' && message.error.message === 'injected ref-owner host fault',
			),
		).toBeDefined();
		expect(
			backgroundOutbound.find(
				(message) =>
					message.type === 'call-main' &&
					message.worklet._wkltId === 'octane:retain-main-thread-ref-owner',
			),
		).toBeDefined();
		expect(
			mainOutbound.find(
				(message) =>
					message.type === 'call-main-error' &&
					message.error.message === 'Octane Lynx main-thread root is faulted.',
			),
		).toBeDefined();
		await flushMicrotasks();
		await expect(backgroundRoot.unmount()).resolves.toBeUndefined();
		await flushMicrotasks();
	});

	it('settles public bidirectional calls queued before adoption, including errors and cancellation', async () => {
		const environment = installEnvironment();
		const backgroundOutbound: LynxBackgroundOutboundMessage[] = [];
		const mainOutbound: LynxBackgroundInboundMessage[] = [];
		environment.context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			backgroundOutbound.push(event.data as LynxBackgroundOutboundMessage);
		});
		environment.context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			mainOutbound.push(event.data as LynxBackgroundInboundMessage);
		});
		backgroundRoot = rootApi.createLynxRoot();

		const mainEcho = rootApi.runOnMainThread<[string], { thread: string; value: string }>(
			unwrapThreadFunctionDescriptor(
				environment.background.mainEcho,
			) as LynxMainThreadWorkletDescriptor,
		);
		const mainThrow = rootApi.runOnMainThread<[], never>(
			unwrapThreadFunctionDescriptor(
				environment.background.mainThrow,
			) as LynxMainThreadWorkletDescriptor,
		);
		const mainCancelled = rootApi.runOnMainThread<[], string>(
			unwrapThreadFunctionDescriptor(
				environment.background.mainCancelled,
			) as LynxMainThreadWorkletDescriptor,
		);
		const pendingMainResult = mainEcho('queued');
		const pendingMainError = mainThrow();
		const cancelledMain = mainCancelled();
		const cancelledMainAssertion = expect(cancelledMain).rejects.toMatchObject({
			name: 'LynxCrossThreadCallCancelledError',
			message: 'cancel main before adoption',
		});
		cancelledMain.cancel('cancel main before adoption');

		globalThis.lynxTestingEnv.switchToMainThread();
		const backgroundEcho = firstScreenApi.runOnBackground<
			[string],
			{ thread: string; value: string }
		>(
			unwrapThreadFunctionDescriptor(
				environment.mainLayer.backgroundEcho,
			) as LynxBackgroundFunctionDescriptor,
		);
		const backgroundThrow = firstScreenApi.runOnBackground<[], never>(
			unwrapThreadFunctionDescriptor(
				environment.mainLayer.backgroundThrow,
			) as LynxBackgroundFunctionDescriptor,
		);
		const backgroundCancelled = firstScreenApi.runOnBackground<[], string>(
			unwrapThreadFunctionDescriptor(
				environment.mainLayer.backgroundCancelled,
			) as LynxBackgroundFunctionDescriptor,
		);
		const pendingBackgroundResult = backgroundEcho('queued');
		const pendingBackgroundError = backgroundThrow();
		const cancelledBackground = backgroundCancelled();
		const cancelledBackgroundAssertion = expect(cancelledBackground).rejects.toMatchObject({
			name: 'LynxCrossThreadCallCancelledError',
			message: 'cancel background before adoption',
		});
		cancelledBackground.cancel('cancel background before adoption');

		await Promise.all([cancelledMainAssertion, cancelledBackgroundAssertion]);
		expect(
			backgroundOutbound.filter(({ type }) => type === 'call-main' || type === 'cancel-main'),
		).toEqual([]);
		expect(
			mainOutbound.filter(({ type }) => type === 'call-background' || type === 'cancel-background'),
		).toEqual([]);

		globalThis.lynxTestingEnv.switchToBackgroundThread();
		await backgroundRoot.render(environment.background.Scene, { prefix: 'calls' });
		await backgroundRoot.flushTransport();
		await expect(pendingMainResult).resolves.toEqual({ thread: 'main', value: 'queued' });
		await expect(pendingMainError).rejects.toMatchObject({
			name: 'RangeError',
			message: 'main failed',
		});
		await expect(pendingBackgroundResult).resolves.toEqual({
			thread: 'background',
			value: 'queued',
		});
		await expect(pendingBackgroundError).rejects.toMatchObject({
			name: 'SyntaxError',
			message: 'background failed',
		});
		expect(environment.cancellationRuns).toEqual({ main: 0, background: 0 });
		expect(
			backgroundOutbound.filter(({ type }) => type === 'call-main').map(({ call }) => call),
		).toEqual([1, 2, 4]);
		expect(mainOutbound.filter(({ type }) => type === 'call-background')).toHaveLength(2);
	});
});
