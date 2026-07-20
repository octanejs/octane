import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	type UniversalRoot,
} from 'octane/universal/native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getLynx,
	getNativeModules,
	lynxPlatformAvailability,
	reload,
	reportError,
	useGlobalProps,
	useGlobalPropsChanged,
	useInitData,
	useInitDataChanged,
	useLynxGlobalEventListener,
} from '../src/platform.js';

type GlobalListener = (...args: unknown[]) => void;

class TestGlobalEventEmitter {
	readonly listeners = new Map<string, Set<GlobalListener>>();

	addListener(eventName: string, listener: GlobalListener): void {
		let listeners = this.listeners.get(eventName);
		if (listeners === undefined) {
			listeners = new Set();
			this.listeners.set(eventName, listeners);
		}
		listeners.add(listener);
	}

	removeListener(eventName: string, listener: GlobalListener): void {
		const listeners = this.listeners.get(eventName);
		listeners?.delete(listener);
		if (listeners?.size === 0) this.listeners.delete(eventName);
	}

	emit(eventName: string, data: unknown): void {
		const args = Array.isArray(data) ? data : [data];
		for (const listener of [...(this.listeners.get(eventName) ?? [])]) listener(...args);
	}
}

interface TestBackgroundLynx {
	__initData: Record<string, unknown>;
	__presetData: Record<string, unknown>;
	__globalProps: Record<string, unknown>;
	getJSModule(name: string): TestGlobalEventEmitter;
	reload(data: object, callback: () => void): void;
	reportError(error: string | Error, options?: { level?: 'error' | 'warning' }): void;
}

interface PlatformRender {
	readonly initData: Record<string, unknown>;
	readonly globalProps: Record<string, unknown>;
}

interface PlatformFixtureProps {
	readonly eventName: string;
	readonly listener: (...args: unknown[]) => void;
	readonly onInitDataChanged: (data: Record<string, unknown>) => void;
	readonly onGlobalPropsChanged: (data: Record<string, unknown>) => void;
	readonly onRender: (value: PlatformRender) => void;
}

const PlatformFixture = defineUniversalComponent('lynx', (props: PlatformFixtureProps) => {
	const initData = useInitData();
	const globalProps = useGlobalProps();
	useInitDataChanged(props.onInitDataChanged);
	useGlobalPropsChanged(props.onGlobalPropsChanged);
	useLynxGlobalEventListener(props.eventName, props.listener);
	props.onRender({ initData, globalProps });
	return null;
});

const roots: UniversalRoot[] = [];

function createRoot(): UniversalRoot {
	const root = createUniversalRoot(createObjectContainer('lynx'), createObjectDriver('lynx'));
	roots.push(root);
	return root;
}

function installBackgroundRuntime(options?: {
	readonly initData?: Record<string, unknown>;
	readonly globalProps?: Record<string, unknown>;
}) {
	const emitter = new TestGlobalEventEmitter();
	const reloads: object[] = [];
	const reports: Array<readonly [string | Error, { level?: 'error' | 'warning' } | undefined]> = [];
	const initialData = { ...options?.initData };
	const runtime: TestBackgroundLynx = {
		__initData: initialData,
		__presetData: initialData,
		__globalProps: { ...options?.globalProps },
		getJSModule(name) {
			if (name !== 'GlobalEventEmitter') throw new Error(`Unexpected JS module ${name}.`);
			return emitter;
		},
		reload(data, callback) {
			reloads.push(data);
			callback();
		},
		reportError(error, reportOptions) {
			reports.push([error, reportOptions]);
		},
	};
	const nativeModules = {
		bridge: {
			call() {},
			on() {},
		},
		AccountModule: { currentAccount: 'account-a' },
	};
	vi.stubGlobal('lynx', runtime);
	vi.stubGlobal('NativeModules', nativeModules);
	return { emitter, nativeModules, reloads, reports, runtime };
}

async function flushScheduledRender(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
	vi.unstubAllGlobals();
});

