import { use, useEffect, useState } from 'octane';

export interface Props {
	label: string;
	value?: string;
	promise?: Promise<string>;
	fail?: boolean;
	events?: string[];
}

export const Boundary = (props: Props) => (
	@try {
		if (props.fail) throw new Error('unavailable');
		const value = props.promise ? use(props.promise) : (props.value ?? 'ready');
		const [count, setCount] = useState(0);
		useEffect(() => {
			props.events?.push('mount: ' + value);
			return () => {
				props.events?.push('cleanup: ' + value);
			};
		}, [value]);
		<section>
			<p class="value">{props.label + ': ' + value}</p>
			<input aria-label="Draft" defaultValue="draft" />
			<button class="increment" onClick={() => setCount(count + 1)}>
				{String(count)}
			</button>
		</section>
	} @pending {
		<p class="pending">{props.label + ': loading'}</p>
	} @catch (error, reset) {
		<button class="retry" onClick={reset}>
			{props.label + ': ' + String(error)}
		</button>
	}
);

export const ReturnBoundary = (props: Props) => {
	return (
		@try {
			if (props.fail) throw new Error('unavailable');
			const value = props.promise ? use(props.promise) : (props.value ?? 'ready');
			const [count, setCount] = useState(0);
			useEffect(() => {
				props.events?.push('mount: ' + value);
				return () => {
					props.events?.push('cleanup: ' + value);
				};
			}, [value]);
			<section>
				<p class="value">{props.label + ': ' + value}</p>
				<input aria-label="Draft" defaultValue="draft" />
				<button class="increment" onClick={() => setCount(count + 1)}>
					{String(count)}
				</button>
			</section>
		} @pending {
			<p class="pending">{props.label + ': loading'}</p>
		} @catch (error, reset) {
			<button class="retry" onClick={reset}>
				{props.label + ': ' + String(error)}
			</button>
		}
	);
};

export const WrappedBoundary = (props: Props) => @{
	@try {
		if (props.fail) throw new Error('unavailable');
		const value = props.promise ? use(props.promise) : (props.value ?? 'ready');
		const [count, setCount] = useState(0);
		useEffect(() => {
			props.events?.push('mount: ' + value);
			return () => {
				props.events?.push('cleanup: ' + value);
			};
		}, [value]);
		<section>
			<p class="value">{props.label + ': ' + value}</p>
			<input aria-label="Draft" defaultValue="draft" />
			<button class="increment" onClick={() => setCount(count + 1)}>
				{String(count)}
			</button>
		</section>
	} @pending {
		<p class="pending">{props.label + ': loading'}</p>
	} @catch (error, reset) {
		<button class="retry" onClick={reset}>
			{props.label + ': ' + String(error)}
		</button>
	}
};

export function App(props: Props) @{
	<Boundary {...props} />
}

export function DirectCall(props: Props) @{
	<main>{Boundary(props)}</main>
}

export function ReturnApp(props: Props) @{
	<ReturnBoundary {...props} />
}

export function WrappedApp(props: Props) @{
	<WrappedBoundary {...props} />
}
