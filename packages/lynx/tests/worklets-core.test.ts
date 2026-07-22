import { describe, expect, it, vi } from 'vitest';
import type { UniversalHostBatch } from 'octane/universal/native';
import {
	createLynxClientContainer,
	createLynxClientDriver,
	prepareLynxClientWorkletBatch,
} from '../src/core/client-driver.js';
import {
	attachThreadFunction,
	bindThreadFunction,
	createLynxBackgroundFunctionRegistry,
	createLynxMainThreadRefDescriptor,
	createLynxMainThreadWorkletRegistry,
	installBackgroundCallBridge,
	invokeThreadFunction,
	isolateLynxWorkletValue,
	registerMainThreadWorklet,
	registerThreadFunction,
	runOnMainThread,
	unwrapThreadFunctionDescriptor,
	type LynxMainThreadRefCell,
	type LynxWorkletRecord,
} from '../src/core/worklets.js';

describe('Lynx main-thread worklets', () => {
	it('isolates clone-safe captures while preserving nested descriptors and aliases', () => {
		const shared = { count: 1 };
		const source = {
			first: shared,
			second: shared,
			worklet: { _wkltId: 'test:nested', _c: { label: 'nested' } },
			ref: { _wvid: 'test:ref' },
			background: { _jsFnId: 'test:background', _execId: 'root:1' },
		};
		const isolated = isolateLynxWorkletValue(source);

		expect(isolated).not.toBe(source);
		expect(isolated.first).not.toBe(shared);
		expect(isolated.first).toBe(isolated.second);
		expect(isolated).toEqual(source);
		shared.count = 2;
		expect(isolated.first.count).toBe(1);
	});

	it('rejects values whose cross-thread meaning is ambiguous', () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const sparse = new Array(2);
		sparse[1] = 'value';

		expect(() => isolateLynxWorkletValue({ value: Number.NaN })).toThrow(/non-finite/);
		expect(() => isolateLynxWorkletValue(cyclic as LynxWorkletRecord)).toThrow(/cycle/);
		expect(() => isolateLynxWorkletValue(sparse)).toThrow(/dense array|sparse array/);
		expect(() => isolateLynxWorkletValue({ callback() {} } as never)).toThrow(/clone-safe/);
		expect(() => isolateLynxWorkletValue({ _wkltId: 'test', _wvid: 'test:ref' } as never)).toThrow(
			/mixes reserved/,
		);
	});

	it('preserves own prototype-named capture fields at every isolation boundary', () => {
		const payload = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as LynxWorkletRecord;
		const isolated = isolateLynxWorkletValue(payload);

		expect(Object.getPrototypeOf(isolated)).toBe(Object.prototype);
		expect(Object.prototype.hasOwnProperty.call(isolated, '__proto__')).toBe(true);
		expect((isolated.__proto__ as LynxWorkletRecord).polluted).toBe(true);
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();

		const descriptor = registerMainThreadWorklet(
			'test:prototype-capture',
			{ payload },
			function () {
				const captured = this._c!.payload as LynxWorkletRecord;
				return {
					isOwn: Object.prototype.hasOwnProperty.call(captured, '__proto__'),
					polluted: (captured.__proto__ as LynxWorkletRecord).polluted,
					prototype: Object.getPrototypeOf(captured) === Object.prototype,
				};
			},
		);
		const main = createLynxMainThreadWorkletRegistry();
		const active = main.activate(descriptor);
		expect(main.runWorklet(active)).toEqual({ isOwn: true, polluted: true, prototype: true });

		const background = createLynxBackgroundFunctionRegistry();
		const retained = background.retain({ payload });
		expect(Object.prototype.hasOwnProperty.call(retained.payload, '__proto__')).toBe(true);
		expect(Object.getPrototypeOf(retained.payload)).toBe(Object.prototype);
		main.close();
		background.close();
	});

	it('preserves shared capture identity within each execution graph', () => {
		const shared = { value: 1 };
		const descriptor = registerMainThreadWorklet(
			'test:main-aliases',
			{ first: shared, second: shared },
			function () {
				return this._c!.first === this._c!.second;
			},
		);
		const main = createLynxMainThreadWorkletRegistry();
		const active = main.activate(descriptor);
		expect(main.runWorklet(active)).toBe(true);

		registerThreadFunction(
			'background',
			'test:background-aliases',
			(captures) => captures[0] === captures[1],
		);
		const bound = bindThreadFunction('background', 'test:background-aliases', () => [
			shared,
			shared,
		]);
		expect((bound as () => boolean)()).toBe(true);
		const background = createLynxBackgroundFunctionRegistry();
		const retained = background.retain(unwrapThreadFunctionDescriptor(bound));
		expect(background.run(retained)).toBe(true);

		main.close();
		background.close();
	});

	it('keeps ref cells live only for an explicit worklet activation', () => {
		const ref = createLynxMainThreadRefDescriptor('test:counter');
		const descriptor = registerMainThreadWorklet(
			'test:increment',
			{ ref },
			function (amount) {
				const cell = this._c!.ref as unknown as LynxMainThreadRefCell<number>;
				cell.current += amount as number;
				return cell.current;
			},
			{ file: 'worklets.test.ts', line: 1, column: 0 },
		);
		const registry = createLynxMainThreadWorkletRegistry();
		registry.retainRef(ref, 2);
		const active = registry.activate(descriptor);

		expect(registry.runWorklet(active, [3])).toBe(5);
		registry.release(active);
		expect(() => registry.runWorklet(active, [1])).toThrow(/stale or foreign/);
		registry.close();
	});

	it('keeps captured ref cells stable while their host detaches and remounts', () => {
		const ref = createLynxMainThreadRefDescriptor('test:remount-ref');
		const descriptor = registerMainThreadWorklet('test:read-remount-ref', { ref }, function () {
			return (this._c!.ref as unknown as LynxMainThreadRefCell<unknown>).current;
		});
		const registry = createLynxMainThreadWorkletRegistry();
		const firstCell = registry.retainRef(ref, null);
		registry.updateRef(ref, { mount: 1 });
		const active = registry.activate(descriptor);
		const secondActive = registry.activate(descriptor);

		expect(registry.runWorklet(active)).toEqual({ mount: 1 });
		registry.releaseRef(ref);
		expect(registry.runWorklet(active)).toBeNull();
		const remountedCell = registry.retainRef(ref, null);
		registry.updateRef(ref, { mount: 2 });
		expect(remountedCell).toBe(firstCell);
		expect(registry.runWorklet(active)).toEqual({ mount: 2 });

		registry.releaseRef(ref);
		registry.release(active);
		const finalRemount = registry.retainRef(ref, null);
		expect(finalRemount).toBe(firstCell);
		registry.releaseRef(ref);
		registry.release(secondActive);

		const freshCell = registry.retainRef(ref, null);
		expect(freshCell).not.toBe(firstCell);
		registry.close();
	});

	it('persists initialized state across activations only while its component owner is retained', () => {
		const ref = createLynxMainThreadRefDescriptor('test:owned-state', 0);
		const descriptor = registerMainThreadWorklet(
			'test:increment-owned-state',
			{ ref },
			function () {
				const cell = this._c!.ref as unknown as LynxMainThreadRefCell<number>;
				return ++cell.current;
			},
		);
		const registry = createLynxMainThreadWorkletRegistry();
		const ownedCell = registry.retainOwner(ref) as LynxMainThreadRefCell<number>;

		const first = registry.activate(descriptor);
		expect(first._c?.ref).toEqual({ _wvid: 'test:owned-state' });
		expect(registry.runWorklet(first)).toBe(1);
		registry.release(first);
		const second = registry.activate(descriptor);
		expect(registry.runWorklet(second)).toBe(2);

		registry.releaseOwners();
		expect(ownedCell.current).toBe(2);
		expect(registry.runWorklet(second)).toBe(3);
		registry.release(second);
		expect(ownedCell.current).toBeNull();
		const remountedOwner = registry.retainOwner(ref) as LynxMainThreadRefCell<number>;
		expect(remountedOwner).not.toBe(ownedCell);
		expect(remountedOwner.current).toBe(0);
		const remounted = registry.activate(descriptor);
		expect(registry.runWorklet(remounted)).toBe(1);
		registry.release(remounted);
		registry.releaseOwner(ref);
		registry.close();
	});

	it('defers zero-retain ref collection across an acknowledgement owner publication', () => {
		const ref = createLynxMainThreadRefDescriptor('test:published-owner-state', 0);
		const increment = registerMainThreadWorklet(
			'test:increment-published-owner-state',
			{ ref },
			function () {
				const cell = this._c!.ref as unknown as LynxMainThreadRefCell<number>;
				return ++cell.current;
			},
		);
		const registry = createLynxMainThreadWorkletRegistry();
		registry.beginRefOwnerPublication();

		const beforeOwner = registry.activate(increment);
		expect(registry.runWorklet(beforeOwner)).toBe(1);
		registry.release(beforeOwner);
		const ownedCell = registry.retainOwner(ref) as LynxMainThreadRefCell<number>;
		expect(ownedCell.current).toBe(1);
		registry.finishRefOwnerPublication();

		registry.beginRefOwnerPublication();
		registry.releaseOwner(ref);
		const cleanup = registry.activate(increment);
		expect(registry.runWorklet(cleanup)).toBe(2);
		registry.release(cleanup);
		registry.finishRefOwnerPublication();
		expect(ownedCell.current).toBeNull();

		const fresh = registry.retainOwner(ref) as LynxMainThreadRefCell<number>;
		expect(fresh).not.toBe(ownedCell);
		expect(fresh.current).toBe(0);
		registry.releaseOwners();
		registry.beginRefOwnerPublication();
		registry.releaseOwners();
		expect(() => registry.beginRefOwnerPublication()).not.toThrow();
		registry.finishRefOwnerPublication();
		registry.close();
	});

	it('accepts structurally equal ref initializers isolated through sibling worklets', () => {
		const ref = createLynxMainThreadRefDescriptor('test:nested-initializer', { count: 0 });
		const first = registerMainThreadWorklet('test:first-ref-owner', { ref }, () => null);
		const second = registerMainThreadWorklet('test:second-ref-owner', { ref }, () => null);
		const outer = registerMainThreadWorklet('test:outer-ref-owner', { first, second }, () => null);
		const registry = createLynxMainThreadWorkletRegistry();
		const active = registry.activate(outer);
		expect(active._c).toEqual({
			first: { _wkltId: 'test:first-ref-owner', _c: { ref: { _wvid: 'test:nested-initializer' } } },
			second: {
				_wkltId: 'test:second-ref-owner',
				_c: { ref: { _wvid: 'test:nested-initializer' } },
			},
		});
		registry.release(active);
		registry.close();
	});

	it('nulls a detached host ref while owner retention preserves only its cell identity', () => {
		const ref = createLynxMainThreadRefDescriptor('test:owned-host', null);
		const registry = createLynxMainThreadWorkletRegistry();
		const ownedCell = registry.retainOwner(ref);
		const hostCell = registry.retainRef(ref, null);
		expect(hostCell).toBe(ownedCell);
		registry.updateRef(ref, { mount: 1 });

		registry.releaseRef(ref);
		expect(ownedCell.current).toBeNull();
		const remountedCell = registry.retainRef(ref, null);
		expect(remountedCell).toBe(ownedCell);
		registry.updateRef(ref, { mount: 2 });
		expect(ownedCell.current).toEqual({ mount: 2 });

		registry.releaseRef(ref);
		registry.releaseOwner(ref);
		const freshCell = registry.retainOwner(ref);
		expect(freshCell).not.toBe(ownedCell);
		registry.close();
	});

	it('invalidates active descriptors when their compiled definition reloads', () => {
		const descriptor = registerMainThreadWorklet('test:reload', {}, () => 'first');
		const registry = createLynxMainThreadWorkletRegistry();
		const active = registry.activate(descriptor);
		registerMainThreadWorklet('test:reload', {}, () => 'second');

		expect(() => registry.runWorklet(active)).toThrow(/reloaded/);
		registry.close();
	});

	it('pins nested captured worklet definitions to the outer activation lifetime', () => {
		const nested = registerMainThreadWorklet('test:nested-reload', {}, () => 'first');
		const outer = registerMainThreadWorklet('test:outer-reload', { nested }, function () {
			return (this._c!.nested as unknown as () => string)();
		});
		const registry = createLynxMainThreadWorkletRegistry();
		const active = registry.activate(outer);
		registerMainThreadWorklet('test:nested-reload', {}, () => 'second');

		expect(() => registry.runWorklet(active)).toThrow(/nested-reload.*reloaded/);
		registry.close();
	});

	it('makes escaped background callbacks inert with their owning activation', () => {
		let escaped: (() => unknown) | null = null;
		const callBackground = vi.fn(() => 'called');
		const descriptor = registerMainThreadWorklet(
			'test:escaped-background-owner',
			{ background: { _jsFnId: 'test:escaped-background' } },
			function () {
				escaped = this._c!.background as unknown as () => unknown;
			},
		);
		const registry = createLynxMainThreadWorkletRegistry({ callBackground });
		const active = registry.activate(descriptor);
		registry.runWorklet(active);
		registry.release(active);

		expect(() => escaped!()).toThrow(/worklet is stale/);
		expect(callBackground).not.toHaveBeenCalled();
		registry.close();
	});
});

