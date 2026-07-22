import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import {
	defineUniversalComponent,
	universalActivity,
	universalComponent,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useEffect,
	useLayoutEffect,
	type UniversalComponent,
} from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { root as firstScreenRoot } from '../src/first-screen.js';
import { createLynxRoot, type LynxPublicHandle, type LynxRoot } from '../src/index.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import * as firstScreen from '../src/main-renderer.js';
import { LYNX_BACKGROUND_TO_MAIN_EVENT, type LynxContextProxy } from '../src/core/protocol.js';

interface Deferred<Value> {
	readonly promise: Promise<Value>;
	resolve(value: Value): void;
	reject(error: Error): void;
}

interface RetainedSceneProps {
	readonly pending: Promise<string> | null;
	readonly value: string;
	readonly fail: boolean;
	readonly activityMode: 'visible' | 'hidden';
	readonly log: (entry: string) => void;
	readonly capturePrimary: (handle: LynxPublicHandle | null) => void;
	readonly captureActivity: (handle: LynxPublicHandle | null) => void;
	readonly captureErrorReset: (reset: () => void) => void;
}

interface InstalledEnvironment {
	readonly dom: JSDOM;
	readonly main: LynxMainThreadController;
}

const backgroundTextPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
	children: [
		{
			kind: 'host',
			type: 'text',
			children: [{ kind: 'text', slot: 1 }],
		},
	],
});

const firstScreenTextPlan = firstScreen.universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
	children: [
		{
			kind: 'host',
			type: 'text',
			children: [{ kind: 'text', slot: 1 }],
		},
	],
});

const BackgroundPrimary = defineUniversalComponent('lynx', (props: RetainedSceneProps) => {
	useLayoutEffect(
		() => {
			props.log('primary:layout');
			return () => props.log('primary:layout-cleanup');
		},
		[],
		'primary-layout',
	);
	useEffect(
		() => {
			props.log('primary:passive');
			return () => props.log('primary:passive-cleanup');
		},
		[],
		'primary-passive',
	);
	const value = props.pending === null ? props.value : use(props.pending);
	return universalValue(backgroundTextPlan, [
		universalProps([
			['set', 'id', 'primary'],
			['set', 'ref', props.capturePrimary],
		]),
		value,
	]);
});

const BackgroundActivity = defineUniversalComponent('lynx', (props: RetainedSceneProps) => {
	useLayoutEffect(
		() => {
			props.log('activity:layout');
			return () => props.log('activity:layout-cleanup');
		},
		[],
		'activity-layout',
	);
	useEffect(
		() => {
			props.log('activity:passive');
			return () => props.log('activity:passive-cleanup');
		},
		[],
		'activity-passive',
	);
	return universalValue(backgroundTextPlan, [
		universalProps([
			['set', 'id', 'activity'],
			['set', 'ref', props.captureActivity],
		]),
		'activity',
	]);
});

const BackgroundRetainedScene = defineUniversalComponent('lynx', (props: RetainedSceneProps) => [
	universalTry(
		() => universalComponent('lynx', BackgroundPrimary, props),
		() =>
			universalValue(backgroundTextPlan, [universalProps([['set', 'id', 'fallback']]), 'loading']),
		(error) =>
			universalValue(backgroundTextPlan, [
				universalProps([['set', 'id', 'suspense-error']]),
				(error as Error).message,
			]),
	),
	universalTry(
		() => {
			if (props.fail) throw new Error('scene failed');
			return universalValue(backgroundTextPlan, [
				universalProps([['set', 'id', 'healthy']]),
				'healthy',
			]);
		},
		null,
		(error, reset) => {
			props.captureErrorReset(reset);
			return universalValue(backgroundTextPlan, [
				universalProps([['set', 'id', 'caught']]),
				(error as Error).message,
			]);
		},
	),
	universalActivity(props.activityMode, () =>
		universalComponent('lynx', BackgroundActivity, props),
	),
]);

