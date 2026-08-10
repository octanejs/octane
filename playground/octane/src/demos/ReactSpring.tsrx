import { useState } from 'octane';
import { animated, useReducedMotion, useSpring, useTransition } from '@octanejs/react-spring';
import { Parallax, ParallaxLayer } from '@octanejs/react-spring/parallax';

export function ReactSpringDemo() @{
	const [target, setTarget] = useState(24);
	const [items, setItems] = useState([
		{ id: 1, label: 'Alpha' },
		{ id: 2, label: 'Beta' },
	]);
	const reducedMotion = useReducedMotion();
	const [styles, api] = useSpring(
		() => ({
			from: { left: 0, opacity: 0.35 },
			to: { left: target, opacity: 1 },
			immediate: reducedMotion === true,
		}),
		[target, reducedMotion],
	);
	const transitions = useTransition(items, {
		keys: (item: any) => item.id,
		from: { opacity: 0 },
		enter: { opacity: 1 },
		leave: { opacity: 0 },
		immediate: reducedMotion === true,
	});
	const interrupt = () => {
		setTarget((value) => (value === 24 ? 210 : 24));
		void api.start({ to: { left: target === 24 ? 210 : 24 } });
	};
	const replace = () => setItems(
		(current) => current.some((item) => item.id === 1)
			? [
					{ id: 2, label: 'Beta' },
					{ id: 3, label: 'Gamma' },
				]
			: [
					{ id: 1, label: 'Alpha' },
					{ id: 2, label: 'Beta' },
				],
	);

	<div>
		<h2 class="demo-title">{'React Spring'}</h2>
		<p
			class="demo-blurb"
		>{'Declarative and imperative springs, keyed transitions, reduced motion, and Parallax without React.'}</p>
		<div class="row">
			<button id="spring-interrupt" class="btn" onClick={interrupt}>{'Interrupt spring'}</button>
			<button id="spring-transition" class="btn" onClick={replace}>{'Replace items'}</button>
			<span id="spring-motion-preference">
				{reducedMotion === true ? 'Reduced motion' : 'Full motion'}
			</span>
		</div>
		<div class="react-spring-track">
			<animated.div id="spring-dot" class="react-spring-dot" style={styles} />
		</div>
		<div id="spring-items" class="react-spring-items">{transitions(
			(itemStyles: any, item: any, transition: any) =>
				<animated.div
					key={transition.key}
					data-transition-key={transition.key}
					style={itemStyles}
				>{item.label}</animated.div>,
		)}</div>
		<div class="react-spring-parallax">
			<Parallax pages={2}>
				<ParallaxLayer offset={0} speed={0.25}>
					<div class="react-spring-page">{'Scroll this lane'}</div>
				</ParallaxLayer>
				<ParallaxLayer offset={1} speed={0.7}>
					<div class="react-spring-page">{'Parallax layer'}</div>
				</ParallaxLayer>
				<ParallaxLayer sticky={{ start: 0.4, end: 1.4 }}>
					<div class="react-spring-sticky">{'Sticky'}</div>
				</ParallaxLayer>
			</Parallax>
		</div>
	</div>
}
