import { motion } from '@octanejs/motion';

export function Hero() @{
	<motion.div id="hero" layoutId="hero" transition={{ duration: 0.4 }}>{'h'}</motion.div>
}

export function NamedHero(props) @{
	<motion.div
		id="named-hero"
		layout={props.layout}
		layoutId={props.layoutId}
		style={props.style}
		transition={{ duration: 0.4 }}
	>{'h'}</motion.div>
}
