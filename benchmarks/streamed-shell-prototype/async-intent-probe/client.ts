import {
	createIndependentHydrateManifest,
	registerIndependentHydrationIsland,
} from 'octane/hydration';

export function start(mode: 'loader' | 'async' | 'sync' | 'dispose') {
	const element = document.getElementById('island')!;
	const button = document.getElementById('action')!;
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
		'fixture-build',
		{ moduleId: 'fixture.js', styles: [] },
	);
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const state = {
		entered: false,
		settled: false,
		unmounts: 0,
		handled: 0,
		lateWork: 0,
		contextHasSignal: false,
		bubbled: [] as { trusted: boolean; prevented: boolean }[],
		received: [] as { trusted: boolean; prevented: boolean; targetConnected: boolean }[],
		errors: [] as string[],
	};
	const onBubble = (event: Event) =>
		state.bubbled.push({ trusted: event.isTrusted, prevented: event.defaultPrevented });
	document.addEventListener('click', onBubble);
	const onClick = () => state.handled++;
	const activate = (context: { intents: readonly { event: Event }[] }) => {
		state.entered = true;
		state.contextHasSignal = 'signal' in context;
		const snapshotIntents = () =>
			context.intents.map(({ event }) => ({
				trusted: event.isTrusted,
				prevented: event.defaultPrevented,
				targetConnected: (event.target as Node | null)?.isConnected ?? false,
			}));
		state.received = snapshotIntents();
		const finish = () => {
			state.received = snapshotIntents();
			if (mode === 'dispose') state.lateWork++;
			else button.addEventListener('click', onClick);
			state.settled = true;
			return {
				unmount() {
					state.unmounts++;
					button.removeEventListener('click', onClick);
				},
			};
		};
		return mode === 'async' || mode === 'dispose' ? gate.then(finish) : finish();
	};
	const dispose = registerIndependentHydrationIsland(element, manifest, {
		async load() {
			if (mode === 'loader') await gate;
			return { default: activate };
		},
		loadStyles() {},
		onError(error) {
			state.errors.push(String(error));
		},
	});
	return {
		state: () => structuredClone(state),
		release,
		dispose,
		cleanup() {
			dispose();
			document.removeEventListener('click', onBubble);
		},
	};
}
