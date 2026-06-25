import { motion, AnimatePresence } from '@octane-ts/motion';

export function Toggle(props) @{
	<AnimatePresence>
		@if (props.show) {
			<motion.div id="box" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>{'x'}</motion.div>
		}
	</AnimatePresence>
}
