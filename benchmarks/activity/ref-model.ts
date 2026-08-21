import { ROW_COUNT } from './contract.mjs';
import { ensure, type Mode } from './model';

export type RefCounts = { attaches: number; cleanups: number };
type RefCallback = (element: HTMLButtonElement | null) => () => void;

export class RefModel {
	readonly active = new Map<number, { element: HTMLButtonElement; variant: number }>();
	readonly total: RefCounts = { attaches: 0, cleanups: 0 };
	readonly callbacks: readonly (readonly RefCallback[])[];
	private baseline: RefCounts = { attaches: 0, cleanups: 0 };

	constructor() {
		this.callbacks = [0, 1].map((variant) =>
			Array.from({ length: ROW_COUNT }, (_, index) => (element: HTMLButtonElement | null) => {
				ensure(element !== null, `Cleanup-bearing ref ${index} received a null attachment`);
				ensure(!this.active.has(index), `Ref ${index} attached before its prior cleanup`);
				this.active.set(index, { element, variant });
				this.total.attaches++;
				return () => {
					const active = this.active.get(index);
					ensure(
						active?.element === element && active.variant === variant,
						`Ref ${index} cleaned up the wrong attachment`,
					);
					this.active.delete(index);
					this.total.cleanups++;
				};
			}),
		);
	}

	resetSample() {
		this.baseline = { ...this.total };
	}

	sample(): RefCounts {
		return {
			attaches: this.total.attaches - this.baseline.attaches,
			cleanups: this.total.cleanups - this.baseline.cleanups,
		};
	}

	assertReleased() {
		ensure(this.active.size === 0, 'Ordinary tree retained refs after unmount');
		ensure(
			this.total.attaches === this.total.cleanups,
			`Unbalanced ref lifetimes: ${JSON.stringify(this.total)}`,
		);
	}
}

export type RefProps = { model: RefModel; present: boolean; variant: 0 | 1; depth: number };
export type RefRenderer = { render: (props: RefProps) => void; unmount: () => void };
export type RefPrimer = (container: HTMLElement, modes: readonly Mode[]) => () => void;
