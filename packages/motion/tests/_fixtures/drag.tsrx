import { motion } from '@octanejs/motion';

export function DragBox(props) @{
	<motion.div
		id="box"
		drag
		dragConstraints={{ left: -50, right: 50, top: -50, bottom: 50 }}
		onDrag={props.onDrag}
		onDragStart={props.onDragStart}
		onDragEnd={props.onDragEnd}
	>
		<button id="drag-child">{'drag'}</button>
	</motion.div>
}
