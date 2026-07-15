import { createElement, useEffect, useRef, useState } from 'octane';

type AnyRecord = Record<string, any>;

export class SpringValue<T> {
	private readonly value: T;

	constructor(value: T) {
		this.value = value;
	}

	get(): T {
		return this.value;
	}

	to<U>(interpolator: (value: T) => U): DerivedValue<U> {
		return new DerivedValue(() => interpolator(this.value));
	}
}

class DerivedValue<T> {
	private readonly read: () => T;

	constructor(read: () => T) {
		this.read = read;
	}

	get(): T {
		return this.read();
	}
}

function valueOf(value: any): any {
	if (value && typeof value.get === 'function') return value.get();
	if (Array.isArray(value)) return value.map(valueOf);
	if (value && typeof value === 'object') {
		const result: AnyRecord = {};
		for (const [key, child] of Object.entries(value)) result[key] = valueOf(child);
		return result;
	}
	return value;
}

function animatedHost(tag: string) {
	return function AnimatedHost(props: AnyRecord) {
		const { children, ...hostProps } = valueOf(props);
		if (children === undefined) return createElement(tag, hostProps);
		return createElement(tag, hostProps, ...(Array.isArray(children) ? children : [children]));
	};
}

export const animated = new Proxy(Object.create(null), {
	get(target, property: string) {
		return target[property] ??= animatedHost(property);
	},
}) as Record<string, (props: AnyRecord) => unknown>;

export function to<T extends readonly unknown[], R>(
	inputs: T,
	interpolator: (...values: { [K in keyof T]: T[K] extends SpringValue<infer V> ? V : T[K] }) => R,
): DerivedValue<R> {
	return new DerivedValue(() => interpolator(...inputs.map(valueOf) as any));
}

function springTarget(config: AnyRecord): AnyRecord {
	if (config.to && typeof config.to === 'object') return config.to;
	const { from: _from, to: _to, reset: _reset, delay: _delay, config: _config, ...target } = config;
	return target;
}

function interpolate(from: AnyRecord, target: AnyRecord, progress: number): AnyRecord {
	const result: AnyRecord = {};
	for (const key of new Set([...Object.keys(from), ...Object.keys(target)])) {
		const start = from[key];
		const end = target[key];
		result[key] = typeof start === 'number' && typeof end === 'number'
			? start + (end - start) * progress
			: progress < 1
				? start ?? end
				: end;
	}
	return result;
}

function targetKey(value: AnyRecord): string {
	return JSON.stringify(
		value,
		(_key, child) => (typeof child === 'function' ? '[function]' : child),
	);
}

export function useSpring(config: AnyRecord): AnyRecord {
	const target = springTarget(config);
	const key = targetKey(target);
	const targetRef = useRef(target);
	const keyRef = useRef(key);
	const mountedRef = useRef(false);
	const [values, setValues] = useState(target);

	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			targetRef.current = target;
			keyRef.current = key;
			return;
		}
		if (keyRef.current === key) return;
		const start =
			config.reset && config.from ? config.from : targetRef.current;
		targetRef.current = target;
		keyRef.current = key;
		if (typeof requestAnimationFrame === 'undefined') {
			setValues(target);
			return;
		}
		const startedAt = performance.now() + (config.delay ?? 0);
		let frame = 0;
		const tick = (now: number) => {
			const progress = Math.max(0, Math.min(1, (now - startedAt) / 250));
			setValues(interpolate(start, target, progress));
			if (progress < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [key]);

	const wrapped: AnyRecord = {};
	for (const [name, value] of Object.entries(values)) wrapped[name] = new SpringValue(value);
	return wrapped;
}

function transitionStyle(
	config: AnyRecord,
	item: any,
	phase: 'from' | 'enter' | 'update' | 'leave',
) {
	const candidate = config[phase] ?? config.update ?? config.enter;
	return typeof candidate === 'function' ? candidate(item) : candidate ?? {};
}

/**
 * React-spring-compatible transition projection. It keeps leaving entries for
 * one animation frame and interpolates numeric style fields in one hook cell,
 * so keyed Visx series retain their enter/update/leave behavior without hooks
 * inside item loops.
 */
export function useTransition(items: any[], config: AnyRecord) {
	const keyFor = config.keys ?? config.key ?? ((item: any, index: number) => item?.key ?? index);
	const projected = items.map(
		(item, index) => ({
			item,
			key: keyFor(item, index),
			style: transitionStyle(config, item, 'update'),
		}),
	);
	const signature = targetKey(projected.map(({ key, style }) => ({ key, style })));
	const signatureRef = useRef(signature);
	const [entries, setEntries] = useState(projected);

	useEffect(() => {
		if (signatureRef.current === signature) return;
		signatureRef.current = signature;
		setEntries((previous) => {
			const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
			const next = projected.map(
				(entry) => ({
					...entry,
					style: previousByKey.has(entry.key)
						? transitionStyle(config, entry.item, 'update')
						: transitionStyle(config, entry.item, 'enter'),
				}),
			);
			const liveKeys = new Set(next.map((entry) => entry.key));
			const leaving = previous.filter((entry) => !liveKeys.has(entry.key)).map(
				(entry) => ({ ...entry, style: transitionStyle(config, entry.item, 'leave') }),
			);
			if (leaving.length && typeof requestAnimationFrame !== 'undefined') {
				requestAnimationFrame(() => setEntries(next));
			}
			return [...next, ...leaving];
		});
	}, [signature]);

	return (renderer: (style: AnyRecord, item: any, state: { key: any }, index: number) => unknown) =>
		entries.map((entry, index) => {
			const style: AnyRecord = {};
			for (const [name, value] of Object.entries(entry.style)) style[name] = new SpringValue(value);
			return renderer(style, entry.item, { key: entry.key }, index);
		});
}
