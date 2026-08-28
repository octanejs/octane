import { ROW_COUNT } from './contract.mjs';

export type StateSetter = (value: number | ((previous: number) => number)) => void;
export type Mode = 'visible' | 'hidden';
export type Shape = 'flat' | 'nested' | 'plain';
export type Counts = {
	layoutMounts: number;
	layoutCleanups: number;
	passiveMounts: number;
	passiveCleanups: number;
};

const countKeys = ['layoutMounts', 'layoutCleanups', 'passiveMounts', 'passiveCleanups'] as const;

const zeroCounts = (): Counts => ({
	layoutMounts: 0,
	layoutCleanups: 0,
	passiveMounts: 0,
	passiveCleanups: 0,
});

export function ensure(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export class Model {
	readonly displayStyle = Object.freeze({ display: 'inline-block' });
	readonly layoutActive = new Set<number>();
	readonly passiveActive = new Set<number>();
	readonly setters: Array<StateSetter | null> = Array.from({ length: ROW_COUNT }, () => null);
	readonly total = zeroCounts();
	private baseline = zeroCounts();
	private readonly listeners = new Set<() => void>();

	connectLayout(index: number, setState: StateSetter) {
		ensure(!this.layoutActive.has(index), `Duplicate layout setup for row ${index}`);
		this.layoutActive.add(index);
		this.setters[index] = setState;
		this.total.layoutMounts++;
		this.notify();
		return () => {
			ensure(this.layoutActive.delete(index), `Duplicate layout cleanup for row ${index}`);
			this.total.layoutCleanups++;
			this.notify();
		};
	}

	connectPassive(index: number) {
		ensure(!this.passiveActive.has(index), `Duplicate passive setup for row ${index}`);
		this.passiveActive.add(index);
		this.total.passiveMounts++;
		this.notify();
		return () => {
			ensure(this.passiveActive.delete(index), `Duplicate passive cleanup for row ${index}`);
			this.total.passiveCleanups++;
			this.notify();
		};
	}

	onChange(listener: () => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify() {
		for (const listener of this.listeners) listener();
	}

	resetSample() {
		this.baseline = { ...this.total };
	}

	sample(): Counts {
		return Object.fromEntries(
			countKeys.map((key) => [key, this.total[key] - this.baseline[key]]),
		) as Counts;
	}

	assertReleased() {
		ensure(this.layoutActive.size === 0, 'Layout effects remain connected after unmount');
		ensure(this.passiveActive.size === 0, 'Passive effects remain connected after unmount');
		ensure(
			this.total.layoutMounts === this.total.layoutCleanups,
			`Unbalanced layout effects: ${JSON.stringify(this.total)}`,
		);
		ensure(
			this.total.passiveMounts === this.total.passiveCleanups,
			`Unbalanced passive effects: ${JSON.stringify(this.total)}`,
		);
		this.setters.fill(null);
		this.listeners.clear();
	}
}

export type AppProps = {
	model: Model;
	shape: Shape;
	mode: Mode;
	innerMode: Mode;
	generation: number;
	tick: number;
};

export type Renderer = {
	render: (props: AppProps) => void;
	flush: (callback: () => void) => void;
	unmount: () => void;
};
