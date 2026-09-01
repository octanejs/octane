import { createPortal } from 'octane';

export function EventWorkPortal(props: {
	target: Element;
	id: number;
	onCapture: () => void;
	onClick: () => void;
	onBubble: () => void;
	onRef: (node: HTMLButtonElement | null) => void;
}) @{
	<section onClickCapture={props.onCapture} onClick={props.onBubble}>{createPortal(
		<button
			type="button"
			data-event-work-portal={String(props.id)}
			ref={props.onRef}
			onClick={props.onClick}
		>
			Portal event
		</button>,
		props.target,
	)}</section>
}
