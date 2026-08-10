import { LazyMotion, domMax, motion } from '@octanejs/motion';
import * as m from '@octanejs/motion/react-m';

export function LazyMotionSurface() @{
	<LazyMotion features={domMax}>
		<m.div id="lazy-div" animate={{ opacity: 1 }}>
			<m.span id="lazy-span">{'lazy'}</m.span>
		</m.div>
	</LazyMotion>
}

export function UnloadedMotionSurface() @{
	<m.div id="unloaded-div" animate={{ opacity: 1 }}>{'unloaded'}</m.div>
}

export function AsyncLazyMotionSurface(props) @{
	<LazyMotion features={props.features}>
		<m.div id="async-lazy-div" initial={props.initial} animate={{ opacity: 1 }}>{'async'}</m.div>
	</LazyMotion>
}

export function LazyMotionErrorSurface(props) @{
	@try {
		<LazyMotion features={props.features}>
			<m.div id="error-lazy-div">{'async'}</m.div>
		</LazyMotion>
	} @catch (error) {
		<div id="lazy-motion-error">{(error as Error).message as string}</div>
	}
}

export function FeatureBundleSurface(props) @{
	<LazyMotion features={props.features}>
		<m.div
			id="feature-bundle-div"
			animate={{ opacity: 1 }}
			drag
			dragConstraints={{ left: -50, right: 50, top: -50, bottom: 50 }}
			onDrag={props.onDrag}
		>{'features'}</m.div>
	</LazyMotion>
}

export function StrictLazyMotionSurface() @{
	<LazyMotion features={domMax} strict>
		<motion.div id="strict-motion-div">{'strict'}</motion.div>
	</LazyMotion>
}