const FirstScreenPrimary = firstScreen.defineUniversalComponent(
	'lynx',
	(props: RetainedSceneProps) => {
		const value = props.pending === null ? props.value : firstScreen.use(props.pending);
		return firstScreen.universalValue(firstScreenTextPlan, [
			firstScreen.universalProps([
				['set', 'id', 'primary'],
				['set', 'ref', props.capturePrimary],
			]),
			value,
		]);
	},
);

const FirstScreenActivity = firstScreen.defineUniversalComponent(
	'lynx',
	(props: RetainedSceneProps) =>
		firstScreen.universalValue(firstScreenTextPlan, [
			firstScreen.universalProps([
				['set', 'id', 'activity'],
				['set', 'ref', props.captureActivity],
			]),
			'activity',
		]),
);

const FirstScreenRetainedScene = firstScreen.defineUniversalComponent(
	'lynx',
	(props: RetainedSceneProps) => [
		firstScreen.universalTry(
			() => firstScreen.universalComponent('lynx', FirstScreenPrimary, props),
			() =>
				firstScreen.universalValue(firstScreenTextPlan, [
					firstScreen.universalProps([['set', 'id', 'fallback']]),
					'loading',
				]),
			(error) =>
				firstScreen.universalValue(firstScreenTextPlan, [
					firstScreen.universalProps([['set', 'id', 'suspense-error']]),
					(error as Error).message,
				]),
		),
		firstScreen.universalTry(
			() => {
				if (props.fail) throw new Error('scene failed');
				return firstScreen.universalValue(firstScreenTextPlan, [
					firstScreen.universalProps([['set', 'id', 'healthy']]),
					'healthy',
				]);
			},
			null,
			(error, reset) => {
				props.captureErrorReset(reset);
				return firstScreen.universalValue(firstScreenTextPlan, [
					firstScreen.universalProps([['set', 'id', 'caught']]),
					(error as Error).message,
				]);
			},
		),
		firstScreen.universalActivity(props.activityMode, () =>
			firstScreen.universalComponent('lynx', FirstScreenActivity, props),
		),
	],
);

let installed: InstalledEnvironment | null = null;
let backgroundRoot: LynxRoot | null = null;

function deferred<Value>(): Deferred<Value> {
	let resolve!: (value: Value) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<Value>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function mainContext(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getJSContext(): LynxContextProxy };
		}
	).lynx.getJSContext();
}

function installEnvironment(
	configurePAPI?: (target: Record<string, unknown>) => void,
	wrapContext?: (context: LynxContextProxy) => LynxContextProxy,
): InstalledEnvironment {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	globalThis.lynxTestingEnv.switchToMainThread();
	const target = globalThis as unknown as Record<string, unknown>;
	configurePAPI?.(target);
	const main = installLynxMainThread({
		firstScreen: true,
		firstScreenSync: 'manual',
		context: wrapContext?.(mainContext()) ?? mainContext(),
	});
	installed = { dom, main };
	return installed;
}

async function flushBackgroundWork(): Promise<void> {
	for (let index = 0; index < 6; index++) await Promise.resolve();
	await backgroundRoot?.flushTransport();
	for (let index = 0; index < 3; index++) await Promise.resolve();
}

