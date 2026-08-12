import { useInView, useReducedMotion, useResize, useScroll } from '@octanejs/spring';

export function BrowserHooksFixture(props) @{
	const scroll = useScroll({ container: props.container, immediate: true });
	const resize = useResize({ container: props.container, immediate: true, ...props.resizeOptions });
	const [intersectionRef, inView] = useInView({ once: props.once });
	const reducedMotion = useReducedMotion();
	props.onReady({ scroll, resize, inView, reducedMotion });
	<div id="intersection-target" ref={intersectionRef}>target</div>
}
