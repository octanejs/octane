import Lottie, {
	LottiePlayer,
	useLottie,
	useLottieInteractivity,
	type Action,
	type LottieOptions,
	type LottieRef,
} from '@octanejs/lottie-react';
import type { OctaneElement } from 'octane';

export function PackedLottie(animationData: unknown): OctaneElement {
	const actions = [{ type: 'seek', frames: [0, 10], visibility: [0, 1] }] satisfies Action[];
	const lottieRef: LottieRef = { current: null };
	const options = {
		animationData,
		renderer: 'canvas',
		rendererSettings: { clearCanvas: true },
		onEnterFrame: null,
	} satisfies LottieOptions<'canvas'>;

	LottiePlayer.setQuality('high');
	const lottieObj = useLottie(options);
	// @ts-expect-error Only 1 and -1 are accepted as playback directions.
	lottieObj.setDirection(0);
	// @ts-expect-error Lottie animation event callbacks do not receive a string.
	Lottie({ animationData, onEnterFrame: (_event: string) => {} });

	return useLottieInteractivity({ lottieObj, actions, mode: 'scroll' });
}
