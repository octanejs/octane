/** @jsxImportSource react */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { ReactTheme } from './contexts.js';

export interface CounterProps {
	start: number;
	label?: string;
	ref?: React.Ref<HTMLButtonElement>;
	onChange?: (count: number) => void;
	onCleanup?: () => void;
}

export function Counter({ start, label = 'count', ref, onChange, onCleanup }: CounterProps) {
	const [count, setCount] = React.useState(start);
	React.useEffect(() => onCleanup, [onCleanup]);
	return (
		<button
			ref={ref}
			onClick={() => {
				setCount(count + 1);
				onChange?.(count + 1);
			}}
		>
			{label}:{count}
		</button>
	);
}

export function Resource({ resource }: { resource: PromiseLike<string> }) {
	const [count, setCount] = React.useState(0);
	const value = React.use(resource);
	return (
		<button data-resource="" onClick={() => setCount(count + 1)}>
			{value}:{count}
		</button>
	);
}

export function LocalSuspense(props: { resource: PromiseLike<string> }) {
	return (
		<React.Suspense fallback={<p data-react-pending="">React pending</p>}>
			<Resource {...props} />
		</React.Suspense>
	);
}

export function Fault({
	error,
	effect,
	onCleanup,
}: {
	error?: Error;
	effect?: 'layout' | 'passive';
	onCleanup?: () => void;
}) {
	React.useLayoutEffect(() => {
		if (effect === 'layout') throw error;
	}, [error, effect]);
	React.useEffect(() => {
		if (effect === 'passive') throw error;
		return onCleanup;
	}, [error, effect, onCleanup]);
	if (error && !effect) throw error;
	return <p data-healthy="">healthy</p>;
}

class LocalBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
	state = { error: false };
	static getDerivedStateFromError() {
		return { error: true };
	}
	render() {
		return this.state.error ? <p data-react-caught="">React caught</p> : this.props.children;
	}
}

export function LocalError(props: { error: Error }) {
	return (
		<LocalBoundary>
			<Fault {...props} />
		</LocalBoundary>
	);
}

export const ContextCounter = React.memo(function ContextCounter() {
	const value = React.useContext(ReactTheme);
	const [count, setCount] = React.useState(0);
	return (
		<button data-theme="" onClick={() => setCount(count + 1)}>
			{String(value)}:{count}
		</button>
	);
});

export function Portal({ target, onCleanup }: { target: Element; onCleanup: () => void }) {
	React.useEffect(() => onCleanup, [onCleanup]);
	return createPortal(<button data-react-portal="">portal</button>, target);
}

export function LocalTransition({ next }: { next: PromiseLike<string> }) {
	const [resource, setResource] = React.useState<PromiseLike<string>>({
		then() {},
		status: 'fulfilled',
		value: 'initial',
	} as PromiseLike<string>);
	const [pending, start] = React.useTransition();
	return (
		<>
			<button data-start="" onClick={() => start(() => setResource(next))}>
				start
			</button>
			<output data-react-transition="">{String(pending)}</output>
			<Resource resource={resource} />
		</>
	);
}

export function Sequential({
	first,
	second,
}: {
	first: PromiseLike<string>;
	second: PromiseLike<string>;
}) {
	const a = React.use(first);
	const b = React.use(second);
	return (
		<p data-sequential="">
			{a}:{b}
		</p>
	);
}

export function Lifecycle({
	target,
	log,
	cleanupError,
}: {
	target: Element;
	log: string[];
	cleanupError?: Error;
}) {
	const [count, setCount] = React.useState(0);
	const ref = React.useCallback(
		(node: HTMLButtonElement | null) => {
			log.push(node ? 'ref:on' : 'ref:off');
		},
		[log],
	);
	React.useLayoutEffect(() => {
		log.push('layout:on');
		return () => {
			log.push('layout:off');
		};
	}, [log]);
	React.useEffect(() => {
		log.push('passive:on');
		return () => {
			log.push('passive:off');
			if (cleanupError) throw cleanupError;
		};
	}, [log, cleanupError]);
	return (
		<>
			<button data-life="" ref={ref} onClick={() => setCount(count + 1)}>
				{count}
			</button>
			{createPortal(<button data-life-portal="">portal</button>, target)}
		</>
	);
}

export function SuspendedLifecycle(props: {
	target: Element;
	log: string[];
	resource: PromiseLike<string>;
}) {
	React.use(props.resource);
	return <Lifecycle target={props.target} log={props.log} />;
}
