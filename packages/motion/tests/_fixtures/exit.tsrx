import { motion, AnimatePresence } from '@octanejs/motion';
import { Activity } from 'octane';

export function Toggle(props) @{
	<AnimatePresence>
		@if (props.show) {
			<motion.div id="box" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
				{'x'}
			</motion.div>
		}
	</AnimatePresence>
}

export function ActivityToggle(props: { mode: 'visible' | 'hidden'; show: boolean }) @{
	<Activity mode={props.mode}>
		<Toggle show={props.show} />
	</Activity>
}
