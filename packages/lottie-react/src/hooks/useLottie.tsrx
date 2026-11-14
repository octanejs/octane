import lottie, {
	type AnimationConfigWithData,
	type AnimationItem,
	type AnimationDirection,
	type AnimationSegment,
	type RendererType,
} from 'lottie-web';
import { useEffect, useRef, useState, type CSSProperties, type OctaneElement } from 'octane';
import type { Listener, LottieOptions, LottieRefCurrentProps, PartialListener } from '../types.js';

export default function useLottie<T extends RendererType = 'svg'>(
	props: LottieOptions<T>,
	style?: CSSProperties,
): { View: OctaneElement } & LottieRefCurrentProps {
	const {
		animationData,
		loop,
		autoplay,
		initialSegment,

		onComplete,
		onLoopComplete,
		onEnterFrame,
		onSegmentStart,
		onConfigReady,
		onDataReady,
		onDataFailed,
		onLoadedImages,
		onDOMLoaded,
		onDestroy,

		// Specified here to take them out from the 'rest'
		lottieRef: _lottieRef,
		renderer: _renderer,
		name: _name,
		assetsPath: _assetsPath,
		rendererSettings: _rendererSettings,

		...rest
	} = props;

	const [animationLoaded, setAnimationLoaded] = useState(false);
	const animationInstanceRef = useRef<AnimationItem>();
	const animationContainer = useRef<HTMLDivElement>(null);

	const play = (): void => {
		animationInstanceRef.current?.play();
	};

	const stop = (): void => {
		animationInstanceRef.current?.stop();
	};

	const pause = (): void => {
		animationInstanceRef.current?.pause();
	};

	const setSpeed = (speed: number): void => {
		animationInstanceRef.current?.setSpeed(speed);
	};

	const goToAndPlay = (value: number, isFrame?: boolean): void => {
		animationInstanceRef.current?.goToAndPlay(value, isFrame);
	};

	const goToAndStop = (value: number, isFrame?: boolean): void => {
		animationInstanceRef.current?.goToAndStop(value, isFrame);
	};

	const setDirection = (direction: AnimationDirection): void => {
		animationInstanceRef.current?.setDirection(direction);
	};

	const playSegments = (
		segments: AnimationSegment | AnimationSegment[],
		forceFlag?: boolean,
	): void => {
		animationInstanceRef.current?.playSegments(segments, forceFlag);
	};

	const setSubframe = (useSubFrames: boolean): void => {
		animationInstanceRef.current?.setSubframe(useSubFrames);
	};

	const getDuration = (inFrames?: boolean): number | undefined =>
		animationInstanceRef.current?.getDuration(inFrames);

	const destroy = (): void => {
		animationInstanceRef.current?.destroy();

		// Removing the reference to the animation so separate cleanups are skipped.
		// Without it the internal `lottie-react` instance throws exceptions as it already cleared itself on destroy.
		animationInstanceRef.current = undefined;
	};

	/**
	 * Load a new animation, and if it's the case, destroy the previous one
	 */
	const loadAnimation = () => {
		// Return if the container ref is null
		if (!animationContainer.current) {
			return;
		}

		// Destroy any previous instance
		animationInstanceRef.current?.destroy();

		// Build the animation configuration
		const config: AnimationConfigWithData<T> = {
			...props,
			container: animationContainer.current,
		};

		// Save the animation instance
		animationInstanceRef.current = lottie.loadAnimation(config);

		setAnimationLoaded(!!animationInstanceRef.current);

		// Return a function that will clean up
		return () => {
			animationInstanceRef.current?.destroy();
			animationInstanceRef.current = undefined;
		};
	};

	/**
	 * (Re)Initialize when animation data changed
	 */
	useEffect(() => {
		const onUnmount = loadAnimation();

		// Clean up on unmount
		return () => onUnmount?.();
	}, [animationData, loop]);

	// Update the autoplay state
	useEffect(() => {
		if (!animationInstanceRef.current) {
			return;
		}

		animationInstanceRef.current.autoplay = !!autoplay;
	}, [autoplay]);

	// Update the initial segment state
	useEffect(() => {
		if (!animationInstanceRef.current) {
			return;
		}

		// When null should reset to default animation length
		if (!initialSegment) {
			animationInstanceRef.current.resetSegments(true);
			return;
		}

		// If it's not a valid segment, do nothing
		if (!Array.isArray(initialSegment) || !initialSegment.length) {
			return;
		}

		// If the current position it's not in the new segment
		// set the current position to start
		if (
			animationInstanceRef.current.currentRawFrame < initialSegment[0] ||
			animationInstanceRef.current.currentRawFrame > initialSegment[1]
		) {
			animationInstanceRef.current.currentRawFrame = initialSegment[0];
		}

		// Update the segment
		animationInstanceRef.current.setSegment(initialSegment[0], initialSegment[1]);
	}, [initialSegment]);

	/**
	 * Reinitialize listener on change
	 */
	useEffect(() => {
		const partialListeners: PartialListener[] = [
			{ name: 'complete', handler: onComplete },
			{ name: 'loopComplete', handler: onLoopComplete },
			{ name: 'enterFrame', handler: onEnterFrame },
			{ name: 'segmentStart', handler: onSegmentStart },
			{ name: 'config_ready', handler: onConfigReady },
			{ name: 'data_ready', handler: onDataReady },
			{ name: 'data_failed', handler: onDataFailed },
			{ name: 'loaded_images', handler: onLoadedImages },
			{ name: 'DOMLoaded', handler: onDOMLoaded },
			{ name: 'destroy', handler: onDestroy },
		];

		const listeners = partialListeners.filter(
			(listener: PartialListener): listener is Listener => listener.handler != null,
		);

		if (!listeners.length) {
			return;
		}

		const deregisterList = listeners.map(
			/**
			 * Handle the process of adding an event listener
			 * @param {Listener} listener
			 * @return {Function} Function that deregister the listener
			 */
			(listener) => {
				animationInstanceRef.current?.addEventListener(listener.name, listener.handler);

				// Return a function to deregister this listener
				return () => {
					animationInstanceRef.current?.removeEventListener(listener.name, listener.handler);
				};
			},
		);

		// Deregister listeners on unmount
		return () => {
			deregisterList.forEach((deregister) => deregister());
		};
	}, [
		onComplete,
		onLoopComplete,
		onEnterFrame,
		onSegmentStart,
		onConfigReady,
		onDataReady,
		onDataFailed,
		onLoadedImages,
		onDOMLoaded,
		onDestroy,
	]);

	/**
	 * Build the animation view
	 */
	const View = <div style={style} ref={animationContainer} {...rest} />;

	return {
		View,
		play,
		stop,
		pause,
		setSpeed,
		goToAndStop,
		goToAndPlay,
		setDirection,
		playSegments,
		setSubframe,
		getDuration,
		destroy,
		animationContainerRef: animationContainer,
		animationLoaded,
		animationItem: animationInstanceRef.current,
	};
}
