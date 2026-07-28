import { motion } from '@octanejs/motion';

export function TsxDescriptorChildren(props: { first: string; second: string }) {
	return (
		<section>
			<motion.div id="tsx-motion">
				<span id="tsx-first">{props.first}</span>
				<span id="tsx-second">{props.second}</span>
			</motion.div>
		</section>
	);
}
