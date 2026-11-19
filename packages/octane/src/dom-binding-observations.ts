import type { NativeReadSubscription } from './signals/read-protocol.js';

/** One connection's uncommitted subscriptions and superseded committed ones. */
export interface BindingObservationOwner {
	pending: Map<NativeReadSubscription, number> | undefined;
	retired: Map<NativeReadSubscription, number> | undefined;
	selectedAt: number;
}

/** Observation belongs to a committed binding presentation, not its preparation. */
export interface BindingObservations {
	owner(): BindingObservationOwner;
	add(owner: BindingObservationOwner, stop: NativeReadSubscription): boolean;
	release(owner: BindingObservationOwner, stop: NativeReadSubscription): void;
	notify(
		owner: BindingObservationOwner,
		stop: NativeReadSubscription | undefined,
		notify: () => void,
	): void;
	retire(owner: BindingObservationOwner, stop: NativeReadSubscription | undefined): void;
	retired(): boolean;
	accept(owner: BindingObservationOwner): void;
	clear(): void;
	publish(): void;
	dispose(): void;
}

/** A selected capability may supply the shared observation lifetime; older factories need not. */
export type BindingObservationFactory<Factory extends (...args: never[]) => unknown> = ((
	...args: Parameters<Factory>
) => ReturnType<Factory>) & {
	readonly observations?: typeof __createBindingObservations;
};

/** Keep the constructor reachable only through an actually selected capability. */
export function __withBindingObservations<Factory extends (...args: never[]) => unknown>(
	factory: Factory,
): Factory & { observations: typeof __createBindingObservations } {
	const selected = factory as Factory & { observations: typeof __createBindingObservations };
	selected.observations = __createBindingObservations;
	return selected;
}

/** Optional lifetime shared by the signal capabilities selected for one binding view. */
export function __createBindingObservations(invalidate: () => void): BindingObservations {
	const staged = new Set<BindingObservationOwner>();
	const selected = new Set<BindingObservationOwner>();
	const promoted = new Set<BindingObservationOwner>();
	let version = 0;
	let selection = 0;
	let disposed = false;
	let ended = false;
	const drain = (stops: Map<NativeReadSubscription, number> | undefined, upper: number): void => {
		let failed = false;
		let failure: unknown;
		for (const [stop, acquired] of stops ?? []) {
			if (acquired > upper) continue;
			stops!.delete(stop);
			try {
				stop();
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
		}
		if (failed) throw failure;
	};
	return {
		owner: () => ({ pending: undefined, retired: undefined, selectedAt: 0 }),
		add(owner, stop) {
			if (disposed) {
				stop();
				return false;
			}
			(owner.pending ??= new Map()).set(stop, ++version);
			staged.add(owner);
			return true;
		},
		release(owner, stop) {
			if (owner.pending?.delete(stop) || disposed) {
				if (!owner.pending?.size && !owner.retired?.size) staged.delete(owner);
				stop();
			} else {
				(owner.retired ??= new Map()).set(stop, ++version);
				staged.add(owner);
			}
		},
		notify(owner, stop, notify) {
			if (disposed) return;
			if (!stop || owner.pending?.size || owner.retired?.size) invalidate();
			else notify();
		},
		retire(owner, stop) {
			if (disposed) return;
			if (stop && !owner.pending?.has(stop)) ended = true;
			invalidate();
		},
		retired: () => ended,
		accept(owner) {
			if (disposed || (!owner.pending?.size && !owner.retired?.size)) return;
			owner.selectedAt = ++selection;
			selected.add(owner);
		},
		clear() {
			for (const owner of selected) owner.selectedAt = 0;
			selected.clear();
		},
		publish() {
			const upper = version;
			const selectedUpper = selection;
			for (const owner of selected) {
				if (disposed) return;
				if (owner.selectedAt > selectedUpper) continue;
				selected.delete(owner);
				owner.selectedAt = 0;
				promoted.add(owner);
				for (const [stop, acquired] of owner.pending ?? []) {
					if (disposed) return;
					if (acquired > upper) continue;
					owner.pending!.delete(stop);
					stop.observation?.setObserved(true);
				}
			}
			let failed = false;
			let failure: unknown;
			for (const owner of promoted) {
				if (disposed) break;
				promoted.delete(owner);
				try {
					drain(owner.retired, upper);
				} catch (error) {
					if (!failed) {
						failed = true;
						failure = error;
					}
				}
				if (!owner.pending?.size && !owner.retired?.size) staged.delete(owner);
			}
			if (failed) throw failure;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			selected.clear();
			promoted.clear();
			let failed = false;
			let failure: unknown;
			for (const owner of staged) {
				staged.delete(owner);
				for (const stops of [owner.pending, owner.retired]) {
					try {
						drain(stops, Infinity);
					} catch (error) {
						if (!failed) {
							failed = true;
							failure = error;
						}
					}
				}
			}
			if (failed) throw failure;
		},
	};
}
