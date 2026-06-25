import { motion } from '@octane-ts/motion';

export function Box() @{
	<motion.div
		id="box"
		className="card"
		initial={{ opacity: 0 }}
		animate={{ opacity: 1, x: 100 }}
		transition={{ duration: 0.3 }}
	>
		<span id="kid">{'hi'}</span>
	</motion.div>
}

export function Span() @{
	<motion.span id="sp" className="lbl">{'label'}</motion.span>
}

export function HoverBox() @{
	<motion.div
		id="box"
		whileHover={{ scale: 1.1 }}
		whileTap={{ scale: 0.9 }}
		animate={{ scale: 1 }}
	/>
}
