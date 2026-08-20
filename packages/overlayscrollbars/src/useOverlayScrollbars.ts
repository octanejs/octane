import type { InitializationTarget } from 'overlayscrollbars';
import { OverlayScrollbars } from 'overlayscrollbars';
import { useEffect, useMemo, useRef } from 'octane';
import type {
	OverlayScrollbarsComponentProps,
	OverlayScrollbarsComponentRef,
} from './OverlayScrollbarsComponent.ts';
import { splitSlot, subSlot } from './internal.ts';

type Defer = [
	requestDefer: (callback: () => void, options?: OverlayScrollbarsComponentProps['defer']) => void,
	cancelDefer: () => void,
];

export interface UseOverlayScrollbarsParams {
	/** OverlayScrollbars options. */
	options?: OverlayScrollbarsComponentProps['options'];
	/** OverlayScrollbars events. */
	events?: OverlayScrollbarsComponentProps['events'];
	/** Whether to defer the initialization to a point in time when the browser is idle. */
	defer?: OverlayScrollbarsComponentProps['defer'];
}

export type UseOverlayScrollbarsInitialization = (target: InitializationTarget) => void;

export type UseOverlayScrollbarsInstance = () => ReturnType<
	OverlayScrollbarsComponentRef['osInstance']
>;

function createDefer(): Defer {
	if (typeof window === 'undefined') {
		function noop(): void {}
		return [noop, noop];
	}

	let idleId: number;
	let rafId: number;
	const wnd = window;
	const idleSupported = typeof wnd.requestIdleCallback === 'function';
	const rAF = wnd.requestAnimationFrame.bind(wnd);
	const cAF = wnd.cancelAnimationFrame.bind(wnd);
	const rIdle = idleSupported ? wnd.requestIdleCallback.bind(wnd) : rAF;
	const cIdle = idleSupported ? wnd.cancelIdleCallback.bind(wnd) : cAF;
	function clear(): void {
		cIdle(idleId);
		cAF(rafId);
	}

	return [
		function requestDefer(callback, options) {
			clear();
			idleId = rIdle(
				idleSupported
					? function onIdle() {
							clear();
							rafId = rAF(callback);
						}
					: callback,
				typeof options === 'object' ? options : { timeout: 2233 },
			);
		},
		clear,
	];
}

export function useOverlayScrollbars(
	params?: UseOverlayScrollbarsParams,
	...rest: [slot?: symbol]
): [UseOverlayScrollbarsInitialization, UseOverlayScrollbarsInstance] {
	const [user, slot] = splitSlot([params, ...rest]);
	const resolved = user[0] as UseOverlayScrollbarsParams | undefined;
	const options = resolved ? resolved.options : undefined;
	const events = resolved ? resolved.events : undefined;
	const defer = resolved ? resolved.defer : undefined;
	const deferral = useMemo(createDefer, [], subSlot(slot, 'defer'));
	const requestDefer = deferral[0];
	const cancelDefer = deferral[1];
	const instanceRef = useRef<ReturnType<UseOverlayScrollbarsInstance>>(
		null,
		subSlot(slot, 'instance'),
	);
	const deferRef = useRef(defer, subSlot(slot, 'defer-value'));
	const optionsRef = useRef(options, subSlot(slot, 'options'));
	const eventsRef = useRef(events, subSlot(slot, 'events'));

	useEffect(
		function syncDefer() {
			deferRef.current = defer;
			return undefined;
		},
		[defer],
		subSlot(slot, 'sync-defer'),
	);

	useEffect(
		function syncOptions() {
			const instance = instanceRef.current;
			optionsRef.current = options;
			if (OverlayScrollbars.valid(instance)) {
				instance.options(options || {}, true);
			}
			return undefined;
		},
		[options],
		subSlot(slot, 'sync-options'),
	);

	useEffect(
		function syncEvents() {
			const instance = instanceRef.current;
			eventsRef.current = events;
			if (OverlayScrollbars.valid(instance)) {
				instance.on(events || {}, true);
			}
			return undefined;
		},
		[events],
		subSlot(slot, 'sync-events'),
	);

	useEffect(
		function destroyOnUnmount() {
			return function dispose() {
				cancelDefer();
				const instance = instanceRef.current;
				if (instance) {
					instance.destroy();
				}
			};
		},
		[],
		subSlot(slot, 'destroy'),
	);

	return useMemo(
		function bindApi(): [UseOverlayScrollbarsInitialization, UseOverlayScrollbarsInstance] {
			function initialize(target: InitializationTarget): void {
				const presentInstance = instanceRef.current;
				if (OverlayScrollbars.valid(presentInstance)) {
					return;
				}

				const currDefer = deferRef.current;
				const currOptions = optionsRef.current || {};
				const currEvents = eventsRef.current || {};
				function init(): void {
					instanceRef.current = OverlayScrollbars(target, currOptions, currEvents);
				}

				if (currDefer) {
					requestDefer(init, currDefer);
					return;
				}
				init();
			}

			function instance(): ReturnType<UseOverlayScrollbarsInstance> {
				return instanceRef.current;
			}

			return [initialize, instance];
		},
		[],
		subSlot(slot, 'api'),
	);
}
