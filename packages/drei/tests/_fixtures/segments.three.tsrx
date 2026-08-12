import { Segment, Segments } from '@octanejs/drei';

export function SegmentsScene(props) @{
	<Segments ref={props.ref} limit={props.limit} lineWidth={props.lineWidth} dashed={props.dashed}>
		<Segment ref={props.firstRef} start={props.firstStart} end={[1, 2, 3]} color="red" />
		@if (props.showSecond) {
			<Segment start={2} end={[3, 4, 5]} color="#00ff00" />
		}
		<Segment start={[9, 9, 9]} end={[10, 10, 10]} color="blue" />
	</Segments>
}
