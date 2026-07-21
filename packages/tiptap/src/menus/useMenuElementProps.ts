import { normalizeClass, useEffect, useLayoutEffect, useRef } from 'octane';

import { splitSlot, subSlot } from '../internal';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type MenuStyleValue = string | number | boolean | null | undefined;
type MenuStyle = Record<string, MenuStyleValue>;
type MenuEventHandler<E extends Event = Event> = (event: E) => unknown;

export type MenuElementRef<T> =
	{ current: T | null } | ((value: T | null) => void | (() => void)) | null;

export type MenuElementProps = {
	children?: unknown;
	ref?: MenuElementRef<HTMLDivElement>;
	class?: unknown;
	className?: unknown;
	style?: MenuStyle;
	tabIndex?: number;
	onBlur?: MenuEventHandler<FocusEvent>;
	onBlurCapture?: MenuEventHandler<FocusEvent>;
	onChange?: MenuEventHandler;
	onChangeCapture?: MenuEventHandler;
	onClick?: MenuEventHandler<MouseEvent>;
	onClickCapture?: MenuEventHandler<MouseEvent>;
	onDoubleClick?: MenuEventHandler<MouseEvent>;
	onDoubleClickCapture?: MenuEventHandler<MouseEvent>;
	onFocus?: MenuEventHandler<FocusEvent>;
	onFocusCapture?: MenuEventHandler<FocusEvent>;
	onInput?: MenuEventHandler<InputEvent>;
	onInputCapture?: MenuEventHandler<InputEvent>;
	onKeyDown?: MenuEventHandler<KeyboardEvent>;
	onKeyDownCapture?: MenuEventHandler<KeyboardEvent>;
	onKeyUp?: MenuEventHandler<KeyboardEvent>;
	onKeyUpCapture?: MenuEventHandler<KeyboardEvent>;
	onMouseEnter?: MenuEventHandler<MouseEvent>;
	onMouseLeave?: MenuEventHandler<MouseEvent>;
	onPointerDown?: MenuEventHandler<PointerEvent>;
	onPointerDownCapture?: MenuEventHandler<PointerEvent>;
	[key: string]: unknown;
};

type MenuNativeListener = (event: Event) => void;
type MenuEventListenerOptions = {
	capture?: boolean;
};

type EventListenerEntry = {
	eventName: string;
	listener: MenuNativeListener;
	options?: MenuEventListenerOptions;
};

const PLUGIN_MANAGED_STYLE_PROPERTIES = new Set([
	'left',
	'opacity',
	'position',
	'top',
	'visibility',
	'width',
]);

const UNITLESS_STYLE_PROPERTIES = new Set([
	'animationIterationCount',
	'aspectRatio',
	'borderImageOutset',
	'borderImageSlice',
	'borderImageWidth',
	'columnCount',
	'columns',
	'fillOpacity',
	'flex',
	'flexGrow',
	'flexShrink',
	'fontWeight',
	'gridArea',
	'gridColumn',
	'gridColumnEnd',
	'gridColumnStart',
	'gridRow',
	'gridRowEnd',
	'gridRowStart',
	'lineClamp',
	'lineHeight',
	'opacity',
	'order',
	'orphans',
	'scale',
	'stopOpacity',
	'strokeDasharray',
	'strokeDashoffset',
	'strokeMiterlimit',
	'strokeOpacity',
	'strokeWidth',
	'tabSize',
	'widows',
	'zIndex',
	'zoom',
]);

const ATTRIBUTE_EXCLUSIONS = new Set(['children', 'class', 'className', 'ref', 'style']);
const DIRECT_PROPERTY_KEYS = new Set(['tabIndex']);
const FORWARDED_ATTRIBUTE_KEYS = new Set([
	'accessKey',
	'autoCapitalize',
	'contentEditable',
	'contextMenu',
	'dir',
	'draggable',
	'enterKeyHint',
	'hidden',
	'id',
	'lang',
	'nonce',
	'role',
	'slot',
	'spellCheck',
	'tabIndex',
	'title',
	'translate',
]);

const SPECIAL_EVENT_NAMES: Record<string, string> = {
	Blur: 'focusout',
	DoubleClick: 'dblclick',
	Focus: 'focusin',
	MouseEnter: 'mouseenter',
	MouseLeave: 'mouseleave',
};

