import { motion } from '@octane-ts/motion';

export function MotionList(props) @{
	<motion.div id="list">
		@for (const n of props.items; key n) {
			<span class="row">
				{n as string}
			</span>
		}
	</motion.div>
}
export function PlainList(props) @{
	<div id="list">
		@for (const n of props.items; key n) {
			<span class="row">
				{n as string}
			</span>
		}
	</div>
}