describe.sequential('@octanejs/lynx background platform boundary', () => {
	it('forwards only published background globals and page request APIs', () => {
		const { nativeModules, reloads, reports, runtime } = installBackgroundRuntime();
		const completed = vi.fn();
		const warning = new Error('expected warning');

		expect(getLynx()).toBe(runtime);
		expect(getNativeModules()).toBe(nativeModules);
		reload({ accountId: 'account-b' }, completed);
		reportError(warning, { level: 'warning' });

		expect(reloads).toEqual([{ accountId: 'account-b' }]);
		expect(completed).toHaveBeenCalledOnce();
		expect(reports).toEqual([[warning, { level: 'warning' }]]);
		expect(lynxPlatformAvailability).toMatchObject({
			available: false,
			implementedMilestone: 4,
			status: 'source-test-only-native-lifecycle-gates-blocked',
		});
	});

	it('renders init/global updates and replaces global listeners without stale delivery', async () => {
		const { emitter, runtime } = installBackgroundRuntime({
			initData: { accountId: 'account-a', count: 1 },
			globalProps: { locale: 'en-GB', theme: 'light' },
		});
		const renders: PlatformRender[] = [];
		const initChanges: Record<string, unknown>[] = [];
		const globalChanges: Record<string, unknown>[] = [];
		const firstListener = vi.fn();
		const secondListener = vi.fn();
		const root = createRoot();
		const props = (listener: (...args: unknown[]) => void): PlatformFixtureProps => ({
			eventName: 'account-event',
			listener,
			onInitDataChanged(data) {
				initChanges.push(data);
			},
			onGlobalPropsChanged(data) {
				globalChanges.push(data);
			},
			onRender(value) {
				renders.push(value);
			},
		});

		root.render(PlatformFixture, props(firstListener));
		expect(renders.at(-1)).toEqual({
			initData: { accountId: 'account-a', count: 1 },
			globalProps: { locale: 'en-GB', theme: 'light' },
		});

		emitter.emit('onDataChanged', [{ count: 2 }]);
		await flushScheduledRender();
		expect(initChanges.at(-1)).toEqual({ accountId: 'account-a', count: 2 });
		expect(renders.at(-1)?.initData).toEqual({ accountId: 'account-a', count: 2 });

		runtime.__globalProps = { locale: 'fr-FR', theme: 'dark' };
		emitter.emit('onGlobalPropsChanged', [runtime.__globalProps]);
		await flushScheduledRender();
		expect(globalChanges.at(-1)).toEqual({ locale: 'fr-FR', theme: 'dark' });
		expect(renders.at(-1)?.globalProps).toEqual({ locale: 'fr-FR', theme: 'dark' });

		emitter.emit('account-event', ['first', 1]);
		expect(firstListener).toHaveBeenLastCalledWith('first', 1);
		root.render(PlatformFixture, props(secondListener));
		emitter.emit('account-event', ['second', 2]);
		expect(firstListener).toHaveBeenCalledOnce();
		expect(secondListener).toHaveBeenLastCalledWith('second', 2);

		root.unmount();
		emitter.emit('account-event', ['late', 3]);
		emitter.emit('onDataChanged', [{ count: 3 }]);
		expect(secondListener).toHaveBeenCalledOnce();
		expect(initChanges.at(-1)).toEqual({ accountId: 'account-a', count: 2 });
	});

	it('replaces init data on reset and observes an update published before layout subscription', async () => {
		const { emitter, runtime } = installBackgroundRuntime({
			initData: { accountId: 'account-a', stale: true },
		});
		const renders: Record<string, unknown>[] = [];
		let updateDuringRender = true;
		const RaceFixture = defineUniversalComponent('lynx', () => {
			const initData = useInitData() as Record<string, unknown>;
			renders.push(initData);
			if (updateDuringRender) {
				updateDuringRender = false;
				runtime.__initData = { accountId: 'account-b', count: 1 };
				// No store listener exists until the layout phase. The post-subscribe
				// snapshot check must still observe the runtime's current data.
				emitter.emit('onDataChanged', [{ accountId: 'account-b', count: 1 }]);
			}
			return null;
		});

		createRoot().render(RaceFixture, undefined);
		await flushScheduledRender();
		expect(renders).toEqual([
			{ accountId: 'account-a', stale: true },
			{ accountId: 'account-b', count: 1 },
		]);

		runtime.__initData = { accountId: 'account-c' };
		emitter.emit('onDataChanged', [{ accountId: 'account-c' }]);
		await flushScheduledRender();
		expect(renders.at(-1)).toEqual({ accountId: 'account-c' });
	});

	it('rejects accidental main-thread access before touching similarly named globals', () => {
		const mainReload = vi.fn();
		const mainReport = vi.fn();
		vi.stubGlobal('lynx', { reload: mainReload, reportError: mainReport });
		vi.stubGlobal('NativeModules', { AccountModule: {} });

		expect(() => getLynx()).toThrow(/only in the Lynx background runtime/);
		expect(() => getNativeModules()).toThrow(/only in the Lynx background runtime/);
		expect(() => reload({})).toThrow(/only in the Lynx background runtime/);
		expect(() => reportError('main-thread misuse')).toThrow(/only in the Lynx background runtime/);
		expect(mainReload).not.toHaveBeenCalled();
		expect(mainReport).not.toHaveBeenCalled();

		const GuardedFixture = defineUniversalComponent('lynx', () => {
			useInitData();
			return null;
		});
		expect(() => createRoot().render(GuardedFixture, undefined)).toThrow(
			/only in the Lynx background runtime/,
		);
	});
});
