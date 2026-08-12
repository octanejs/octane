import { raf } from '@react-spring/rafz';
import { createElement, useLayoutEffect, useState } from 'octane';
import { FrameValue } from '../core/FrameValue';
import { resolveAnimatedStyle } from './AnimatedStyle';
import { applyAnimatedValues } from './applyAnimatedValues';

const STATE = Symbol.for('octane-react-spring:animated-host-state');
const EFFECT = Symbol.for('octane-react-spring:animated-host-effect');
const FALLBACK = Symbol.for('octane-react-spring:animated-host-fallback');

function isPlainObject(value: any): value is Record<string, any> {
	if (!value || typeof value !== 'object') return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function collect(value: any, found = new Set<FrameValue<any>>()): Set<FrameValue<any>> {
	if (value instanceof FrameValue) found.add(value);
	else if (Array.isArray(value)) for (const item of value) collect(item, found);
	else if (isPlainObject(value)) for (const key in value) collect(value[key], found);
	return found;
}

function read(value: any): any {
	if (value instanceof FrameValue) return value.get();
	if (Array.isArray(value)) return value.map(read);
	if (isPlainObject(value)) {
		const result: Record<string, any> = {};
		for (const key in value) result[key] = read(value[key]);
		return result;
	}
	return value;
}

function snapshot(props: Record<string, any>): Record<string, any> {
	const result = read(props);
	if (props.style) result.style = resolveAnimatedStyle(props.style);
	return result;
}

function forwardRef(ref: any, value: any): void {
	if (typeof ref === 'function') ref(value);
	else if (ref) ref.current = value;
}

function createAnimatedComponent(Component: any) {
	return function AnimatedComponent(props: Record<string, any>): unknown {
		const deps = [...collect(props)];
		const initial = snapshot(props);
		const [state] = useState(
			() => ({ node: null as any, deps, props, pending: false, live: true }),
			STATE,
		);
		const [, forceUpdate] = useState(0, FALLBACK);
		state.deps = deps;
		state.props = props;
		state.live = true;
		const ref = (node: any) => {
			state.node = node;
			forwardRef(props.ref, node);
		};

		useLayoutEffect(
			() => {
				state.live = true;
				const apply = () => {
					state.pending = false;
					if (!state.live) return;
					if (!state.node) {
						forceUpdate((version) => version + 1);
						return;
					}
					applyAnimatedValues(state.node, snapshot(state.props));
					if (state.props.children instanceof FrameValue) {
						state.node.textContent = String(state.props.children.get() ?? '');
					}
				};
				const schedule = () => {
					if (state.pending) return;
					state.pending = true;
					raf.write(apply);
				};
				const cleanups = state.deps.map((dep: FrameValue<any>) => dep.onChange(schedule));
				apply();
				return () => {
					state.live = false;
					state.pending = false;
					for (const cleanup of cleanups) cleanup();
					raf.cancel(apply);
				};
			},
			deps,
			EFFECT,
		);
		return createElement(Component, { ...initial, ref });
	};
}

const cache = new Map<any, ReturnType<typeof createAnimatedComponent>>();
function animatedFactory(Component: any) {
	let wrapped = cache.get(Component);
	if (!wrapped) {
		wrapped = createAnimatedComponent(Component);
		cache.set(Component, wrapped);
	}
	return wrapped;
}

export const animated = new Proxy(animatedFactory, {
	apply(_target, _this, args: [any]) {
		return animatedFactory(args[0]);
	},
	get(_target, key) {
		return typeof key === 'string' ? animatedFactory(key) : undefined;
	},
}) as typeof animatedFactory & Record<string, ReturnType<typeof createAnimatedComponent>>;

export const a = animated;
