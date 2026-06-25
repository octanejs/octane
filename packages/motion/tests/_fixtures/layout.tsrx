import { motion } from '@octane-ts/motion';

export function LayoutBox(props) @{
	<motion.div id="box" layout transition={{ duration: 0.3 }}>
		{props.label as string}
	</motion.div>
}
