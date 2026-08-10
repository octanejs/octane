import { animated, useTransition } from '@octanejs/react-spring';

export function TransitionFixture(props) @{
	const transitions = useTransition(props.items, {
		keys: (item: any) => item.id,
		from: { opacity: 0 },
		enter: { opacity: 1 },
		leave: props.leave ?? { opacity: 0 },
		immediate: props.immediate ?? true,
		exitBeforeEnter: props.exitBeforeEnter,
		expires: props.expires,
		trail: props.trail,
		reverse: props.reverse,
		onStart: props.onStart,
		sort: props.sort,
		cancel: props.cancel,
		pause: props.pause,
	});
	<div id="transition-list">{transitions(
		(styles: any, item: any, transition: any) =>
			<animated.div
				key={transition.key}
				data-key={transition.key}
				data-label={item.label}
				data-phase={transition.phase}
				style={styles}
			>{item.label}</animated.div>,
	)}</div>
}
