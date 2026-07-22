import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import type { UniversalHostBatch, UniversalHostCommand } from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxClientContainer } from '../src/core/client-driver.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxBackgroundInboundMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
} from '../src/core/protocol.js';
import { createLynxBackgroundTransport } from '../src/core/transport.js';
import {
	createLynxMainThreadRefDescriptor,
	registerMainThreadWorklet,
	type LynxMainThreadRefCell,
	type LynxMainThreadWorkletDescriptor,
} from '../src/core/worklets.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';

let dom: JSDOM | null = null;
let controller: LynxMainThreadController | null = null;

class AsyncFifoContextProxy implements LynxContextProxy {
	readonly events: LynxContextProxyEvent[] = [];
	private readonly listeners = new Map<string, Set<(event: LynxContextProxyEvent) => void>>();
	private readonly backgroundToMain: LynxContextProxyEvent[] = [];
	private scheduled = false;

	dispatchEvent(event: LynxContextProxyEvent): void {
		this.events.push(event);
		if (event.type === LYNX_BACKGROUND_TO_MAIN_EVENT) {
			this.backgroundToMain.push(event);
			this.scheduleNext();
			return;
		}
		this.deliver(event);
	}

	addEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
		let listeners = this.listeners.get(type);
		if (listeners === undefined) this.listeners.set(type, (listeners = new Set()));
		listeners.add(listener);
	}

	removeEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	private deliver(event: LynxContextProxyEvent): void {
		for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
	}

	private scheduleNext(): void {
		if (this.scheduled) return;
		this.scheduled = true;
		void Promise.resolve().then(() => {
			this.scheduled = false;
			const event = this.backgroundToMain.shift();
			if (event !== undefined) this.deliver(event);
			// Schedule only after delivery, behind promise jobs created by the main
			// handler, to model a real FIFO bridge with a microtask checkpoint between
			// individual cross-thread messages.
			if (this.backgroundToMain.length !== 0) this.scheduleNext();
		});
	}
}

function install(
	executeMainThreadWorklet?: Parameters<
		typeof installLynxMainThread
	>[0]['executeMainThreadWorklet'],
	configureMainThread?: (target: typeof globalThis) => void,
): LynxContextProxy {
	dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	globalThis.lynxTestingEnv.switchToMainThread();
	configureMainThread?.(globalThis);
	controller = installLynxMainThread({ executeMainThreadWorklet });
	globalThis.lynxTestingEnv.switchToBackgroundThread();
	return (
		globalThis as typeof globalThis & {
			lynx: { getCoreContext(): LynxContextProxy };
		}
	).lynx.getCoreContext();
}

function dispatchCommit(
	context: LynxContextProxy,
	root: number,
	version: number,
	commands: readonly UniversalHostCommand[],
): void {
	context.dispatchEvent({
		type: LYNX_BACKGROUND_TO_MAIN_EVENT,
		data: {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root,
			version,
			type: 'commit',
			batch: { renderer: LYNX_TRANSPORT_RENDERER, version, commands },
		},
	});
}

async function flushMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

afterEach(() => {
	controller?.close();
	controller = null;
	if (dom !== null) {
		globalThis.lynxTestingEnv.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		dom.window.close();
		dom = null;
	}
});

