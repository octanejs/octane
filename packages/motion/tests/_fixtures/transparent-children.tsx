/** @jsxImportSource octane */
import { AnimatePresence, MotionConfig } from '@octanejs/motion';

export function TsxPresence(props: { show: boolean }) {
	return (
		<AnimatePresence>{props.show ? <div id="presence-child">visible</div> : null}</AnimatePresence>
	);
}

export function TsxMotionConfig() {
	return (
		<MotionConfig reducedMotion="always">
			<span id="config-child">configured</span>
		</MotionConfig>
	);
}
