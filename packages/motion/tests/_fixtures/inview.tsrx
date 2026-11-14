import { motion, useInView, type UseInViewOptions } from '@octanejs/motion';
import { useRef } from 'octane';

export function InViewBox() @{
	<motion.div id="box" whileInView={{ opacity: 1 }} transition={{ duration: 0.2 }}>
		{'b'}
	</motion.div>
}

export function InViewPair({ options }: { options: UseInViewOptions }) @{
	const leftRef = useRef<HTMLDivElement>(null);
	const rightRef = useRef<HTMLDivElement>(null);
	const left = useInView(leftRef);
	const right = useInView(rightRef, options);
	<section>
		<div id="left" ref={leftRef} data-visible={String(left)} />
		<div id="right" ref={rightRef} data-visible={String(right)} />
	</section>
}
