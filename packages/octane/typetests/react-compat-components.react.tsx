/** @jsxImportSource react */
import * as React from 'react';

export interface CounterProps {
	label: string;
	start: number;
	onCount?: (count: number) => void;
	ref?: React.Ref<HTMLInputElement>;
}

export function Counter({ label, start, onCount, ref }: CounterProps) {
	return (
		<input aria-label={label} defaultValue={start} onChange={() => onCount?.(start)} ref={ref} />
	);
}

export const MemoCounter = React.memo(Counter);
export const LazyCounter = React.lazy(async () => ({ default: Counter }));
export const ForwardedCounter = React.forwardRef<HTMLInputElement, Omit<CounterProps, 'ref'>>(
	(props, ref) => <Counter {...props} ref={ref} />,
);

export class ClassCounter extends React.Component<{ label: string }> {
	render() {
		return <span>{this.props.label}</span>;
	}
}

export function OptionalCounter(props: { start?: number }) {
	return <span>{props.start ?? 0}</span>;
}

export function EmptyCounter() {
	return null;
}
