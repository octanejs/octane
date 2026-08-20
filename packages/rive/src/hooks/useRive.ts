import { createElement, useCallback, useEffect, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { EventType, Fit, Rive } from '@rive-app/canvas';
import type { CanvasElementProps, RiveState, UseRiveOptions, UseRiveParameters } from '../types.ts';
import type { RefCallback } from '../types.ts';
import useResizeCanvas from './useResizeCanvas.ts';
import useDevicePixelRatio from './useDevicePixelRatio.ts';
import { getOptions } from '../utils.ts';
import useIntersectionObserver from './useIntersectionObserver.ts';
import { splitSlot, subSlot } from '../internal.ts';

type RiveComponentProps = {
	setContainerRef: RefCallback<HTMLElement>;
	setCanvasRef: RefCallback<HTMLCanvasElement>;
};

function omitRiveComponentKeys(props: RiveComponentProps & CanvasElementProps) {
	const rest: Record<string, unknown> = {};
	for (const key in props) {
		if (
			key !== 'setContainerRef' &&
			key !== 'setCanvasRef' &&
			key !== 'className' &&
			key !== 'style' &&
			key !== 'children'
		) {
			rest[key] = props[key];
		}
	}
	return rest;
}

function RiveComponent(props: RiveComponentProps & CanvasElementProps): OctaneNode {
	const setContainerRef = props.setContainerRef;
	const setCanvasRef = props.setCanvasRef;
	const className = props.className ?? '';
	const style = props.style;
	const children = props.children;
	const rest = omitRiveComponentKeys(props);

	const containerStyle = {
		width: '100%',
		height: '100%',
		...(style && typeof style === 'object' ? style : {}),
	};

	const divProps: Record<string, unknown> = {
		ref: setContainerRef,
		className: className,
	};
	if (!className) {
		divProps.style = containerStyle;
	}

	return createElement(
		'div',
		divProps,
		createElement(
			'canvas',
			{
				ref: setCanvasRef,
				style: { verticalAlign: 'top', width: 0, height: 0 },
				...rest,
			},
			children,
		),
	);
}

/**
 * Custom Hook for loading a Rive file.
 *
 * Waits until the load event has fired before returning it.
 * We can then listen for changes to this animation in other hooks to detect
 * when it has loaded.
 *
 * @param riveParams - Object containing parameters accepted by the Rive object
 *   in the rive-js runtime, with the exception of Canvas as that is attached
 *   via the ref callback `setCanvasRef`.
 *
 * @param opts - Optional list of options that are specific for this hook.
 * @returns {RiveAnimationState}
 */
export default function useRive(...rawArgs: unknown[]): RiveState {
	const [args, slot] = splitSlot(rawArgs);
	const riveParams = args[0] as UseRiveParameters | undefined;
	const opts = (args[1] ?? {}) as Partial<UseRiveOptions>;

	const [canvasElem, setCanvasElem] = useState<HTMLCanvasElement | null>(
		null,
		subSlot(slot, 'canvas'),
	);
	const containerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'container'));
	const riveRef = useRef<Rive | null>(null, subSlot(slot, 'riveRef'));

	const [rive, setRive] = useState<Rive | null>(null, subSlot(slot, 'rive'));

	const isParamsLoaded = Boolean(riveParams);
	const options = getOptions(opts);

	const devicePixelRatio = useDevicePixelRatio(undefined, subSlot(slot, 'dpr'));

	/**
	 * When the canvas/parent container resize, reset the Rive layout to match the
	 * new (0, 0, canvas.width, canvas.height) bounds in the render loop
	 */
	const onCanvasHasResized = useCallback(
		function handleCanvasResize() {
			if (rive) {
				if (rive.layout && rive.layout.fit === Fit.Layout) {
					if (canvasElem) {
						const resizeFactor = devicePixelRatio * (rive.layout.layoutScaleFactor ?? 1);
						rive.devicePixelRatioUsed = devicePixelRatio;
						rive.artboardWidth = canvasElem.width / resizeFactor;
						rive.artboardHeight = canvasElem.height / resizeFactor;
					}
				}

				rive.startRendering();
				rive.resizeToCanvas();
			}
		},
		[rive, devicePixelRatio],
		subSlot(slot, 'onResize'),
	);

	// Watch the canvas parent container resize and size the canvas to match
	useResizeCanvas(
		{
			riveLoaded: !!rive,
			canvasElem: canvasElem,
			containerRef: containerRef,
			options: options,
			onCanvasHasResized: onCanvasHasResized,
			artboardBounds: rive?.bounds,
		},
		subSlot(slot, 'resize'),
	);

	/**
	 * Ref callback called when the canvas element mounts and unmounts.
	 */
	const setCanvasRef: RefCallback<HTMLCanvasElement> = useCallback(
		function assignCanvas(canvas: HTMLCanvasElement | null) {
			if (canvas === null && canvasElem) {
				canvasElem.height = 0;
				canvasElem.width = 0;
			}

			setCanvasElem(canvas);
		},
		[],
		subSlot(slot, 'setCanvas'),
	);

	useEffect(
		function loadRive() {
			if (!canvasElem || !riveParams) {
				return;
			}
			let isLoaded = rive != null;
			let instance: Rive | null = null;
			if (rive == null) {
				const useOffscreenRenderer = options.useOffscreenRenderer;
				const onRiveReady = riveParams.onRiveReady;
				const restRiveParams = { ...riveParams };
				delete restRiveParams.onRiveReady;
				instance = new Rive({
					useOffscreenRenderer: useOffscreenRenderer,
					...restRiveParams,
					canvas: canvasElem,
				});
				if (riveRef.current != null) {
					riveRef.current.cleanup();
				}
				riveRef.current = instance;
				instance.on(EventType.Load, function onLoad() {
					isLoaded = true;

					if (onRiveReady) {
						onRiveReady(instance!);
					}

					// Check if the component/canvas is mounted before setting state to avoid setState
					// on an unmounted component in some rare cases
					if (canvasElem) {
						setRive(instance);
					} else {
						// If unmounted, cleanup the rive object immediately
						instance!.cleanup();
					}
				});
			}
			return function cleanupPending() {
				if (!isLoaded) {
					instance?.cleanup();
				}
			};
		},
		[canvasElem, isParamsLoaded, rive],
		subSlot(slot, 'load'),
	);
	/**
	 * Ref callback called when the container element mounts
	 */
	const setContainerRef: RefCallback<HTMLElement> = useCallback(
		function assignContainer(container: HTMLElement | null) {
			containerRef.current = container;
		},
		[],
		subSlot(slot, 'setContainer'),
	);

	/**
	 * Set up IntersectionObserver to stop rendering if the animation is not in
	 * view.
	 */
	const observerApi = useIntersectionObserver(subSlot(slot, 'io'));
	const observe = observerApi.observe;
	const unobserve = observerApi.unobserve;

	useEffect(
		function observeVisibility() {
			let timeoutId: ReturnType<typeof setTimeout>;
			let isPaused = false;
			// This is a workaround to retest whether an element is offscreen or not.
			// There seems to be a bug in Chrome that triggers an intersection change when an element
			// is moved within the DOM using insertBefore.
			// For some reason, when this is called whithin the context of a React application, the
			// intersection callback is called only once reporting isIntersecting as false but never
			// triggered back with isIntersecting as true.
			// For this reason we retest after 10 millisecond whether the element is actually off the
			// viewport or not.
			function retestIntersection() {
				if (canvasElem && isPaused) {
					const size = canvasElem.getBoundingClientRect();
					const isIntersecting =
						size.width > 0 &&
						size.height > 0 &&
						size.top < (window.innerHeight || document.documentElement.clientHeight) &&
						size.bottom > 0 &&
						size.left < (window.innerWidth || document.documentElement.clientWidth) &&
						size.right > 0;
					if (isIntersecting) {
						rive?.startRendering();
						isPaused = false;
					}
				}
			}
			function onChange(entry: IntersectionObserverEntry) {
				if (entry.isIntersecting) {
					if (rive) {
						rive.startRendering();
					}
				} else if (rive) {
					rive.stopRendering();
				}
				isPaused = !entry.isIntersecting;
				clearTimeout(timeoutId);
				if (!entry.isIntersecting && entry.boundingClientRect.width === 0) {
					timeoutId = setTimeout(retestIntersection, 10);
				}
			}
			if (canvasElem && options.shouldUseIntersectionObserver !== false) {
				observe(canvasElem, onChange);
			}
			return function cleanupObserver() {
				if (canvasElem) {
					unobserve(canvasElem);
				}
			};
		},
		[observe, unobserve, rive, canvasElem, options.shouldUseIntersectionObserver],
		subSlot(slot, 'intersect'),
	);

	/**
	 * On unmount, call cleanup to cleanup any WASM generated objects that need
	 * to be manually destroyed.
	 */
	useEffect(
		function cleanupRive() {
			return function disposeRive() {
				if (rive) {
					rive.cleanup();
					setRive(null);
				}
			};
		},
		[rive, canvasElem],
		subSlot(slot, 'cleanupRive'),
	);

	useEffect(
		function cleanupRef() {
			return function disposeRef() {
				if (riveRef.current != null) {
					riveRef.current.cleanup();
				}
			};
		},
		[],
		subSlot(slot, 'cleanupRef'),
	);

	/**
	 * Listen for changes in the animations params
	 */
	const animations = riveParams?.animations;
	useEffect(
		function syncAnimations() {
			if (rive && animations) {
				if (rive.isPlaying) {
					rive.stop(rive.animationNames);
					rive.play(animations);
				} else if (rive.isPaused) {
					rive.stop(rive.animationNames);
					rive.pause(animations);
				}
			}
		},
		[animations, rive],
		subSlot(slot, 'anims'),
	);

	const Component = useCallback(
		function BoundRiveComponent(props: CanvasElementProps): OctaneNode {
			return createElement(RiveComponent, {
				setContainerRef: setContainerRef,
				setCanvasRef: setCanvasRef,
				...props,
			});
		},
		[setCanvasRef, setContainerRef],
		subSlot(slot, 'component'),
	);

	return {
		canvas: canvasElem,
		container: containerRef.current,
		setCanvasRef: setCanvasRef,
		setContainerRef: setContainerRef,
		rive: rive,
		RiveComponent: Component,
	};
}
