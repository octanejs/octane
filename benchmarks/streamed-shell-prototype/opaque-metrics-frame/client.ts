import { attachBehaviorRoot } from 'octane/behavior';
import {
	createIndependentHydrateManifest,
	registerIndependentHydrationIsland,
} from 'octane/hydration';
import { bootstrapStreamedSignalHydration } from 'octane/hydration/streamed-signals';
import { runWithSignalOwner } from 'octane/signals';
import { adoptFrame, adoptReady } from './adapter.tsrx';
import { session$ } from './State.tsrx';
import type { FrameProps } from './Frame.tsrx';
import type { ReadyProps } from './Ready.tsrx';

export function start(name: string, timeoutMs: number, holdBehavior: boolean) {
	const bridge = bootstrapStreamedSignalHydration({
		buildId: 'opaque-build',
		documentId: name,
		timeoutMs,
	});
	const island = document.getElementById('island')!;
	const frame = document.getElementById('frame')!;
	const row = frame.querySelector('li')!;
	const manifest = createIndependentHydrateManifest(
		{
			version: 1,
			boundaryId: 'fixture',
			exportName: 'default',
			captureSchema: [],
			hookSeed: 0,
			idSeed: 0,
			signalSites: [],
			parentDependencies: false,
		},
		[],
		'fixture',
		'opaque-build',
		{ moduleId: 'fixture', styles: [] },
	);
	const state = {
		entered: false,
		unmounted: 0,
		timerStarts: 0,
		timerStops: 0,
		ticks: 0,
		frameSubscriptions: 0,
		readySubscriptions: 0,
		signalSubscriptions: 0,
		readyAdoptions: 0,
		clicks: 0,
		trusted: [] as boolean[],
		errors: [] as string[],
	};
	let readyResolve!: () => void;
	const ready = new Promise<void>((resolve) => {
		readyResolve = resolve;
	});
	let releaseBehavior!: () => void;
	const behaviorGate = new Promise<void>((resolve) => {
		releaseBehavior = resolve;
	});
	if (!holdBehavior) releaseBehavior();
	let framePublish: (() => void) | undefined;
	let readyPublish: (() => void) | undefined;
	const ownerRead = () => runWithSignalOwner(bridge.signalOwner, () => session$.snapshot());
	const onClick = (event: MouseEvent) => {
		state.clicks++;
		state.trusted.push(event.isTrusted);
	};
	const frameSource = {
		getSnapshot: (): FrameProps => ({
			rows: [{ id: 'timer', text: String(state.ticks) }],
			children: null,
		}),
		subscribe(notify: () => void) {
			state.frameSubscriptions++;
			framePublish = notify;
			return () => {
				state.frameSubscriptions--;
				framePublish = undefined;
			};
		},
	};
	const readySource = {
		getSnapshot: (): ReadyProps => {
			const snapshot = ownerRead();
			if (snapshot.status !== 'ready')
				throw new Error('The revealed ready view has no matching signal value');
			return { status: snapshot.value, onClick };
		},
		subscribe(notify: () => void) {
			state.readySubscriptions++;
			readyPublish = notify;
			return () => {
				state.readySubscriptions--;
				readyPublish = undefined;
			};
		},
	};
	const lifecycle = registerIndependentHydrationIsland(island, manifest, {
		signalOwner: bridge.signalOwner,
		loadStyles() {},
		async load() {
			return {
				default: () => {
					state.entered = true;
					const controller = new AbortController();
					const signalChanged = () => {
						if (ownerRead().status !== 'pending') readyResolve();
						readyPublish?.();
					};
					const stopSignal = runWithSignalOwner(bridge.signalOwner, () =>
						session$.subscribe(signalChanged),
					);
					state.signalSubscriptions++;
					signalChanged();
					const frameHandle = adoptFrame(frame, frameSource, controller.signal);
					const behavior = attachBehaviorRoot(frame, { signal: controller.signal });
					behavior.registerBehavior({
						target: '#ready button',
						events: ['click'],
						ready: Promise.all([ready, behaviorGate]),
						adopt(element, context) {
							const root = element.closest('#ready');
							if (!root) throw new Error('The button left its ready view');
							const handle = adoptReady(root, readySource, context.signal);
							state.readyAdoptions++;
							return () => handle.dispose();
						},
						// A queued original event has already finished dispatch. A synchronous
						// adoption during capture instead installs the authored listener before
						// this same event reaches the button.
						handleEvent(event, element) {
							const target = event.target;
							if (
								event.eventPhase === Event.NONE &&
								target instanceof Node &&
								element.contains(target)
							)
								onClick(event as MouseEvent);
						},
					});
					state.timerStarts++;
					const timer = setInterval(() => {
						state.ticks++;
						framePublish?.();
					}, 400);
					return {
						unmount() {
							state.unmounted++;
							clearInterval(timer);
							state.timerStops++;
							controller.abort();
							frameHandle.dispose();
							stopSignal();
							state.signalSubscriptions--;
						},
					};
				},
			};
		},
		onError(error) {
			state.errors.push(String(error));
		},
	});
	return {
		state() {
			return {
				...structuredClone(state),
				signal: ownerRead().status,
				clientLoads:
					(globalThis as typeof globalThis & { __opaqueClientLoads?: number })
						.__opaqueClientLoads ?? 0,
				frameConnected: frame.isConnected,
				sameFrame: frame === document.getElementById('frame'),
				sameRow: row === frame.querySelector('li'),
				rowText: row.textContent,
				readyText: document.querySelector('#ready span')?.textContent ?? null,
				pending: document.querySelector('#pending')?.textContent ?? null,
				error: document.querySelector('#error')?.textContent ?? null,
			};
		},
		dispose() {
			lifecycle();
		},
		disposeBridge() {
			bridge.dispose();
		},
		releaseBehavior,
	};
}