function isEventProp(key: string, value: unknown): value is MenuEventHandler {
	return /^on[A-Z]/.test(key) && typeof value === 'function';
}

function isForwardedAttributeKey(key: string): boolean {
	return key.startsWith('aria-') || key.startsWith('data-') || FORWARDED_ATTRIBUTE_KEYS.has(key);
}

function toStylePropertyName(key: string): string {
	if (key.startsWith('--')) {
		return key;
	}

	return key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function toEventConfig(key: string): {
	eventName: string;
	options: MenuEventListenerOptions | undefined;
} {
	const useCapture = key.endsWith('Capture');
	const baseKey = useCapture ? key.slice(0, -7) : key;
	const eventNameKey = baseKey.slice(2);
	const eventName = SPECIAL_EVENT_NAMES[eventNameKey] ?? eventNameKey.toLowerCase();

	return {
		eventName,
		options: useCapture ? { capture: true } : undefined,
	};
}

function isDirectPropertyKey(key: string): boolean {
	return DIRECT_PROPERTY_KEYS.has(key);
}

function setDirectProperty(element: HTMLDivElement, key: string, value: unknown): void {
	if (key === 'tabIndex') {
		element.tabIndex = Number(value);
		return;
	}

	(element as unknown as Record<string, unknown>)[key] = value;
}

function clearDirectProperty(element: HTMLDivElement, key: string): void {
	if (key === 'tabIndex') {
		element.removeAttribute('tabindex');
		return;
	}

	const propertyValue = (element as unknown as Record<string, unknown>)[key];

	if (typeof propertyValue === 'boolean') {
		(element as unknown as Record<string, unknown>)[key] = false;
		return;
	}

	if (typeof propertyValue === 'number') {
		(element as unknown as Record<string, unknown>)[key] = 0;
		return;
	}

	(element as unknown as Record<string, unknown>)[key] = '';
}

function toStyleValue(styleName: string, value: string | number): string {
	if (
		typeof value !== 'number' ||
		value === 0 ||
		styleName.startsWith('--') ||
		UNITLESS_STYLE_PROPERTIES.has(styleName)
	) {
		return String(value);
	}

	return `${value}px`;
}

function removeStyleProperty(element: HTMLDivElement, styleName: string): void {
	if (PLUGIN_MANAGED_STYLE_PROPERTIES.has(styleName)) {
		return;
	}

	element.style.removeProperty(toStylePropertyName(styleName));
}

function applyStyleProperty(
	element: HTMLDivElement,
	styleName: string,
	value: string | number,
): void {
	if (PLUGIN_MANAGED_STYLE_PROPERTIES.has(styleName)) {
		return;
	}

	element.style.setProperty(toStylePropertyName(styleName), toStyleValue(styleName, value));
}

function syncAttributes(
	element: HTMLDivElement,
	previousProps: MenuElementProps,
	nextProps: MenuElementProps,
): void {
	const allKeys = new Set([...Object.keys(previousProps), ...Object.keys(nextProps)]);

	allKeys.forEach((key) => {
		if (
			ATTRIBUTE_EXCLUSIONS.has(key) ||
			!isForwardedAttributeKey(key) ||
			isEventProp(key, previousProps[key]) ||
			isEventProp(key, nextProps[key])
		) {
			return;
		}

		const previousValue = previousProps[key];
		const nextValue = nextProps[key];

		if (previousValue === nextValue) {
			return;
		}

		if (nextValue == null || nextValue === false) {
			if (isDirectPropertyKey(key)) {
				clearDirectProperty(element, key);
			}

			element.removeAttribute(key);
			return;
		}

		if (nextValue === true) {
			if (isDirectPropertyKey(key)) {
				setDirectProperty(element, key, true);
			}

			element.setAttribute(key, '');
			return;
		}

		if (isDirectPropertyKey(key)) {
			setDirectProperty(element, key, nextValue);
			return;
		}

		element.setAttribute(key, String(nextValue));
	});
}

function syncClassName(
	element: HTMLDivElement,
	previousProps: MenuElementProps,
	nextProps: MenuElementProps,
): void {
	const previousClassName = normalizeClass([previousProps.class, previousProps.className]);
	const nextClassName = normalizeClass([nextProps.class, nextProps.className]);

	if (previousClassName === nextClassName) {
		return;
	}

	if (nextClassName) {
		element.className = nextClassName;
		return;
	}

	element.removeAttribute('class');
}

function syncStyles(
	element: HTMLDivElement,
	previousStyle: MenuStyle | undefined,
	nextStyle: MenuStyle | undefined,
): void {
	const oldStyle = previousStyle ?? {};
	const newStyle = nextStyle ?? {};
	const allStyleNames = new Set([...Object.keys(oldStyle), ...Object.keys(newStyle)]);

	allStyleNames.forEach((styleName) => {
		const previousValue = oldStyle[styleName];
		const nextValue = newStyle[styleName];

		if (previousValue === nextValue) {
			return;
		}

		if (nextValue == null || typeof nextValue === 'boolean') {
			removeStyleProperty(element, styleName);
			return;
		}

		applyStyleProperty(element, styleName, nextValue);
	});
}

function syncEventListeners(
	element: HTMLDivElement,
	previousListeners: EventListenerEntry[],
	nextProps: MenuElementProps,
): EventListenerEntry[] {
	previousListeners.forEach(({ eventName, listener, options }) => {
		element.removeEventListener(eventName, listener, options);
	});

	const nextListeners: EventListenerEntry[] = [];

	Object.entries(nextProps).forEach(([key, value]) => {
		if (!isEventProp(key, value)) {
			return;
		}

		const { eventName, options } = toEventConfig(key);
		const listener: MenuNativeListener = (event) => {
			// Octane delegates portal-child handlers from this same target. Native
			// stopPropagation() does not suppress later listeners on the current node,
			// so honor the delegated child's cancellation before invoking the menu's
			// logical ancestor handler. Direct events on the menu itself still fire.
			if (!options?.capture && event.cancelBubble && event.target !== element) {
				return;
			}

			value(event);
		};

		element.addEventListener(eventName, listener, options);
		nextListeners.push({ eventName, listener, options });
	});

	return nextListeners;
}

export function useMenuElementProps(
	element: HTMLDivElement | null,
	props: MenuElementProps,
	...args: unknown[]
): void {
	const [, slot] = splitSlot(args);
	const previousPropsRef = useRef<MenuElementProps>({}, subSlot(slot, 'menu-props:previous'));
	const previousElementRef = useRef<HTMLDivElement | null>(
		null,
		subSlot(slot, 'menu-props:element'),
	);
	const listenersRef = useRef<EventListenerEntry[]>([], subSlot(slot, 'menu-props:listeners'));

	useIsomorphicLayoutEffect(
		() => {
			if (!element) {
				return;
			}

			const previousProps = previousElementRef.current === element ? previousPropsRef.current : {};

			syncClassName(element, previousProps, props);
			syncStyles(element, previousProps.style, props.style);
			syncAttributes(element, previousProps, props);
			listenersRef.current = syncEventListeners(element, listenersRef.current, props);
			previousPropsRef.current = props;
			previousElementRef.current = element;

			return () => {
				listenersRef.current.forEach(({ eventName, listener, options }) => {
					element.removeEventListener(eventName, listener, options);
				});
				listenersRef.current = [];
			};
		},
		[element, props],
		subSlot(slot, 'menu-props:effect'),
	);
}

export function useMenuElementRef(
	element: HTMLDivElement | null,
	ref: MenuElementRef<HTMLDivElement> | undefined,
	...args: unknown[]
): void {
	const [, slot] = splitSlot(args);

	useIsomorphicLayoutEffect(
		() => {
			if (!element || !ref) {
				return;
			}

			if (typeof ref === 'function') {
				const cleanup = ref(element);

				return () => {
					if (typeof cleanup === 'function') {
						cleanup();
					} else {
						ref(null);
					}
				};
			}

			ref.current = element;

			return () => {
				if (ref.current === element) {
					ref.current = null;
				}
			};
		},
		[element, ref],
		subSlot(slot, 'menu-ref:effect'),
	);
}
