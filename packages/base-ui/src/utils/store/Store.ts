// Ported from .base-ui/packages/utils/src/store/Store.ts (v1.6.0). The observer-pattern data
// store used by every Base UI popup (Dialog/Popover/Tooltip/Menu/…). Pure state management —
// the ONLY octane adaptation is the `.use()` hook method, which forwards an explicit slot to the
// slot-based `useStore` (octane hooks are keyed by compiler/threaded slot, not call order).
import { useStore } from './useStore';

type Listener<T> = (state: T) => void;

export class Store<State> {
	state: State;

	private listeners: Set<Listener<State>>;

	// Internal state to handle recursive `setState()` calls.
	private updateTick: number;

	constructor(state: State) {
		this.state = state;
		this.listeners = new Set();
		this.updateTick = 0;
	}

	subscribe = (fn: Listener<State>) => {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	};

	getSnapshot = () => {
		return this.state;
	};

	setState(newState: State) {
		if (this.state === newState) {
			return;
		}

		this.state = newState;
		this.updateTick += 1;

		const currentTick = this.updateTick;
		for (const listener of this.listeners) {
			if (currentTick !== this.updateTick) {
				// A recursive `setState` already notified all listeners.
				return;
			}
			listener(newState);
		}
	}

	update(changes: Partial<State>) {
		for (const key in changes) {
			if (!Object.is(this.state[key], changes[key])) {
				this.setState({ ...this.state, ...changes });
				return;
			}
		}
	}

	set<T>(key: keyof State, value: T) {
		if (!Object.is(this.state[key], value)) {
			this.setState({ ...this.state, [key]: value });
		}
	}

	notifyAll() {
		const newState = { ...this.state };
		this.setState(newState);
	}

	// octane: slot is threaded explicitly (was `use(selector, ...args)` in React).
	use<F extends (...args: any) => any>(
		selector: F,
		slot: symbol | undefined,
		a1?: unknown,
		a2?: unknown,
		a3?: unknown,
	): ReturnType<F> {
		return useStore(this, selector as any, slot, a1, a2, a3) as ReturnType<F>;
	}
}

export type ReadonlyStore<State> = Pick<Store<State>, 'getSnapshot' | 'subscribe' | 'state'>;
