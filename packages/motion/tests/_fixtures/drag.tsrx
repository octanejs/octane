import { motion } from '@octane-ts/motion';

export function DragBox(props) @{
	<motion.div
		id="box"
		drag
		dragConstraints={{ left: -50, right: 50, top: -50, bottom: 50 }}
		onDrag={props.onDrag}
	>{'b'}</motion.div>
}
