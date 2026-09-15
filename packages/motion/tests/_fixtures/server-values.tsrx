import {
	useAnimate,
	useMotionValue,
	useReducedMotion,
	useScroll,
	useSpring,
	useTransform,
} from '@octanejs/motion';

export function ServerValues() @{
	const value = useMotionValue(10);
	const doubled = useTransform(value, (latest) => latest * 2);
	const spring = useSpring(5);
	const scroll = useScroll();
	const reduced = useReducedMotion();
	const [scope] = useAnimate();
	<output>{`${value.get()}:${doubled.get()}:${spring.get()}:${scroll.scrollY.get()}:${reduced}:${
		scope.current === null
	}`}</output>
}