afterEach(async () => {
	if (installed !== null) globalThis.lynxTestingEnv.switchToBackgroundThread();
	if (backgroundRoot !== null) {
		try {
			await backgroundRoot.unmount();
		} catch {
			// Accepted-fault tests may already have terminally disposed the root.
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

describe.sequential('Lynx Milestone 8 retained integration', () => {
	it('adopts fallback, error, and hidden Activity nodes before retaining live content', async () => {
		const { dom, main } = installEnvironment();
		const initial = deferred<string>();
		const log: string[] = [];
		const primaryRefs: Array<LynxPublicHandle | null> = [];
		const activityRefs: Array<LynxPublicHandle | null> = [];
		const errorResets: Array<() => void> = [];
		const stableProps = {
			log: (entry: string) => log.push(entry),
			capturePrimary: (handle: LynxPublicHandle | null) => primaryRefs.push(handle),
			captureActivity: (handle: LynxPublicHandle | null) => activityRefs.push(handle),
			captureErrorReset: (reset: () => void) => errorResets.push(reset),
		};
		const props = (
			pending: Promise<string> | null,
			overrides: Partial<Pick<RetainedSceneProps, 'activityMode' | 'fail' | 'value'>> = {},
		): RetainedSceneProps => ({
			...stableProps,
			pending,
			value: overrides.value ?? 'ready',
			fail: overrides.fail ?? true,
			activityMode: overrides.activityMode ?? 'hidden',
		});

		firstScreenRoot.render(
			FirstScreenRetainedScene as UniversalComponent<RetainedSceneProps>,
			props(initial.promise),
		);
		const page = dom.window.document.querySelector('page')!;
		const firstFallback = page.querySelector('#fallback')!;
		const firstError = page.querySelector('#caught')!;
		const firstActivity = page.querySelector('#activity')!;
		expect(firstFallback.textContent).toBe('loading');
		expect(firstError.textContent).toBe('scene failed');
		expect(firstActivity.hasAttribute('hidden')).toBe(true);
		expect(page.querySelector('#primary')).toBeNull();
		expect(log).toEqual([]);
		expect(primaryRefs).toEqual([]);
		expect(activityRefs).toEqual([]);

		globalThis.lynxTestingEnv.switchToBackgroundThread();
		backgroundRoot = createLynxRoot();
		const adopting = backgroundRoot.render(BackgroundRetainedScene, props(initial.promise));
		await Promise.resolve();
		globalThis.lynxTestingEnv.switchToMainThread();
		main.markFirstScreenSyncReady();
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		await adopting;
		await flushBackgroundWork();

		expect(page.querySelector('#fallback')).toBe(firstFallback);
		expect(page.querySelector('#caught')).toBe(firstError);
		expect(page.querySelector('#activity')).toBe(firstActivity);
		expect(firstActivity.hasAttribute('hidden')).toBe(true);
		expect(activityRefs).toHaveLength(1);
		const activityHandle = activityRefs[0]!;
		expect(activityHandle).toMatchObject({ active: true, attached: true });
		expect(log).not.toContain('activity:layout');
		expect(log).not.toContain('activity:passive');

		initial.resolve('first-ready');
		await initial.promise;
		await flushBackgroundWork();
		const primary = page.querySelector('#primary')!;
		const primaryHandle = primaryRefs.at(-1)!;
		expect(primary.textContent).toBe('first-ready');
		expect(page.querySelector('#fallback')).toBeNull();
		expect(primaryHandle).toMatchObject({ active: true, attached: true });
		expect(log).toEqual(expect.arrayContaining(['primary:layout', 'primary:passive']));

		const retained = deferred<string>();
		log.length = 0;
		await backgroundRoot.render(
			BackgroundRetainedScene,
			props(retained.promise, { activityMode: 'visible', fail: false }),
		);
		await flushBackgroundWork();
		expect(page.querySelector('#primary')).toBe(primary);
		expect(primary.hasAttribute('hidden')).toBe(true);
		expect(page.querySelector('#fallback')?.textContent).toBe('loading');
		expect(primaryRefs.at(-1)).toBeNull();
		expect(log).toEqual(
			expect.arrayContaining([
				'primary:layout-cleanup',
				'primary:passive-cleanup',
				'activity:layout',
				'activity:passive',
			]),
		);
		expect(page.querySelector('#activity')).toBe(firstActivity);
		expect(firstActivity.hasAttribute('hidden')).toBe(false);
		expect(activityRefs).toEqual([activityHandle]);
		expect(page.querySelector('#caught')).toBe(firstError);
		expect(page.querySelector('#healthy')).toBeNull();
		errorResets.at(-1)!();
		await flushBackgroundWork();
		expect(page.querySelector('#healthy')).not.toBeNull();
		expect(page.querySelector('#caught')).toBeNull();

		retained.resolve('retained-ready');
		await retained.promise;
		await flushBackgroundWork();
		expect(page.querySelector('#primary')).toBe(primary);
		expect(primary.hasAttribute('hidden')).toBe(false);
		expect(primary.textContent).toBe('retained-ready');
		expect(primaryRefs.at(-1)).toBe(primaryHandle);

		const rejected = deferred<string>();
		await backgroundRoot.render(
			BackgroundRetainedScene,
			props(rejected.promise, { activityMode: 'visible', fail: false }),
		);
		rejected.reject(new Error('asset failed'));
		await rejected.promise.catch(() => undefined);
		await flushBackgroundWork();
		expect(page.querySelector('#primary')).toBeNull();
		expect(page.querySelector('#fallback')).toBeNull();
		expect(page.querySelector('#suspense-error')?.textContent).toBe('asset failed');
		expect(primaryHandle.active).toBe(false);

		log.length = 0;
		await backgroundRoot.render(
			BackgroundRetainedScene,
			props(rejected.promise, { activityMode: 'hidden', fail: false }),
		);
		await flushBackgroundWork();
		expect(page.querySelector('#activity')).toBe(firstActivity);
		expect(firstActivity.hasAttribute('hidden')).toBe(true);
		expect(activityRefs).toEqual([activityHandle]);
		expect(log).toEqual(
			expect.arrayContaining(['activity:layout-cleanup', 'activity:passive-cleanup']),
		);

		await backgroundRoot.unmount();
		backgroundRoot = null;
		expect(page.children).toHaveLength(0);
		expect(activityHandle.active).toBe(false);
		expect(activityRefs.at(-1)).toBeNull();
		expect(main.activeIdentity()).toBeNull();
	});

	it('never mutates the accepted native tree for a suspended attempt that is abandoned', async () => {
		const { dom, main } = installEnvironment();
		globalThis.lynxTestingEnv.switchToMainThread();
		main.markFirstScreenSyncReady();
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		const pending = deferred<string>();
		const refs: Array<LynxPublicHandle | null> = [];
		const log: string[] = [];
		const Scene = defineUniversalComponent(
			'lynx',
			(props: { readonly id: string; readonly pending: Promise<string> | null }) => {
				useLayoutEffect(
					() => {
						log.push(`layout:${props.id}`);
						return () => log.push(`layout-cleanup:${props.id}`);
					},
					[props.id],
					'abandoned-layout',
				);
				const value = props.pending === null ? props.id : use(props.pending);
				return universalValue(backgroundTextPlan, [
					universalProps([
						['set', 'id', value],
						['set', 'ref', (handle: LynxPublicHandle | null) => refs.push(handle)],
					]),
					value,
				]);
			},
		);

		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(Scene, { id: 'accepted', pending: null });
		await flushBackgroundWork();
		const page = dom.window.document.querySelector('page')!;
		const accepted = page.querySelector('#accepted')!;
		const acceptedHandle = refs.at(-1)!;
		const observer = new dom.window.MutationObserver(() => {});
		observer.observe(page, {
			attributes: true,
			childList: true,
			subtree: true,
			characterData: true,
		});

		const suspended = await backgroundRoot.render(Scene, {
			id: 'abandoned',
			pending: pending.promise,
		});
		await flushBackgroundWork();
		expect(suspended.status).toBe('suspended');
		expect(observer.takeRecords()).toEqual([]);
		expect(page.querySelector('#accepted')).toBe(accepted);
		expect(refs.at(-1)).toBe(acceptedHandle);
		expect(log).toEqual(['layout:accepted']);

		await backgroundRoot.render(Scene, { id: 'winner', pending: null });
		await flushBackgroundWork();
		expect(page.querySelector('#winner')).toBe(accepted);
		expect(log).toEqual(['layout:accepted', 'layout-cleanup:accepted', 'layout:winner']);
		observer.takeRecords();
		const acceptedWinnerHTML = page.innerHTML;

		pending.resolve('late-result');
		await pending.promise;
		await flushBackgroundWork();
		expect(observer.takeRecords()).toEqual([]);
		expect(page.innerHTML).toBe(acceptedWinnerHTML);
		expect(page.querySelector('#winner')).toBe(accepted);
		expect(refs.at(-1)).toBe(acceptedHandle);
		observer.disconnect();
	});

	it('rolls back a pre-ACK rejection but exposes and terminally cleans an accepted fault', async () => {
		let rejectNextCommit = false;
		let faultNextSetId = false;
		const { dom } = installEnvironment(
			(target) => {
				const setId = target.__SetID as (node: object, id: string | null) => void;
				target.__SetID = (node: object, id: string | null) => {
					setId(node, id);
					if (!faultNextSetId) return;
					faultNextSetId = false;
					throw new Error('accepted native fault');
				};
			},
			(delegate) => {
				const listeners = new Map<
					(event: { readonly data: unknown }) => void,
					(event: { readonly data: unknown }) => void
				>();
				return Object.freeze({
					dispatchEvent(event) {
						delegate.dispatchEvent(event);
					},
					addEventListener(type, listener) {
						const wrapped = (event: { readonly data: unknown }) => {
							const message = event.data as {
								readonly type?: unknown;
								readonly batch?: {
									readonly commands?: readonly Record<string, unknown>[];
								};
							};
							if (
								rejectNextCommit &&
								type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
								message.type === 'commit' &&
								Array.isArray(message.batch?.commands)
							) {
								rejectNextCommit = false;
								listener({
									...event,
									data: {
										...(event.data as Record<string, unknown>),
										batch: {
											...(message.batch as Record<string, unknown>),
											commands: [
												...message.batch.commands,
												{ op: 'update', id: 999_999, props: { id: 'invalid' } },
											],
										},
									},
								});
								return;
							}
							listener(event);
						};
						listeners.set(listener, wrapped);
						delegate.addEventListener(type, wrapped);
					},
					removeEventListener(type, listener) {
						const wrapped = listeners.get(listener);
						delegate.removeEventListener(type, wrapped ?? listener);
						listeners.delete(listener);
					},
				});
			},
		);
		globalThis.lynxTestingEnv.switchToMainThread();
		installed!.main.markFirstScreenSyncReady();
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		const log: string[] = [];
		const refs: Array<LynxPublicHandle | null> = [];
		const Scene = defineUniversalComponent('lynx', (props: { readonly id: string }) => {
			useLayoutEffect(
				() => {
					log.push(`layout:${props.id}`);
					return () => log.push(`layout-cleanup:${props.id}`);
				},
				[props.id],
				'fault-layout',
			);
			return universalValue(backgroundTextPlan, [
				universalProps([
					['set', 'id', props.id],
					['set', 'ref', (handle: LynxPublicHandle | null) => refs.push(handle)],
				]),
				props.id,
			]);
		});

		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(Scene, { id: 'accepted' });
		await flushBackgroundWork();
		const page = dom.window.document.querySelector('page')!;
		const accepted = page.querySelector('#accepted')!;
		const handle = refs.at(-1)!;
		log.length = 0;

		rejectNextCommit = true;
		await expect(backgroundRoot.render(Scene, { id: 'rejected' })).rejects.toThrow();
		await flushBackgroundWork();
		expect(page.querySelector('#accepted')).toBe(accepted);
		expect(page.querySelector('#rejected')).toBeNull();
		expect(refs.at(-1)).toBe(handle);
		expect(log).toEqual([]);

		await backgroundRoot.render(Scene, { id: 'recovered' });
		await flushBackgroundWork();
		expect(page.querySelector('#recovered')).toBe(accepted);
		expect(refs.at(-1)).toBe(handle);
		expect(log).toEqual(['layout-cleanup:accepted', 'layout:recovered']);

		faultNextSetId = true;
		await expect(backgroundRoot.render(Scene, { id: 'faulted' })).rejects.toThrow(
			'accepted native fault',
		);
		expect(page.querySelector('#faulted')).toBe(accepted);

		await backgroundRoot.unmount();
		backgroundRoot = null;
		expect(page.children).toHaveLength(0);
		expect(handle.active).toBe(false);
		expect(refs.at(-1)).toBeNull();
	});
});
