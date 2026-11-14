import { motion } from '@octanejs/motion';
import { Suspense, use } from 'octane';

export function DragBox(props) @{
	<motion.div
		id="box"
		drag
		dragListener={props.dragListener}
		dragControls={props.dragControls}
		dragConstraints={{ left: -50, right: 50, top: -50, bottom: 50 }}
		onDrag={props.onDrag}
		onDragStart={props.onDragStart}
		onDragEnd={props.onDragEnd}
	>
		{'b'}
	</motion.div>
}

function PendingDrag({ onPending, wait }: { onPending: () => void; wait: Promise<void> }) @{
	onPending();
	use(wait);
	<span>ready</span>
}

export function SuspendedDrag(props: {
	dragListener: boolean;
	onDragStart: () => void;
	onPending: () => void;
	wait?: Promise<void>;
}) @{
	<Suspense fallback={<span>waiting</span>}>
		<motion.div id="box" drag dragListener={props.dragListener} onDragStart={props.onDragStart}>
			@if (props.wait) {
				<PendingDrag onPending={props.onPending} wait={props.wait} />
			}
		</motion.div>
	</Suspense>
}
