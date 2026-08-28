import { useEffect, useRef, useState, type OctaneNode } from 'octane';
import { Transition, type TransitionStatus } from '@octanejs/transition-group';

type Component<Props> = (props: Props) => OctaneNode;

interface FadeProps<Props> {
	component: Component<Props>;
	duration?: number;
	in?: boolean;
	onExited?: (node?: Element) => void;
}

export function Fade<Props extends Record<string, unknown>>(props: FadeProps<Props> & Props) @{
	const {
		component: Tag,
		duration = 1,
		in: inProp,
		onExited: _onExited,
		innerProps: rawConsumerInnerProps,
		...componentProps
	} = props;
	const nodeRef = useRef<HTMLElement | null>(null);
	const transition: Partial<Record<TransitionStatus, Record<string, string | number>>> = {
		entering: { opacity: 0 },
		entered: { opacity: 1, transition: `opacity ${duration}ms` },
		exiting: { opacity: 0 },
		exited: { opacity: 0 },
	};
	const consumerInnerProps = rawConsumerInnerProps as Record<string, unknown> | undefined;
	const consumerStyle = (consumerInnerProps?.style ?? {}) as Record<string, unknown>;

	<Transition mountOnEnter unmountOnExit in={inProp} timeout={duration} nodeRef={nodeRef}>
		{(status: TransitionStatus) => <Tag
			{...componentProps as unknown as Props}
			innerProps={{
				...consumerInnerProps,
				style: { ...consumerStyle, ...transition[status] },
				ref: nodeRef,
			}}
		/>}
	</Transition>
}

export const collapseDuration = 260;

interface CollapseProps {
	children?: OctaneNode;
	in?: boolean;
	onExited?: (node?: Element) => void;
}

export function Collapse(props: CollapseProps) @{
	const ref = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState<number | 'auto'>('auto');

	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const frame = window.requestAnimationFrame(
			() => setWidth(element.getBoundingClientRect().width),
		);
		return () => window.cancelAnimationFrame(frame);
	}, []);

	const styleFor = (status: TransitionStatus) => {
		if (status === 'exiting') {
			return { width: 0, transition: `width ${collapseDuration}ms ease-out` };
		}
		if (status === 'exited') return { width: 0 };
		return { width };
	};

	<Transition
		enter={false}
		mountOnEnter
		unmountOnExit
		in={props.in}
		onExited={() => {
			if (ref.current) props.onExited?.(ref.current);
		}}
		timeout={collapseDuration}
		nodeRef={ref}
	>
		{(status: TransitionStatus) =>
			<div
				ref={ref}
				style={{ overflow: 'hidden', whiteSpace: 'nowrap', ...styleFor(status) }}
			>{props.children}</div>}
	</Transition>
}
