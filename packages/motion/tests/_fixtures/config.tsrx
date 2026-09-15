import { motion, MotionConfig } from '@octanejs/motion';
import { useRef, useState } from 'octane';

export function ConfigTree() @{
	<MotionConfig transition={{ duration: 0.5 }}>
		<motion.div id="box" animate={{ opacity: 1 }}>{'b'}</motion.div>
	</MotionConfig>
}

interface FilterProps {
	isValidProp: (key: string) => boolean;
	onClick: (event: MouseEvent) => void;
	ref: { current: HTMLButtonElement | null };
}

export function FilteredConfigTree(props: FilterProps) @{
	<div>
		<MotionConfig isValidProp={props.isValidProp}>
			<motion.button
				id="filtered"
				data-private="private"
				data-public="public"
				onClick={props.onClick}
				ref={props.ref}
				style={{ opacity: 0.5 }}
			>{'button'}</motion.button>
			<MotionConfig>
				<motion.div id="inherited" data-private="private" data-public="public" />
			</MotionConfig>
			<MotionConfig isValidProp={(key: string) => key !== 'data-public'}>
				<motion.div id="overridden" data-private="private" data-public="public" />
			</MotionConfig>
			<MotionConfig isValidProp={undefined}>
				<motion.div id="reset" data-private="private" data-public="public" />
			</MotionConfig>
		</MotionConfig>
		<motion.div id="outside" data-private="private" data-public="public" />
	</div>
}

export function InteractiveFilterTree() @{
	const [flipped, setFlipped] = useState(false);
	const [clicks, setClicks] = useState(0);
	const ref = useRef<HTMLButtonElement | null>(null);
	<div>
		<button id="change-filter" onClick={() => setFlipped(!flipped)}>{'change filter'}</button>
		<output>{String(clicks)}</output>
		<FilteredConfigTree
			isValidProp={(key: string) => key !== (flipped ? 'data-public' : 'data-private')}
			onClick={() => setClicks((value) => value + 1)}
			ref={ref}
		/>
	</div>
}