describe.sequential('Lynx bidirectional thread calls', () => {
	it('preserves ref state across asynchronously delivered acknowledgement owner waves', async () => {
		dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, {
			window: dom.window as unknown as Window & typeof globalThis,
		});
		const context = new AsyncFifoContextProxy();
		globalThis.lynxTestingEnv.switchToMainThread();
		controller = installLynxMainThread({ context });
		globalThis.lynxTestingEnv.switchToBackgroundThread();

		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		const ref = createLynxMainThreadRefDescriptor('test:async-owner-state', 0);
		const increment = registerMainThreadWorklet(
			'test:increment-async-owner-state',
			{ ref },
			function () {
				const cell = this._c!.ref as unknown as LynxMainThreadRefCell<number>;
				return ++cell.current;
			},
		);
		const retain = registerMainThreadWorklet('octane:retain-main-thread-ref-owner', {
			id: ref._wvid,
			initialValue: ref._initValue,
		});
		const release = registerMainThreadWorklet('octane:release-main-thread-ref-owner', {
			id: ref._wvid,
		});
		const root = 113;
		const batch = (version: number, commands: UniversalHostCommand[]): UniversalHostBatch => ({
			renderer: LYNX_TRANSPORT_RENDERER,
			version,
			commands,
		});
		const identity = (version: number) => ({
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root,
			version,
		});

		const mountCalls: ReturnType<typeof transport.callMain>[] = [];
		const mounted = transport
			.prepareBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'view', props: { id: 'async-owner' } },
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
				identity(1),
			)
			.apply(() => {
				// Models child-first mount layout work followed by the parent hook's
				// owner retain. Each message reaches main in a separate microtask.
				mountCalls.push(transport.callMain(increment, []), transport.callMain(retain, []));
			});
		await mounted;
		expect(await mountCalls[0]!.promise).toBe(1);
		expect(await mountCalls[1]!.promise).toBeUndefined();

		const cleanupCalls: ReturnType<typeof transport.callMain>[] = [];
		const updated = transport
			.prepareBatch(
				container,
				batch(2, [{ op: 'update', id: 1, props: { id: 'async-owner-cleanup' } }]),
				identity(2),
			)
			.apply(() => {
				// Models parent-first deletion cleanup followed by a child's final call.
				cleanupCalls.push(transport.callMain(release, []), transport.callMain(increment, []));
			});
		await updated;
		expect(await cleanupCalls[0]!.promise).toBeUndefined();
		expect(await cleanupCalls[1]!.promise).toBe(2);

		const publicationPhases = () =>
			context.events
				.filter(
					(event) =>
						event.type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
						(event.data as { type?: unknown }).type === 'main-call-publication',
				)
				.map((event) => (event.data as { phase: unknown }).phase);
		expect(publicationPhases()).toEqual(['open', 'close', 'open', 'close']);

		// The second publication purged the now-unowned cell. A steady-state call
		// starts from the initializer and does not pay for publication messages.
		expect(await transport.callMain(increment, []).promise).toBe(1);
		expect(publicationPhases()).toEqual(['open', 'close', 'open', 'close']);

		await transport
			.prepareBatch(
				container,
				batch(3, [{ op: 'update', id: 1, props: { id: 'no-owner-wave' } }]),
				identity(3),
			)
			.apply(() => {});
		expect(publicationPhases()).toEqual(['open', 'close', 'open', 'close']);

		let cancelledCall: ReturnType<typeof transport.callMain> | null = null;
		await transport
			.prepareBatch(
				container,
				batch(4, [{ op: 'update', id: 1, props: { id: 'cancelled-owner-wave' } }]),
				identity(4),
			)
			.apply(() => {
				cancelledCall = transport.callMain(increment, []);
				cancelledCall.cancel();
			});
		await expect(cancelledCall!.promise).rejects.toMatchObject({ name: 'AbortError' });
		// A call cancelled before the ACK callback returns leaves no publication work.
		expect(publicationPhases()).toEqual(['open', 'close', 'open', 'close']);
		await transport.dispose();
	});

	it('fail-stops exact publication phase violations without poisoning later roots', () => {
		const context = install();
		const mount = (root: number, version = 1): void => {
			dispatchCommit(context, root, version, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
			]);
		};
		const publish = (root: number, version: number, phase: 'open' | 'close'): void => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					root,
					version,
					type: 'main-call-publication',
					phase,
				},
			});
		};

		mount(114);
		publish(114, 1, 'open');
		publish(999, 1, 'close');
		expect(controller!.activeIdentity()).toMatchObject({ root: 114, version: 1 });
		publish(114, 1, 'close');
		publish(114, 1, 'open');
		expect(controller!.activeIdentity()).toBeNull();
		expect(controller!.diagnostics().some((error) => /replayed open/.test(error.message))).toBe(
			true,
		);

		// Publication history and an interrupted window are scoped to their root.
		mount(115);
		publish(114, 1, 'open');
		publish(115, 1, 'open');
		publish(115, 1, 'open');
		expect(controller!.activeIdentity()).toBeNull();
		expect(controller!.diagnostics().some((error) => /nested open/.test(error.message))).toBe(true);

		mount(116);
		publish(116, 1, 'close');
		expect(controller!.activeIdentity()).toBeNull();
		expect(
			controller!.diagnostics().some((error) => /close without an open/.test(error.message)),
		).toBe(true);

		mount(117);
		publish(117, 1, 'open');
		dispatchCommit(context, 117, 2, [{ op: 'update', id: 1, props: { id: 'too-early' } }]);
		expect(controller!.activeIdentity()).toBeNull();
		expect(
			controller!
				.diagnostics()
				.some((error) => /before main-call publication closed/.test(error.message)),
		).toBe(true);
	});

	it('purges same-id ref owners when a terminally disposed root yields to the next root', async () => {
		const context = install();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		const ref = createLynxMainThreadRefDescriptor('test:realm-stable-state', 0);
		const retain = registerMainThreadWorklet('octane:retain-main-thread-ref-owner', {
			id: ref._wvid,
			initialValue: ref._initValue,
		});
		const increment = registerMainThreadWorklet(
			'test:increment-realm-stable-state',
			{ ref },
			function () {
				const cell = this._c!.ref as unknown as LynxMainThreadRefCell<number>;
				return ++cell.current;
			},
		);
		const call = (root: number, id: number, worklet: LynxMainThreadWorkletDescriptor): void => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					root,
					version: 1,
					type: 'call-main',
					call: id,
					worklet,
					args: [],
				},
			});
		};
		const mount = (root: number): void => {
			dispatchCommit(context, root, 1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
			]);
		};

		mount(110);
		call(110, 1, retain);
		call(110, 2, increment);
		await flushMicrotasks();
		expect(
			inbound.find(
				(message) =>
					message.type === 'call-main-result' && message.root === 110 && message.call === 2,
			),
		).toMatchObject({ value: 1 });

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 110,
				version: 1,
				type: 'terminal-dispose',
			},
		});
		mount(111);
		call(111, 1, retain);
		call(111, 2, increment);
		await flushMicrotasks();
		expect(
			inbound.find(
				(message) =>
					message.type === 'call-main-result' && message.root === 111 && message.call === 2,
			),
		).toMatchObject({ value: 1 });
	});

	it('queues pre-adoption background calls and settles them by their birth identity', async () => {
		const context = install();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});

		const queuedFn = { _jsFnId: 'app:load', _c: { label: 'before' } };
		const queuedArg = { value: 'before' };
		const queued = controller!.callBackground(queuedFn, [queuedArg]);
		queuedFn._c.label = 'mutated';
		queuedArg.value = 'mutated';
		expect(inbound.some((message) => message.type === 'call-background')).toBe(false);

		dispatchCommit(context, 101, 1, [
			{ op: 'create', id: 1, type: 'view', props: {} },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		const call = inbound.find(
			(message): message is Extract<LynxBackgroundInboundMessage, { type: 'call-background' }> =>
				message.type === 'call-background',
		)!;
		expect(call).toMatchObject({
			root: 101,
			version: 1,
			fn: { _jsFnId: 'app:load', _c: { label: 'before' } },
			args: [{ value: 'before' }],
		});

		// A later accepted render does not stale an already-started asynchronous call.
		dispatchCommit(context, 101, 2, [{ op: 'update', id: 1, props: { id: 'new' } }]);
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 999,
				version: 1,
				type: 'dispose',
			},
		});
		const result = { status: 'loaded' };
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: call.protocol,
				renderer: call.renderer,
				root: call.root,
				version: call.version,
				type: 'call-background-result',
				call: call.call,
				value: result,
			},
		});
		result.status = 'mutated';
		const resolved = await queued.promise;
		expect(resolved).toEqual({ status: 'loaded' });
		expect(resolved).not.toBe(result);
	});

	it('closes both call directions before acknowledging an accepted host fault', async () => {
		const executions: string[] = [];
		let resolveRunningMain!: (value: string) => void;
		let failSetId = false;
		const context = install(
			(worklet) => {
				executions.push(worklet._wkltId);
				if (worklet._wkltId === 'app:pending-at-fault') {
					return new Promise<string>((resolve) => {
						resolveRunningMain = resolve;
					});
				}
				return 'unexpected';
			},
			(target) => {
				const setId = target.__SetID;
				target.__SetID = (node, id) => {
					setId(node, id);
					if (!failSetId) return;
					failSetId = false;
					throw new Error('injected accepted host fault');
				};
			},
		);
		const inbound: LynxBackgroundInboundMessage[] = [];
		let acknowledgementCall: ReturnType<LynxMainThreadController['callBackground']> | null = null;
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			const message = event.data as LynxBackgroundInboundMessage;
			inbound.push(message);
			if (message.type !== 'ack' || message.root !== 106 || message.version !== 2) return;
			// ACK delivery can synchronously publish layout effects. A call created
			// here must observe the terminal fault before it executes or queues.
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					root: 106,
					version: 2,
					type: 'call-main',
					call: 2,
					worklet: { _wkltId: 'app:ack-reentrant' },
					args: [],
				},
			});
			acknowledgementCall = controller!.callBackground({ _jsFnId: 'app:after-fault' }, []);
		});

		dispatchCommit(context, 106, 1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'before-fault' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		const pendingBackground = controller!.callBackground({ _jsFnId: 'app:pending' }, []);
		const pendingBackgroundAssertion = expect(pendingBackground.promise).rejects.toThrow(
			'injected accepted host fault',
		);
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 106,
				version: 1,
				type: 'call-main',
				call: 1,
				worklet: { _wkltId: 'app:pending-at-fault' },
				args: [],
			},
		});

		failSetId = true;
		dispatchCommit(context, 106, 2, [{ op: 'update', id: 1, props: { id: 'faulted' } }]);

		await pendingBackgroundAssertion;
		expect(acknowledgementCall).not.toBeNull();
		await expect(acknowledgementCall!.promise).rejects.toThrow(
			'Octane Lynx main-thread root is faulted',
		);
		expect(executions).toEqual(['app:pending-at-fault']);
		expect(
			inbound.find((message) => message.type === 'call-main-error' && message.call === 2),
		).toMatchObject({
			error: { message: 'Octane Lynx main-thread root is faulted.' },
		});
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 106,
				version: 2,
				type: 'call-main',
				call: 2,
				worklet: { _wkltId: 'app:ack-reentrant' },
				args: [],
			},
		});
		expect(
			inbound.filter((message) => message.type === 'call-main-error' && message.call === 2),
		).toHaveLength(1);

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 106,
				version: 2,
				type: 'call-main',
				call: 3,
				worklet: { _wkltId: 'app:late-after-fault' },
				args: [],
			},
		});
		const lateBackground = controller!.callBackground({ _jsFnId: 'app:late-after-fault' }, []);
		await expect(lateBackground.promise).rejects.toThrow('Octane Lynx main-thread root is faulted');
		resolveRunningMain('late');
		await flushMicrotasks();
		expect(executions).toEqual(['app:pending-at-fault']);
		expect(
			inbound.filter(
				(message) =>
					(message.type === 'call-main-result' || message.type === 'call-main-error') &&
					message.call === 1,
			),
		).toEqual([]);
		expect(inbound.filter((message) => message.type === 'call-background')).toHaveLength(1);

		// Cleanup-only acceptance cannot reopen either direction for the faulted root.
		dispatchCommit(context, 106, 3, [
			{ op: 'remove', parent: null, id: 1 },
			{ op: 'destroy', id: 1 },
		]);
		const afterCleanup = controller!.callBackground({ _jsFnId: 'app:after-cleanup' }, []);
		await expect(afterCleanup.promise).rejects.toThrow('Octane Lynx main-thread root is faulted');
		expect(inbound.filter((message) => message.type === 'call-background')).toHaveLength(1);
	});

	it('settles recoverable exact-identity calls when their wire payload is malformed', async () => {
		const context = install();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		dispatchCommit(context, 105, 1, [
			{ op: 'create', id: 1, type: 'view', props: {} },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);

		const pending = controller!.callBackground({ _jsFnId: 'app:malformed-result' }, []);
		const call = inbound.find(
			(message): message is Extract<LynxBackgroundInboundMessage, { type: 'call-background' }> =>
				message.type === 'call-background' && message.fn._jsFnId === 'app:malformed-result',
		)!;
		dispatchCommit(context, 105, 2, [{ op: 'update', id: 1, props: { id: 'newer' } }]);
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: call.protocol,
				renderer: call.renderer,
				root: call.root,
				version: call.version,
				type: 'call-background-result',
				call: call.call,
				value() {},
			},
		});
		await expect(pending.promise).rejects.toThrow(/non-serializable|clone-safe/);

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 105,
				version: 1,
				type: 'call-main',
				call: 8,
				worklet: { _wkltId: 'app:malformed-call' },
				args: [() => undefined],
			},
		});
		expect(
			inbound.find((message) => message.type === 'call-main-error' && message.call === 8),
		).toMatchObject({ root: 105, version: 1 });
	});

	it('returns main-thread values and errors exactly once and ignores cancellation races', async () => {
		const context = install((worklet, args) => {
			if (worklet._wkltId === 'app:throw') throw new RangeError('worklet failed');
			return { id: worklet._wkltId, value: args[0] };
		});
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		dispatchCommit(context, 102, 1, [
			{ op: 'create', id: 1, type: 'view', props: {} },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);

		for (const [call, id] of [
			[1, 'app:return'],
			[2, 'app:throw'],
		] as const) {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					root: 102,
					version: 1,
					type: 'call-main',
					call,
					worklet: { _wkltId: id },
					args: ['input'],
				},
			});
		}
		await flushMicrotasks();
		expect(inbound).toContainEqual(
			expect.objectContaining({
				type: 'call-main-result',
				call: 1,
				value: { id: 'app:return', value: 'input' },
			}),
		);
		expect(inbound).toContainEqual(
			expect.objectContaining({
				type: 'call-main-error',
				call: 2,
				error: { name: 'RangeError', message: 'worklet failed' },
			}),
		);

		let release!: (value: string) => void;
		controller!.close();
		controller = null;
		globalThis.lynxTestingEnv.switchToMainThread();
		controller = installLynxMainThread({
			executeMainThreadWorklet: () => new Promise<string>((resolve) => (release = resolve)),
		});
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		const secondContext = (
			globalThis as typeof globalThis & {
				lynx: { getCoreContext(): LynxContextProxy };
			}
		).lynx.getCoreContext();
		dispatchCommit(secondContext, 103, 1, [
			{ op: 'create', id: 1, type: 'view', props: {} },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		secondContext.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 103,
				version: 1,
				type: 'call-main',
				call: 9,
				worklet: { _wkltId: 'app:slow' },
				args: [],
			},
		});
		secondContext.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 103,
				version: 1,
				type: 'cancel-main',
				call: 9,
			},
		});
		release('late');
		await flushMicrotasks();
		expect(controller!.diagnostics()).toEqual([]);
	});

	it('never reexecutes replayed main-thread calls after settlement or cancellation', async () => {
		const executions: string[] = [];
		const context = install((worklet) => {
			executions.push(worklet._wkltId);
			if (worklet._wkltId === 'app:throw') throw new RangeError('worklet failed');
			if (worklet._wkltId === 'app:pending') return new Promise<never>(() => {});
			return 'completed';
		});
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		dispatchCommit(context, 104, 1, [
			{ op: 'create', id: 1, type: 'view', props: {} },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);

		const call = (id: number, worklet: string): void => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					root: 104,
					version: 1,
					type: 'call-main',
					call: id,
					worklet: { _wkltId: worklet },
					args: [],
				},
			});
		};

		call(1, 'app:return');
		await flushMicrotasks();
		call(1, 'app:return');
		call(2, 'app:throw');
		await flushMicrotasks();
		call(2, 'app:throw');
		call(3, 'app:pending');
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 104,
				version: 1,
				type: 'cancel-main',
				call: 3,
			},
		});
		call(3, 'app:pending');
		await flushMicrotasks();

		expect(executions).toEqual(['app:return', 'app:throw', 'app:pending']);
		for (const settledCall of [1, 2]) {
			expect(
				inbound.filter(
					(message) =>
						(message.type === 'call-main-result' || message.type === 'call-main-error') &&
						message.call === settledCall,
				),
			).toHaveLength(1);
		}
		expect(
			inbound.filter(
				(message) =>
					(message.type === 'call-main-result' || message.type === 'call-main-error') &&
					message.call === 3,
			),
		).toHaveLength(0);
		expect(
			controller!.diagnostics().filter((error) => /duplicate main-thread call/.test(error.message)),
		).toHaveLength(3);
	});
});
