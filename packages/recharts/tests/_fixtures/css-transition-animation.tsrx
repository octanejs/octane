import { CSSTransitionAnimate } from '../../src/animation/CSSTransitionAnimate';

const holdCssAnimation = () => () => {};

export function CSSTransitionReactivationApp({ isActive, canBegin }) @{
	<CSSTransitionAnimate
		animationId="reactivation-regression"
		animationController={holdCssAnimation}
		from="scale(0)"
		to="scale(1)"
		attributeName="transform"
		isActive={isActive}
		canBegin={canBegin}
	>
		{(style) => <div className="css-transition-target" style={style} />}
	</CSSTransitionAnimate>
}
