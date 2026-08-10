import { animated, SpringValue } from '@octanejs/react-spring';

export function AnimatedHostFixture(props) @{
	const x = new SpringValue(0);
	const y = new SpringValue(0);
	props.onReady({ x, y });
	<animated.div id="animated-host" style={{ left: x, top: y }}>{'spring'}</animated.div>
}

export function AnimatedSsrFixture(props) @{
	<animated.div
		id="animated-ssr"
		data-state="initial"
		style={{ left: props.left, opacity: props.opacity }}
	>{'hydrated spring'}</animated.div>
}

export function AnimatedHostSurfaceFixture(props) @{
	<animated.div
		id="animated-surface"
		ref={props.hostRef}
		className={props.className}
		aria-label={props.label}
		data-fluid={props.attribute}
		scrollTop={props.scrollTop}
		scrollLeft={props.scrollLeft}
		style={{
			width: props.width,
			opacity: props.opacity,
			'--progress': props.progress,
			backgroundColor: props.color,
			x: props.x,
			rotate: props.rotate,
			scale: props.scale,
		}}
	>
		{props.text ?? 'surface'}
	</animated.div>
}

function ForwardingCustom(props) @{
	<button id="animated-custom" ref={props.ref} style={props.style}>{props.children}</button>
}

function OpaqueCustom(props) @{
	props.onRender();
	<span id="animated-opaque" data-value={props.value}>{'opaque'}</span>
}

const AnimatedCustom = animated(ForwardingCustom);
const AnimatedOpaque = animated(OpaqueCustom);

export function AnimatedCustomFixture(props) @{
	<>
		<AnimatedCustom ref={props.hostRef} style={{ width: props.width }}>{'custom'}</AnimatedCustom>
		<AnimatedOpaque value={props.value} onRender={props.onRender} />
	</>
}
