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

// A TSX value position can evaluate to `null`, which the compiled TSRX children
// body never could (it is emitted statically, present or absent for the whole
// component). Clearing the host must run through the same reconcile.
export function ToggleableTsxChildren(props: { show: boolean }) {
	return (
		<section>
			<motion.div id="tsx-toggle">
				{props.show ? <span id="tsx-toggle-kid">kid</span> : null}
			</motion.div>
		</section>
	);
}
