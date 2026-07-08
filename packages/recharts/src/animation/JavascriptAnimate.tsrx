// Port of animation/JavascriptAnimate.tsx — the render-prop animation driver:
// `children(t)` with t progressing 0→1 through the (vendored) animation core.
// `isActive={false}` renders a single synchronous `children(1)` — the static
// path Phases 0–4 ride; the live rAF path works through the same vendored
// controller.
import { useEffect, useState } from 'octane';
import { noop } from '../util/DataUtils';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { createEasingFunction } from './easing';
import { useAnimationController } from './useAnimationController.ts';
import { Global } from '../util/Global';
import { usePrefersReducedMotion } from '../util/usePrefersReducedMotion.ts';
import { JavascriptAnimation } from './AnimationHandle';
import { RequestAnimationFrameTimeoutController } from './timeoutController';

const defaultJavascriptAnimateProps = {
	begin: 0,
	duration: 1000,
	easing: 'ease',
	isActive: true,
	canBegin: true,
	onAnimationEnd: () => {},
	onAnimationStart: () => {},
};

const from = 0;
const to = 1;

export function JavascriptAnimate(outsideProps) {
	const props = resolveDefaultProps(outsideProps, defaultJavascriptAnimateProps);
	const {
		animationId,
		isActive: isActiveProp,
		canBegin,
		duration,
		easing,
		begin,
		onAnimationEnd,
		onAnimationStart,
		children,
	} = props;
	const prefersReducedMotion = usePrefersReducedMotion();
	const isActive =
		isActiveProp === 'auto' ? !Global.isSsr && !prefersReducedMotion : isActiveProp;
	const animationController = useAnimationController(props.animationController);
	const [style, setStyle] = useState(isActive ? from : to);
	useEffect(() => {
		if (!isActive) {
			setStyle(to);
		}
	}, [isActive]);
	useEffect(() => {
		const easingFunction = createEasingFunction(easing);
		if (!isActive || !canBegin || easingFunction == null) {
			return noop;
		}
		const timeoutController = new RequestAnimationFrameTimeoutController();
		const animation = new JavascriptAnimation({
			animationId,
			easing: easingFunction,
			animationDuration: duration,
			animationBegin: begin,
			onAnimationStart,
			onAnimationEnd,
			from,
			to,
		});
		return animationController(timeoutController, animation, setStyle);
	}, [
		animationController,
		animationId,
		isActive,
		canBegin,
		duration,
		easing,
		begin,
		onAnimationStart,
		onAnimationEnd,
	]);
	return children(Number(style));
}
