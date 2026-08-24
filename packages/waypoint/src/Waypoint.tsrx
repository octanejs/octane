import {
	cloneElement,
	createElement,
	isValidElement,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import {
	findScrollableAncestor,
	getBounds,
	getCurrentPosition,
	resolveScrollableAncestorProp,
} from './geometry';
import { onNextTick } from './onNextTick';
import {
	ABOVE,
	BELOW,
	INSIDE,
	INVISIBLE,
	type WaypointCallbackArgs,
	type WaypointPosition,
	type WaypointProps,
} from './types';

function WaypointComponent(props: WaypointProps): object {
	const [node, setNode] = useState<Element | null>(null);
	const previousPosition = useRef<WaypointPosition | undefined>(undefined);
	const latest = useRef(props);
	latest.current = props;
	const nodeRef = useRef<Element | null>(null);
	nodeRef.current = node;
	const ancestorRef = useRef<Element | Window | null>(null);
	const cancelOnNextTick = useRef<(() => void) | null>(null);
	const scrollUnsubscribe = useRef<(() => void) | null>(null);
	const childRef =
		props.children && isValidElement(props.children)
			? (props.children as { props?: { ref?: unknown } }).props?.ref
			: undefined;
	const mergedRef = useMemo(function mergeRefs() {
		return [childRef, setNode];
	}, [childRef]);

	function measureWaypoint(event: Event | null) {
		const currentNode = nodeRef.current;
		const ancestor = ancestorRef.current;
		if (!currentNode || !ancestor) return;
		const bounds = getBounds(currentNode, ancestor, latest.current);
		const currentPosition = getCurrentPosition(bounds);
		const previous = previousPosition.current;
		if (currentPosition === previous) return;
		previousPosition.current = currentPosition;

		const args: WaypointCallbackArgs = {
			currentPosition,
			previousPosition: previous,
			event,
			...bounds,
		};
		latest.current.onPositionChange?.(args);

		const rapidDown = previous === ABOVE && currentPosition === BELOW;
		const rapidUp = previous === BELOW && currentPosition === ABOVE;
		if ((rapidDown || rapidUp) && latest.current.fireOnRapidScroll !== false) {
			const insideArgs: WaypointCallbackArgs = { ...args, currentPosition: INSIDE };
			latest.current.onEnter?.(insideArgs);
			latest.current.onLeave?.({ ...args, previousPosition: INSIDE });
		} else {
			if (currentPosition === INSIDE) latest.current.onEnter?.(args);
			if (previous === INSIDE) latest.current.onLeave?.(args);
		}
		if (latest.current.debug) {
			console.log('[Waypoint]', previous, '->', currentPosition, bounds);
		}
	}

	function ensureScrollListeners() {
		const ancestor = ancestorRef.current;
		if (typeof window === 'undefined' || !ancestor || scrollUnsubscribe.current) return;
		function onScroll(event: Event) {
			measureWaypoint(event);
		}
		ancestor.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		scrollUnsubscribe.current = function unsubscribeScroll() {
			ancestor.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			scrollUnsubscribe.current = null;
		};
	}

	function clearScrollListeners() {
		if (scrollUnsubscribe.current) {
			scrollUnsubscribe.current();
		}
	}

	// Match upstream componentDidMount/DidUpdate: resolve the scroll parent,
	// attach listeners, and remeasure on a coalesced next tick so layout is
	// never forced during render. `null` deps run every render; skip when a
	// tick is already queued (upstream keeps the pending tick).
	useEffect(function scheduleRemeasure() {
		if (typeof window === 'undefined' || !node) return;
		if (cancelOnNextTick.current) return;
		cancelOnNextTick.current = onNextTick(function measureOnNextTick() {
			cancelOnNextTick.current = null;
			const currentNode = nodeRef.current;
			if (!currentNode) return;
			const nextAncestor =
				latest.current.scrollableAncestor != null
					? resolveScrollableAncestorProp(latest.current.scrollableAncestor)
					: findScrollableAncestor(currentNode, latest.current.horizontal);
			if (ancestorRef.current !== nextAncestor) {
				clearScrollListeners();
				ancestorRef.current = nextAncestor;
			}
			ensureScrollListeners();
			measureWaypoint(null);
		});
	}, null);

	// When the measured host briefly clears (Suspense, conditional child, or a
	// remounted host), keep previousPosition. Upstream never resets
	// `_previousPosition` for the instance lifetime; resetting here would make a
	// still-inside remount look like the first enter and re-fire onEnter.
	useEffect(function cleanupOnUnmountOrNodeClear() {
		if (!node) {
			clearScrollListeners();
			ancestorRef.current = null;
		}
		return function cleanup() {
			if (cancelOnNextTick.current) {
				cancelOnNextTick.current();
				cancelOnNextTick.current = null;
			}
			clearScrollListeners();
		};
	}, [node]);

	if (props.children && isValidElement(props.children)) {
		return cloneElement(props.children, {
			ref: mergedRef,
		});
	}
	return createElement('span', {
		ref: setNode,
		style: { fontSize: 0 },
	});
}

export const Waypoint: ((props: WaypointProps) => object) & {
	above: typeof ABOVE;
	below: typeof BELOW;
	inside: typeof INSIDE;
	invisible: typeof INVISIBLE;
} = Object.assign(
	WaypointComponent,
	{
		above: ABOVE,
		below: BELOW,
		inside: INSIDE,
		invisible: INVISIBLE,
	} as const,
);