describe('Lynx compiled thread functions', () => {
	it('attributes runtime capture failures to the authored function', () => {
		expect(() =>
			unwrapThreadFunctionDescriptor(
				bindThreadFunction('main-thread', 'test:invalid-capture', () => [() => 'unregistered'], {
					file: 'Card.tsrx',
					line: 7,
					column: 2,
				}),
			),
		).toThrow(/unregistered function.*Card\.tsrx:7:2/);
	});

	it('reads captures lazily after later lexical bindings initialize', () => {
		registerThreadFunction('background', 'test:lazy-capture', (captures) => captures[0]);
		let initialized = false;
		let value = 'before';
		const bound = bindThreadFunction('background', 'test:lazy-capture', () => {
			if (!initialized) throw new ReferenceError('capture accessed before initialization');
			return [value];
		});
		initialized = true;
		value = 'after';

		expect((bound as () => string)()).toBe('after');
		const descriptor = unwrapThreadFunctionDescriptor(bound);
		value = 'changed after serialization';
		expect(descriptor).toMatchObject({ _c: { values: ['after'] } });
		expect((bound as () => string)()).toBe('after');
	});

	it('invokes attached declarations without recursing through their compiler wrapper', () => {
		registerThreadFunction(
			'main-thread',
			'test:declaration',
			(captures, _receiver, args) => (captures[0] as number) + (args[0] as number),
		);
		const declaration = function (this: unknown, value: number): number {
			return invokeThreadFunction(declaration, this, [value]) as number;
		};
		attachThreadFunction(declaration, 'main-thread', 'test:declaration', () => [4]);

		expect(declaration(3)).toBe(7);
		expect(unwrapThreadFunctionDescriptor(declaration)).toEqual({
			_wkltId: 'test:declaration',
			_c: { values: [4] },
		});
	});

	it('retains component-local background captures for one explicit execution', () => {
		registerThreadFunction(
			'background',
			'test:background-capture',
			(captures, _receiver, args) => `${captures[0]}:${args[0]}`,
		);
		const bound = bindThreadFunction('background', 'test:background-capture', () => ['local']);
		expect(typeof bound).toBe('function');
		expect((bound as (value: string) => string)('direct')).toBe('local:direct');

		const registry = createLynxBackgroundFunctionRegistry();
		const raw = unwrapThreadFunctionDescriptor(bound);
		expect(registry.run(raw, ['before-retain'])).toBe('local:before-retain');
		const retained = registry.retain(raw);
		expect(retained).toEqual({
			_jsFnId: 'test:background-capture',
			_execId: 'exec:1',
			_c: { values: ['local'] },
		});
		expect(registry.run(retained, ['remote'])).toBe('local:remote');
		registry.release(retained._execId!);
		expect(() => registry.run(retained, ['late'])).toThrow(/stale or foreign/);
		registry.close();
	});

	it('keeps separate closures with one compiled background function identity', () => {
		registerThreadFunction('background', 'test:shared-background-site', (captures) => captures[0]);
		const first = unwrapThreadFunctionDescriptor(
			bindThreadFunction('background', 'test:shared-background-site', () => ['one']),
		);
		const second = unwrapThreadFunctionDescriptor(
			bindThreadFunction('background', 'test:shared-background-site', () => ['two']),
		);
		const registry = createLynxBackgroundFunctionRegistry();
		const retained = registry.retain([first, second]);

		expect(retained[0]._execId).not.toBe(retained[1]._execId);
		expect(registry.run(retained[0])).toBe('one');
		expect(registry.run(retained[1])).toBe('two');
		registry.release(retained[0]._execId!);
		expect(() => registry.run(retained[0])).toThrow(/stale or foreign/);
		expect(registry.run(retained[1])).toBe('two');
		registry.close();
	});

	it('hydrates composed background functions for direct and retained execution', () => {
		registerThreadFunction(
			'background',
			'test:background-child',
			(captures, _receiver, args) => (captures[0] as number) + (args[0] as number),
		);
		const child = bindThreadFunction('background', 'test:background-child', () => [2]);
		registerThreadFunction('background', 'test:background-parent', (captures, _receiver, args) =>
			(captures[0] as (value: number) => number)(args[0] as number),
		);
		const parent = bindThreadFunction('background', 'test:background-parent', () => [child]);

		expect((parent as (value: number) => number)(3)).toBe(5);
		const registry = createLynxBackgroundFunctionRegistry();
		const retained = registry.retain(unwrapThreadFunctionDescriptor(parent));
		expect(retained._c?.values[0]).toMatchObject({
			_jsFnId: 'test:background-child',
			_execId: 'exec:2',
		});
		expect(registry.run(retained, [4])).toBe(6);
		registry.close();
	});

	it('invalidates direct and runOn wrappers when a site definition reloads', async () => {
		registerThreadFunction('main-thread', 'test:tagged-reload', () => 'first');
		const tagged = bindThreadFunction('main-thread', 'test:tagged-reload', () => []);
		const call = runOnMainThread<[], string>(tagged as () => string);
		const uninstall = installBackgroundCallBridge({
			callMain: () => ({ promise: Promise.resolve('remote-first') }),
		});

		expect((tagged as () => string)()).toBe('first');
		await expect(call()).resolves.toBe('remote-first');
		registerThreadFunction('main-thread', 'test:tagged-reload', () => 'second');
		expect(() => (tagged as () => string)()).toThrow(/was reloaded/);
		await expect(call()).rejects.toThrow(/was reloaded/);
		uninstall();
	});

	it('retains background captures atomically only at the transport boundary', () => {
		registerThreadFunction('background', 'test:prepared-background', () => 'ready');
		const background = bindThreadFunction('background', 'test:prepared-background', () => []);
		const validMain = bindThreadFunction('main-thread', 'test:prepared-main', () => [background]);
		const missingBackground = bindThreadFunction('background', 'test:missing-background', () => []);
		const invalidMain = bindThreadFunction('main-thread', 'test:invalid-main', () => [
			missingBackground,
		]);
		const worklets = createLynxBackgroundFunctionRegistry();
		const container = createLynxClientContainer({ worklets });
		const driver = createLynxClientDriver();
		const encoded = driver.props!.encode!({
			container,
			name: 'main-thread:bindtap',
			value: validMain,
		} as never);

		expect(encoded).toMatchObject({
			kind: 'value',
			value: { _wkltId: 'test:prepared-main' },
		});
		expect(worklets.isActive('exec:1')).toBe(false);
		const batch = (handlers: readonly unknown[]): UniversalHostBatch => ({
			renderer: 'lynx',
			version: 1,
			commands: handlers.map((handler, index) => ({
				op: 'create' as const,
				id: index + 1,
				type: 'view',
				props: { 'main-thread:bindtap': handler },
			})),
		});

		expect(() => prepareLynxClientWorkletBatch(container, batch([validMain, invalidMain]))).toThrow(
			/background function test:missing-background is not registered/,
		);
		expect(worklets.isActive('exec:1')).toBe(false);
		const prepared = prepareLynxClientWorkletBatch(container, batch([validMain]));
		expect(prepared.commands[0]).toMatchObject({
			props: {
				'main-thread:bindtap': {
					_c: { values: [{ _jsFnId: 'test:prepared-background', _execId: 'exec:2' }] },
				},
			},
		});
		expect(worklets.isActive('exec:2')).toBe(true);
		worklets.close();
	});
});

