interface EventSurfaceProps {
	record: (event: Event) => void;
}

export function EventSurface(props: EventSurfaceProps) @{
	<section
		id="parent"
		onLoad={props.record}
		onLoadCapture={props.record}
		onScroll={props.record}
		onScrollCapture={props.record}
	>
		<div
			id="child"
			onLoad={props.record}
			onLoadCapture={props.record}
			onScroll={props.record}
			onScrollCapture={props.record}
		/>
	</section>
}

// A second export keeps production's component-owned registration in play.
export function OtherSurface(props: EventSurfaceProps) @{
	<video onLoadedData={props.record} onLoadedDataCapture={props.record} />
}
