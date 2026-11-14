import { useEffect } from 'octane';
import useLottie from '../hooks/useLottie.tsrx';
import useLottieInteractivity from '../hooks/useLottieInteractivity.tsrx';
import type { LottieComponentProps } from '../types.js';

const Lottie = (props: LottieComponentProps) => {
	const { style, interactivity, ...lottieProps } = props;

	/**
	 * Initialize the 'useLottie' hook
	 */
	const {
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
		animationContainerRef,
		animationLoaded,
		animationItem,
	} = useLottie(lottieProps, style);

	/**
	 * Make the hook variables/methods available through the provided 'lottieRef'
	 */
	useEffect(() => {
		if (props.lottieRef) {
			props.lottieRef.current = {
				play,
				stop,
				pause,
				setSpeed,
				goToAndPlay,
				goToAndStop,
				setDirection,
				playSegments,
				setSubframe,
				getDuration,
				destroy,
				animationContainerRef,
				animationLoaded,
				animationItem,
			};
		}
	}, [props.lottieRef?.current]);

	return useLottieInteractivity({
		lottieObj: {
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
			animationContainerRef,
			animationLoaded,
			animationItem,
		},
		actions: interactivity?.actions ?? [],
		mode: interactivity?.mode ?? 'scroll',
	});
};

export default Lottie;