describe('Lynx cross-thread call bridges', () => {
	it('allows a runOn wrapper to be declared before its root installs a bridge', async () => {
		const tagged = bindThreadFunction('main-thread', 'test:bootstrap-call', () => []);
		const call = runOnMainThread<[], string>(tagged as () => string);
		const uninstall = installBackgroundCallBridge({
			callMain: () => ({ promise: Promise.resolve('bootstrapped') }),
		});

		await expect(call()).resolves.toBe('bootstrapped');
		uninstall();
	});

	it('cancels once and prevents wrappers from crossing a bridge lifetime', async () => {
		let resolveRemote!: (value: string) => void;
		const remoteCancel = vi.fn();
		const uninstall = installBackgroundCallBridge({
			callMain: () => ({
				promise: new Promise<string>((resolve) => (resolveRemote = resolve)),
				cancel: remoteCancel,
			}),
		});
		const descriptor = registerMainThreadWorklet('test:remote-call', { value: 'capture' });
		const call = runOnMainThread<[string], string>(descriptor);
		const pending = call('request');
		pending.cancel('no longer needed');
		resolveRemote('late');

		await expect(pending).rejects.toThrow('no longer needed');
		expect(remoteCancel).toHaveBeenCalledOnce();
		uninstall();
		await expect(call('stale')).rejects.toThrow(/bridge is stale/);
	});
});
