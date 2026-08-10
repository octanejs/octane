import {
	animated,
	SpringContext,
	useChain,
	useSpring,
	useSprings,
	useTrail,
} from '@octanejs/react-spring';

export function SpringHookFixture(props) @{
	props.onRender();
	const [styles, api] = useSpring(
		() => ({
			from: { x: 0, opacity: 0 },
			to: { x: props.x, opacity: 1 },
			immediate: true,
		}),
		[props.x],
	);
	props.onReady(api);
	<animated.div
		id="hook-spring"
		style={{ left: styles.x, opacity: styles.opacity }}
	>{'spring'}</animated.div>
}

export function ObjectSpringHookFixture(props) @{
	const styles = useSpring({
		from: { x: 0 },
		to: { x: props.x },
	});
	props.onReady(styles);
	<div>{'object spring'}</div>
}

export function TrailHookFixture(props) @{
	const styles = useTrail(2, {
		from: { x: 0 },
		to: { x: 1 },
		immediate: true,
		delay: props.delay,
	});
	props.onReady(styles);
	<div>{'trail'}</div>
}

export function UpdatingTrailHookFixture(props) @{
	const styles = useTrail(1, {
		from: { x: 0 },
		to: { x: props.x },
		immediate: true,
	});
	props.onReady(styles);
	<div>{'updating trail'}</div>
}

function ContextSpringChild(props) @{
	const styles = useSpring({
		from: { x: 0 },
		to: { x: 1 },
	});
	props.onReady(styles);
	<div>{'context spring'}</div>
}

export function ContextSpringFixture(props) @{
	<SpringContext immediate={true} pause={props.pause}>
		<ContextSpringChild onReady={props.onReady} />
	</SpringContext>
}

function ContextDepsSpringChild(props) @{
	const [styles] = useSpring(() => ({ from: { x: 0 }, to: { x: 1 }, immediate: true }), []);
	props.onReady(styles);
	<div>{'context deps spring'}</div>
}

export function ContextDepsSpringFixture(props) @{
	<SpringContext pause={props.pause}>
		<ContextDepsSpringChild onReady={props.onReady} />
	</SpringContext>
}

export function SpringsCohortFixture(props) @{
	const [styles, api] = useSprings(props.count, (index: number) => {
		props.onCreate(index);
		return { from: { x: 0 }, to: { x: props.goal + index }, immediate: true };
	}, [props.goal]);
	props.onReady(styles, api);
	<div>{'springs cohort'}</div>
}

export function NestedContextSpringFixture(props) @{
	<SpringContext immediate={true} pause={true}>
		<SpringContext pause={props.pause}>
			<ContextSpringChild onReady={props.onReady} />
		</SpringContext>
	</SpringContext>
}

export function ChainFixture(props) @{
	useChain(props.refs, props.timeSteps, props.timeFrame);
	<div>{'chain'}</div>
}
