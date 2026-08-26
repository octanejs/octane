import {
	InputRenderable,
	InputRenderableEvents,
	isRenderable,
	SelectRenderable,
	SelectRenderableEvents,
	TabSelectRenderable,
	TabSelectRenderableEvents,
	TextareaRenderable,
	type BaseRenderable,
} from '@opentui/core';
import type { UniversalEventPriority } from 'octane/universal';

export interface CallbackEnvironment {
	eventScope<T>(priority: UniversalEventPriority, run: () => T): T;
}

type Props = Readonly<Record<string, unknown>>;

const callbackCaches = new WeakMap<
	CallbackEnvironment,
	WeakMap<(...args: any[]) => unknown, Map<string, (...args: any[]) => unknown>>
>();

function callbackPriority(name: string): UniversalEventPriority {
	if (
		name === 'onMouseMove' ||
		name === 'onMouseDrag' ||
		name === 'onMouseOver' ||
		name === 'onMouseOut' ||
		name === 'onMouseScroll'
	) {
		return 'continuous';
	}
	if (name === 'renderBefore' || name === 'renderAfter' || name === 'onSizeChange') {
		return 'default';
	}
	return 'discrete';
}

function wrapCallback(
	environment: CallbackEnvironment,
	name: string,
	handler: (...args: any[]) => unknown,
): (...args: any[]) => unknown {
	let environmentCache = callbackCaches.get(environment);
	if (environmentCache === undefined) {
		environmentCache = new WeakMap();
		callbackCaches.set(environment, environmentCache);
	}
	let handlerCache = environmentCache.get(handler);
	if (handlerCache === undefined) {
		handlerCache = new Map();
		environmentCache.set(handler, handlerCache);
	}
	const cached = handlerCache.get(name);
	if (cached !== undefined) return cached;
	const priority = callbackPriority(name);
	const wrapped = function openTUIHostCallback(this: unknown, ...args: unknown[]): unknown {
		return environment.eventScope(priority, () => handler.apply(this, args));
	};
	handlerCache.set(name, wrapped);
	return wrapped;
}

/** Preserve OpenTUI's multi-argument callback API while entering Octane's scheduler scope. */
export function materializeOpenTUIProps(environment: CallbackEnvironment, props: Props): Props {
	const output: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(props)) {
		output[name] =
			typeof value === 'function'
				? wrapCallback(environment, name, value as (...args: any[]) => unknown)
				: value;
	}
	return output;
}

function updateEmitterListener(
	instance: BaseRenderable,
	eventName: string,
	listener: unknown,
	previousListener: unknown,
): void {
	if (typeof previousListener === 'function') {
		instance.off(eventName, previousListener as (...args: any[]) => void);
	}
	if (typeof listener === 'function') {
		instance.on(eventName, listener as (...args: any[]) => void);
	}
}

function setStyle(instance: BaseRenderable, styles: unknown, oldStyles: unknown): void {
	if (oldStyles !== null && typeof oldStyles === 'object') {
		for (const styleName of Object.keys(oldStyles)) {
			if (styles === null || typeof styles !== 'object' || !(styleName in styles)) {
				Reflect.set(instance, styleName, null);
			}
		}
	}
	if (styles !== null && typeof styles === 'object') {
		for (const [styleName, value] of Object.entries(styles)) {
			if (!Object.is(value, (oldStyles as Record<string, unknown> | null)?.[styleName])) {
				Reflect.set(instance, styleName, value);
			}
		}
	}
}

function setProperty(
	instance: BaseRenderable,
	propKey: string,
	propValue: unknown,
	oldPropValue?: unknown,
): void {
	switch (propKey) {
		case 'onChange':
			if (instance instanceof InputRenderable) {
				updateEmitterListener(instance, InputRenderableEvents.CHANGE, propValue, oldPropValue);
			} else if (instance instanceof SelectRenderable) {
				updateEmitterListener(
					instance,
					SelectRenderableEvents.SELECTION_CHANGED,
					propValue,
					oldPropValue,
				);
			} else if (instance instanceof TabSelectRenderable) {
				updateEmitterListener(
					instance,
					TabSelectRenderableEvents.SELECTION_CHANGED,
					propValue,
					oldPropValue,
				);
			}
			break;
		case 'onInput':
			if (instance instanceof InputRenderable) {
				updateEmitterListener(instance, InputRenderableEvents.INPUT, propValue, oldPropValue);
			}
			break;
		case 'onSubmit':
			if (instance instanceof InputRenderable) {
				updateEmitterListener(instance, InputRenderableEvents.ENTER, propValue, oldPropValue);
			} else if (instance instanceof TextareaRenderable) {
				instance.onSubmit = propValue as (() => void) | undefined;
			}
			break;
		case 'onSelect':
			if (instance instanceof SelectRenderable) {
				updateEmitterListener(
					instance,
					SelectRenderableEvents.ITEM_SELECTED,
					propValue,
					oldPropValue,
				);
			} else if (instance instanceof TabSelectRenderable) {
				updateEmitterListener(
					instance,
					TabSelectRenderableEvents.ITEM_SELECTED,
					propValue,
					oldPropValue,
				);
			}
			break;
		case 'focused':
			if (isRenderable(instance)) {
				if (propValue) instance.focus();
				else instance.blur();
			}
			break;
		case 'style':
			setStyle(instance, propValue, oldPropValue);
			break;
		case 'children':
			break;
		default:
			Reflect.set(instance, propKey, propValue);
	}
}

export function setInitialProperties(instance: BaseRenderable, props: Props): void {
	for (const [name, value] of Object.entries(props)) {
		if (value != null) setProperty(instance, name, value);
	}
}

export function updateProperties(instance: BaseRenderable, previous: Props, next: Props): void {
	for (const [name, value] of Object.entries(previous)) {
		if (value != null && !Object.prototype.hasOwnProperty.call(next, name)) {
			setProperty(instance, name, null, value);
		}
	}
	for (const [name, value] of Object.entries(next)) {
		const previousValue = previous[name];
		if (!Object.is(value, previousValue) && (value != null || previousValue != null)) {
			setProperty(instance, name, value, previousValue);
		}
	}
}
