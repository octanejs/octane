// React-free behavioral port of react-spring v10.1.2 packages/core/src/Controller.ts.
import { hasReservedProps, inferTo } from '../upstream-compat';
import {
	type AnimationResult,
	getCancelledResult,
	getFinishedResult,
	getNoopResult,
} from './AnimationResult';
import { type SpringConfig, type SpringUpdate, SpringValue } from './SpringValue';

type StateRecord = Record<string, any>;
export type ControllerTo<State extends StateRecord> =
	| Partial<State>
	| ((
			next: (update: ControllerUpdate<State> | Partial<State>) => Promise<AnimationResult<State>>,
	  ) => Promise<void> | void);

export interface ControllerUpdate<State extends StateRecord> {
	default?: boolean | Partial<ControllerUpdate<State>>;
	from?: Partial<State>;
	to?: ControllerTo<State>;
	config?: SpringConfig | ((key: keyof State) => SpringConfig);
	immediate?: boolean | ((key: keyof State) => boolean);
	delay?: number;
	cancel?: boolean;
	pause?: boolean;
	reset?: boolean;
	loop?: boolean | (() => boolean | Partial<ControllerUpdate<State>>);
	onStart?: (result: AnimationResult<State>, controller: Controller<State>) => void;
	onChange?: (result: AnimationResult<State>, controller: Controller<State>) => void;
	onRest?: (result: AnimationResult<State>, controller: Controller<State>) => void;
	onResolve?: (result: AnimationResult<State>, controller: Controller<State>) => void;
}

export class Controller<State extends StateRecord = StateRecord> {
	springs: { [Key in keyof State]: SpringValue<State[Key]> } = {} as any;
	private runId = 0;
	private paused = false;
	private defaults: Partial<ControllerUpdate<State>> = {};
	constructor(props: ControllerUpdate<State> = {}) {
		props = normalizeUpdate(props);
		if (props.default === true) this.defaults = withoutTargets(props);
		else if (typeof props.default === 'object') this.defaults = props.default;
		const initial = {
			...props.from,
			...(props.from ? undefined : typeof props.to === 'object' ? props.to : undefined),
		} as State;
		for (const key in initial) this.springs[key] = new SpringValue(initial[key]);
	}
	get(): State {
		const value: StateRecord = {};
		for (const key in this.springs) value[key] = this.springs[key].get();
		return value as State;
	}
	set(values: Partial<State>): this {
		for (const key in values)
			this.ensure(key as keyof State, values[key] as State[keyof State]).set(values[key]!);
		return this;
	}
	start(update: ControllerUpdate<State> = {}): Promise<AnimationResult<State>> {
		update = normalizeUpdate(update);
		if (update.default === true) this.defaults = { ...this.defaults, ...withoutTargets(update) };
		else if (typeof update.default === 'object')
			this.defaults = { ...this.defaults, ...update.default };
		update = normalizeUpdate({ ...this.defaults, ...update });
		const runId = ++this.runId;
		return this.run(update, runId);
	}
	pause(): this {
		if (!this.paused) {
			this.paused = true;
			for (const key in this.springs) this.springs[key].pause();
		}
		return this;
	}
	resume(): this {
		if (this.paused) {
			this.paused = false;
			for (const key in this.springs) this.springs[key].resume();
		}
		return this;
	}
	stop(cancel = false): this {
		this.runId++;
		for (const key in this.springs) this.springs[key].stop(cancel);
		return this;
	}

	private async run(
		update: ControllerUpdate<State>,
		runId: number,
	): Promise<AnimationResult<State>> {
		if (update.cancel) {
			this.stop(true);
			return getCancelledResult(this.get());
		}
		if (update.pause === true) {
			this.pause();
			return getFinishedResult(this.get(), false);
		}
		if (update.pause === false) this.resume();
		if ((update.delay ?? 0) > 0) {
			await new Promise<void>((resolve) => setTimeout(resolve, update.delay));
			if (runId !== this.runId) return getCancelledResult(this.get());
			update = { ...update, delay: undefined };
		}
		const to = update.to;
		if (typeof to === 'function') {
			let last = getNoopResult(this.get());
			await to(async (next) => {
				if (runId !== this.runId) return getCancelledResult(this.get());
				const step = isControllerUpdate(next)
					? { ...update, ...next, loop: undefined }
					: { ...update, to: next, loop: undefined };
				last = await this.run(normalizeUpdate(step), runId);
				return last;
			});
			if (runId !== this.runId) return getCancelledResult(this.get());
			const result = { ...last, value: this.get() };
			update.onRest?.(result, this);
			update.onResolve?.(result, this);
			return result;
		}
		const from: Partial<State> = update.from ?? {};
		const target: Partial<State> = to ?? {};
		for (const key in from) this.ensure(key as keyof State, from[key] as State[keyof State]);
		let started = false;
		const promises = Object.keys(target).map((key) => {
			const typedKey = key as keyof State;
			const spring = this.ensure(
				typedKey,
				(from[typedKey] ?? target[typedKey]) as State[typeof typedKey],
			);
			const props: SpringUpdate<State[typeof typedKey]> = {
				to: target[typedKey]!,
				reset: update.reset,
				delay: update.delay,
				config: typeof update.config === 'function' ? update.config(typedKey) : update.config,
				immediate:
					typeof update.immediate === 'function' ? update.immediate(typedKey) : update.immediate,
				onStart: () => {
					if (!started) {
						started = true;
						update.onStart?.(getFinishedResult(this.get(), false), this);
					}
				},
				onChange: () => update.onChange?.(getFinishedResult(this.get(), false), this),
			};
			// Upstream ignores `from` except on reset; initial values come from construction.
			if (update.reset && from[typedKey] !== undefined) props.from = from[typedKey];
			return spring.start(props);
		});
		const results = await Promise.all(promises);
		if (runId !== this.runId) return getCancelledResult(this.get());
		let result: AnimationResult<State> = {
			value: this.get(),
			finished: results.every((item) => item.finished),
			cancelled: results.some((item) => item.cancelled),
			...(results.length === 0 ? { noop: true } : {}),
		};
		const loop = update.loop;
		const nextLoop = typeof loop === 'function' ? loop() : loop;
		if (nextLoop && result.finished) {
			result = await this.run(
				{ ...update, ...(typeof nextLoop === 'object' ? nextLoop : {}), reset: true, loop },
				runId,
			);
			return result;
		}
		update.onRest?.(result, this);
		update.onResolve?.(result, this);
		return result;
	}
	private ensure<Key extends keyof State>(key: Key, initial: State[Key]): SpringValue<State[Key]> {
		return (this.springs[key] ??= new SpringValue(initial));
	}
}

function normalizeUpdate<State extends StateRecord>(
	update: ControllerUpdate<State> | Partial<State>,
): ControllerUpdate<State> {
	return inferTo(update as object) as ControllerUpdate<State>;
}

function withoutTargets<State extends StateRecord>(
	update: ControllerUpdate<State>,
): Partial<ControllerUpdate<State>> {
	const { from: _from, to: _to, default: _default, ...defaults } = update;
	return defaults;
}

function isControllerUpdate<State extends StateRecord>(
	value: ControllerUpdate<State> | Partial<State>,
): value is ControllerUpdate<State> {
	// Check reserved keys on the raw object. Do not run inferTo here: shorthand
	// steps like `{ x: 1 }` must stay on the `to: next` path so the parent async
	// `to` function is replaced rather than left in place. Lifecycle keys such as
	// onRest/onStart must still count as updates so they are not animated.
	return hasReservedProps(value as object);
}
