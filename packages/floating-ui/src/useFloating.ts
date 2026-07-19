// Ported from @floating-ui/react-dom (the positioning useFloating + the ref-aware
// `arrow` wrapper). React hooks → octane hooks; ReactDOM.flushSync → octane flushSync.
// Every internal hook gets a distinct sub-slot derived from the caller's slot (see
// ./internal). The returned `context`/refs carry the root slot so the interaction
// hooks (later phases) can compose without their own slot.
import { arrow as arrowCore, computePosition } from '@floating-ui/dom';
import type {
	ComputePositionConfig,
	Derivable,
	Middleware,
	MiddlewareState,
} from '@floating-ui/dom';
import { flushSync, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'octane';

import { splitSlot, subSlot } from './internal';
import { deepEqual, getDPR, roundByDPR } from './utils';
import type {
	ArrowOptions,
	FloatingStyles,
	MutableRefObject,
	ReferenceType,
	UsePositionFloatingData,
	UsePositionFloatingOptions,
	UsePositionFloatingReturn,
} from './types';

// Keep a ref pointed at the latest `value` without retriggering effects.
function useLatestRef<T>(value: T, slot: symbol | undefined): { current: T } {
	const ref = useRef(value, subSlot(slot, 'lr:ref'));
	useLayoutEffect(
		() => {
			ref.current = value;
		},
		undefined,
		subSlot(slot, 'lr:eff'),
	);
	return ref;
}

// The positioning core (ported from @floating-ui/react-dom's useFloating). The
// PUBLIC useFloating (in ./context) wraps this and adds the interaction context.
// Called as `usePositionFloating([options, slot])` — the array form keeps the
// compiler-injected trailing slot detectable for plain-`.ts` callers.
// RT defaults to `any` (not upstream's `ReferenceType`) so that pre-typing
// callers that supply untyped elements — and therefore give inference no
// candidate — keep their loose reference typing (e.g. @octanejs/base-ui builds
// its own stricter FloatingContext from this return). Callers with typed
// elements infer RT precisely.
export function usePositionFloating<RT extends ReferenceType = any>(
	args: [UsePositionFloatingOptions<RT>?, (symbol | undefined)?],
): UsePositionFloatingReturn<RT>;
// Loose fallback: pre-typing callers built untyped option bags in plain `.ts`;
// they keep compiling while still receiving the typed return.
export function usePositionFloating(args: unknown[]): UsePositionFloatingReturn<any>;
export function usePositionFloating(args: any[]): any {
	const [user, slot] = splitSlot(args);
	const options = (user[0] as UsePositionFloatingOptions) ?? {};

	const placement = options.placement ?? 'bottom';
	const strategy = options.strategy ?? 'absolute';
	const middleware = options.middleware ?? [];
	const platform = options.platform;
	const externalReference = options.elements ? options.elements.reference : undefined;
	const externalFloating = options.elements ? options.elements.floating : undefined;
	const transform = options.transform ?? true;
	const whileElementsMounted = options.whileElementsMounted;
	const open = options.open;

	const [data, setData] = useState<UsePositionFloatingData>(
		{
			x: 0,
			y: 0,
			strategy,
			placement,
			middlewareData: {},
			isPositioned: false,
		},
		subSlot(slot, 'data'),
	);

	const [latestMiddleware, setLatestMiddleware] = useState(middleware, subSlot(slot, 'mw'));
	if (!deepEqual(latestMiddleware, middleware)) {
		setLatestMiddleware(middleware);
	}

	const [_reference, _setReference] = useState<ReferenceType | null>(null, subSlot(slot, 'ref'));
	const [_floating, _setFloating] = useState<HTMLElement | null>(null, subSlot(slot, 'flo'));

	const referenceRef = useRef<ReferenceType | null>(null, subSlot(slot, 'rref'));
	const floatingRef = useRef<HTMLElement | null>(null, subSlot(slot, 'rflo'));

	const setReference = useCallback(
		(node: ReferenceType | null) => {
			if (node !== referenceRef.current) {
				referenceRef.current = node;
				_setReference(node);
			}
		},
		[],
		subSlot(slot, 'sref'),
	);
	const setFloating = useCallback(
		(node: HTMLElement | null) => {
			if (node !== floatingRef.current) {
				floatingRef.current = node;
				_setFloating(node);
			}
		},
		[],
		subSlot(slot, 'sflo'),
	);

	const referenceEl = externalReference || _reference;
	const floatingEl = externalFloating || _floating;

	const dataRef = useRef(data, subSlot(slot, 'dref'));
	const hasWhileElementsMounted = whileElementsMounted != null;
	const whileElementsMountedRef = useLatestRef(whileElementsMounted, subSlot(slot, 'wem'));
	const platformRef = useLatestRef(platform, subSlot(slot, 'plat'));
	const openRef = useLatestRef(open, subSlot(slot, 'open'));
	const isMountedRef = useRef(false, subSlot(slot, 'mnt'));

	const update = useCallback(
		() => {
			if (!referenceRef.current || !floatingRef.current) {
				return;
			}
			const config: Partial<ComputePositionConfig> = {
				placement,
				strategy,
				middleware: latestMiddleware,
			};
			if (platformRef.current) {
				config.platform = platformRef.current;
			}
			computePosition(referenceRef.current, floatingRef.current, config).then((computed) => {
				const fullData = {
					...computed,
					isPositioned: openRef.current !== false,
				};
				if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
					dataRef.current = fullData;
					flushSync(() => {
						setData(fullData);
					});
				}
			});
		},
		[latestMiddleware, placement, strategy, platformRef, openRef],
		subSlot(slot, 'upd'),
	);

	useLayoutEffect(
		() => {
			if (open === false && dataRef.current.isPositioned) {
				dataRef.current.isPositioned = false;
				setData((d) => ({ ...d, isPositioned: false }));
			}
		},
		[open],
		subSlot(slot, 'e:open'),
	);

	useLayoutEffect(
		() => {
			isMountedRef.current = true;
			return () => {
				isMountedRef.current = false;
			};
		},
		[],
		subSlot(slot, 'e:mnt'),
	);

	useLayoutEffect(
		() => {
			if (referenceEl) referenceRef.current = referenceEl;
			if (floatingEl) floatingRef.current = floatingEl;
			if (referenceEl && floatingEl) {
				if (whileElementsMountedRef.current) {
					return whileElementsMountedRef.current(referenceEl, floatingEl, update);
				}
				update();
			}
		},
		[referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted],
		subSlot(slot, 'e:el'),
	);

	const refs = useMemo(
		() => ({ reference: referenceRef, floating: floatingRef, setReference, setFloating }),
		[setReference, setFloating],
		subSlot(slot, 'm:refs'),
	);

	const elements = useMemo(
		() => ({ reference: referenceEl, floating: floatingEl }),
		[referenceEl, floatingEl],
		subSlot(slot, 'm:el'),
	);

	const floatingStyles = useMemo<FloatingStyles>(
		() => {
			const initialStyles = { position: strategy, left: 0, top: 0 };
			if (!elements.floating) {
				return initialStyles;
			}
			const x = roundByDPR(elements.floating, data.x);
			const y = roundByDPR(elements.floating, data.y);
			if (transform) {
				return {
					...initialStyles,
					transform: 'translate(' + x + 'px, ' + y + 'px)',
					...(getDPR(elements.floating) >= 1.5 && { willChange: 'transform' }),
				};
			}
			return { position: strategy, left: x, top: y };
		},
		[strategy, transform, elements.floating, data.x, data.y],
		subSlot(slot, 'm:fs'),
	);

	return useMemo(
		() => ({ ...data, update, refs, elements, floatingStyles }),
		[data, update, refs, elements, floatingStyles],
		subSlot(slot, 'm:ret'),
	);
}

// Ref-aware `arrow` middleware: accepts an octane ref ({current}) or an element.
export const arrow = (options: ArrowOptions | Derivable<ArrowOptions>): Middleware => {
	function isRef(value: unknown): value is MutableRefObject<Element | null> {
		return {}.hasOwnProperty.call(value, 'current');
	}
	return {
		name: 'arrow',
		options,
		fn(state: MiddlewareState) {
			const { element, padding } = typeof options === 'function' ? options(state) : options;
			if (element && isRef(element)) {
				if (element.current != null) {
					return arrowCore({ element: element.current, padding }).fn(state);
				}
				return {};
			}
			if (element) {
				return arrowCore({ element, padding }).fn(state);
			}
			return {};
		},
	};
};
