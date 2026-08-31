/** @jsxImportSource react */
import * as React from 'react';

export interface CounterProps {
	start: number;
	label?: string;
	ref?: React.Ref<HTMLButtonElement>;
}

export function Counter({ start, label = 'count', ref }: CounterProps) {
	const [count, setCount] = React.useState(start);
	return (
		<button ref={ref} data-counter={label} onClick={() => setCount((value) => value + 1)}>
			{label}:{count}
		</button>
	);
}

export const MemoCounter = React.memo(Counter);
export const LazyCounter = React.lazy(async () => ({ default: Counter }));
export const ForwardedCounter = React.forwardRef<HTMLButtonElement, Omit<CounterProps, 'ref'>>(
	(props, ref) => <Counter {...props} ref={ref} />,
);

export class ClassCounter extends React.Component<CounterProps, { count: number }> {
	state = { count: this.props.start };

	render() {
		return (
			<button
				data-counter={this.props.label}
				onClick={() => this.setState(({ count }) => ({ count: count + 1 }))}
			>
				{this.props.label}:{this.state.count}
			</button>
		);
	}
}

export function DefaultedFunction(props: { label?: string }) {
	return <span data-default-kind="function">{props.label ?? 'missing'}</span>;
}
DefaultedFunction.defaultProps = { label: 'legacy-function-default' };

export class DefaultedClass extends React.Component<{ label?: string }> {
	static defaultProps = { label: 'class-default' };

	render() {
		return <span data-default-kind="class">{this.props.label ?? 'missing'}</span>;
	}
}
