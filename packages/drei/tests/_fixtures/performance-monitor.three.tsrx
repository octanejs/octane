import { PerformanceMonitor, usePerformanceMonitor } from '@octanejs/drei';

function Subscriber(props) @{
	usePerformanceMonitor({
		onIncline: props.onSubscriberIncline,
		onDecline: props.onSubscriberDecline,
		onChange: props.onSubscriberChange,
		onFallback: props.onSubscriberFallback,
	});
	null;
}

export function PerformanceMonitorScene(props) @{
	<PerformanceMonitor
		iterations={props.iterations}
		ms={props.ms}
		threshold={props.threshold}
		step={props.step}
		factor={props.factor}
		flipflops={props.flipflops}
		bounds={props.bounds}
		onIncline={props.onIncline}
		onDecline={props.onDecline}
		onChange={props.onChange}
		onFallback={props.onFallback}
	>
		<Subscriber {...props} />
	</PerformanceMonitor>
}
