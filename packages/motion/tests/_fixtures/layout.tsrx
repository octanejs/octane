import { motion } from '@octanejs/motion';

export function LayoutBox(props) @{
	<motion.div id="box" layout transition={{ duration: 0.3 }}>{props.label as string}</motion.div>
}

export function LayoutModeBox(props) @{
	<motion.div
		id="layout-mode-box"
		layout={props.layout}
		transition={props.transition}
	>{props.label as string}</motion.div>
}
