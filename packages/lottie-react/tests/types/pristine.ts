import * as Lottie from 'lottie-react';
import type Player from 'lottie-web';
import type {
	AnimationConfigWithData,
	AnimationEventCallback,
	AnimationEventName,
	AnimationEvents,
	AnimationSegment,
} from 'lottie-web';
import type { ReactElement } from 'react';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';

type AnimationHandler = AnimationEventCallback<AnimationEvents[AnimationEventName]>;

export type ComponentView = Assert<Equal<ReturnType<typeof Lottie.default>['key'], string | null>>;
export type PlayerExport = Assert<Equal<typeof Lottie.LottiePlayer, typeof Player>>;
export type HookView = Assert<Equal<ReturnType<typeof Lottie.useLottie>['View'], ReactElement>>;
export type InteractivityView = Assert<
	Equal<ReturnType<typeof Lottie.useLottieInteractivity>, ReactElement>
>;
export type ActionFrames = Assert<Equal<Lottie.Action['frames'], [number] | [number, number]>>;
export type AnimationAxis = Assert<Equal<Lottie.Axis, 'x' | 'y'>>;
export type InteractivityMode = Assert<
	Equal<Lottie.InteractivityProps['mode'], 'scroll' | 'cursor'>
>;
export type ListenerHandler = Assert<Equal<Lottie.Listener['handler'], AnimationHandler>>;
export type ComponentInteractivity = Assert<
	Equal<NonNullable<Lottie.LottieComponentProps['interactivity']>['mode'], 'scroll' | 'cursor'>
>;
export type AnimationData = Assert<Equal<Lottie.LottieOptions['animationData'], unknown>>;
export type CanvasOptions = Assert<
	Equal<
		Lottie.LottieOptions<'canvas'>['rendererSettings'],
		AnimationConfigWithData<'canvas'>['rendererSettings']
	>
>;
export type EnterFrameCallback = Assert<
	Equal<Lottie.LottieOptions['onEnterFrame'], AnimationHandler | null | undefined>
>;
export type DataFailedCallback = Assert<
	Equal<Lottie.LottieOptions['onDataFailed'], AnimationHandler | null | undefined>
>;
export type CurrentAnimationLoaded = Assert<
	Equal<NonNullable<Lottie.LottieRef['current']>['animationLoaded'], boolean>
>;
export type HandleSegments = Assert<
	Equal<
		Parameters<Lottie.LottieRefCurrentProps['playSegments']>,
		[AnimationSegment | AnimationSegment[], boolean?]
	>
>;
export type HandleDuration = Assert<
	Equal<ReturnType<Lottie.LottieRefCurrentProps['getDuration']>, number | undefined>
>;
export type NullableListener = Assert<
	Equal<Lottie.PartialListener['handler'], AnimationHandler | null | undefined>
>;
export type PartialComponentInteractivity = Assert<
	Equal<
		NonNullable<Lottie.PartialLottieComponentProps['interactivity']>['mode'],
		'scroll' | 'cursor'
	>
>;
export type PartialOptionsCallback = Assert<
	Equal<Lottie.PartialLottieOptions['onEnterFrame'], AnimationHandler | null | undefined>
>;
export type CursorPosition = Assert<
	Equal<Lottie.Position, { x: number | [number, number]; y: number | [number, number] }>
>;

export function CheckPristineDeclaration(animationData: unknown) {
	const lottieRef: Lottie.LottieRef = { current: null };
	const partialComponent: Lottie.PartialLottieComponentProps = {};
	const partialOptions: Lottie.PartialLottieOptions = {};
	Lottie.default({ ...partialComponent, animationData });
	Lottie.useLottie({ ...partialOptions, animationData });
	const lottieObj = Lottie.useLottie<'canvas'>({
		animationData,
		lottieRef,
		renderer: 'canvas',
		rendererSettings: { clearCanvas: true },
		onComplete: null,
	});
	lottieObj.setDirection(-1);
	lottieObj.playSegments(
		[
			[1, 4],
			[6, 9],
		],
		true,
	);

	// @ts-expect-error The player direction must be 1 or -1.
	lottieObj.setDirection(0);
	// @ts-expect-error An animation event callback does not receive strings.
	Lottie.useLottie({ animationData, onComplete: (_event: string) => {} });
	// @ts-expect-error The component requires animationData.
	Lottie.default({ autoplay: false });
	// @ts-expect-error Only scroll and cursor are supported modes.
	Lottie.useLottieInteractivity({ lottieObj, actions: [], mode: 'hover' });

	return Lottie.useLottieInteractivity({
		lottieObj,
		actions: [{ type: 'seek', frames: [0, 10], position: { x: [0, 1], y: 0 } }],
		mode: 'cursor',
	});
}
