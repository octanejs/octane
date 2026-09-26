import { bootstrapStreamedSignalHydration } from 'octane/hydration/streamed-signals';
import { currentSignalOwner, runWithSignalOwner } from 'octane/signals';
import { start } from '../opaque-metrics-frame/client.ts';
import { session$ } from '../opaque-metrics-frame/State.tsrx';

type Root = { unmount(): void };

export async function begin(name: string, mode: 'early' | 'ordinary', invalidContainer = false) {
	(globalThis as any).__recoveryRenderer = {
		starts: 0,
		stops: 0,
		active: 0,
		ticks: 0,
		renderOwnerChecks: 0,
		renderOwnerMatched: false,
	};
	const frame = document.getElementById('frame')!;
	const row = frame.querySelector('li')!;
	const island = document.getElementById('island')!;
	const identity = structuredClone(
		(globalThis as any).__octaneStreamedSignalSelections.identities[0],
	);
	let early: ReturnType<typeof start> | undefined;
	let bridge: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
	if (mode === 'early') early = start(name, 1800, false);
	else
		bridge = bootstrapStreamedSignalHydration({
			buildId: 'opaque-build',
			documentId: name,
			timeoutMs: 1800,
		});
	const owner = currentSignalOwner();
	if (!owner) throw new Error('No document signal owner');
	(globalThis as any).__recoveryOwner = owner;
	let root: Root | undefined;
	let disposed = false;
	let generation = 0;
	let observer: MutationObserver | undefined;
	let stopSignal: (() => void) | undefined;
	let pending: Promise<void> | undefined;
	let sentinel: Element | null = null;
	const state = {
		phase: mode === 'early' ? 'early' : 'loading-ordinary',
		attempts: 0,
		imports: 0,
		adoptions: 0,
		declines: 0,
		disposals: 0,
		errors: [] as string[],
		ownerMatched: false,
	};
	const read = () => runWithSignalOwner(owner, () => session$.snapshot());
	const marked = () => island.querySelector('template[data-oct-b][data-oct-err]');
	function retireWatchers() {
		observer?.disconnect();
		observer = undefined;
		stopSignal?.();
		stopSignal = undefined;
	}
	function recover() {
		if (disposed || pending || state.phase !== 'early' || read().status !== 'error') return pending;
		const current = marked();
		if (!current) return;
		sentinel = current;
		const ticket = generation;
		state.attempts++;
		pending = (async () => {
			const fallback = await import('./fallback.ts');
			state.imports++;
			if (
				disposed ||
				ticket !== generation ||
				!island.isConnected ||
				document.getElementById('island') !== island ||
				marked() !== current ||
				read().status !== 'error'
			) {
				state.declines++;
				return;
			}
			const tick = early!.state().ticks;
			retireWatchers();
			early!.dispose();
			state.phase = 'handoff';
			state.adoptions++;
			root = fallback.hydrate(owner, tick, invalidContainer);
			state.ownerMatched = currentSignalOwner() === owner;
			state.phase = 'renderer';
		})().catch((error) => {
			state.errors.push(String(error));
			state.phase = disposed ? 'disposed' : 'failed';
		});
		return pending;
	}
	if (early) {
		observer = new MutationObserver(recover);
		observer.observe(island, { subtree: true, childList: true, attributes: true });
		stopSignal = runWithSignalOwner(owner, () => session$.subscribe(recover));
		recover();
	} else {
		const fallback = await import('./fallback.ts');
		state.imports++;
		state.adoptions++;
		root = fallback.hydrate(owner, 0, false);
		state.ownerMatched = currentSignalOwner() === owner;
		state.phase = 'renderer';
	}
	return {
		recover,
		state() {
			return {
				...structuredClone(state),
				early: early?.state() ?? null,
				renderer: structuredClone((globalThis as any).__recoveryRenderer),
				signal: read().status,
				ownerMatched: state.ownerMatched,
				frameConnected: frame.isConnected,
				sameFrame: frame === document.getElementById('frame'),
				sameRow: row === document.querySelector('#frame li'),
				rowText: document.querySelector('#frame li')?.textContent ?? null,
				pending: document.getElementById('pending')?.textContent ?? null,
				error: document.getElementById('error')?.textContent ?? null,
				marked: !!marked(),
				sentinelId: sentinel?.getAttribute('data-oct-b') ?? null,
				clientLoads: (globalThis as any).__opaqueClientLoads ?? 0,
				identity,
			};
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			generation++;
			state.disposals++;
			retireWatchers();
			if (root) root.unmount();
			else early?.dispose();
			state.phase = 'disposed';
		},
		disposeBridge() {
			early?.disposeBridge();
			bridge?.dispose();
		},
	};
}
