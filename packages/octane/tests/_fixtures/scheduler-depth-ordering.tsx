/** @jsxImportSource octane */

import { useLayoutEffect, useState } from 'octane';

let removeChild: (() => void) | null = null;
let invalidateChild: (() => void) | null = null;

function Child() {
	const [invalid, setInvalid] = useState(false);
	invalidateChild = () => setInvalid(true);
	if (invalid) throw new Error('a removed descendant rendered stale work');
	return <span className="child">child</span>;
}

export function SchedulerDepthOrderingApp() {
	const [showChild, setShowChild] = useState(true);
	removeChild = () => setShowChild(false);
	return <section>{showChild ? <Child /> : <span className="removed">removed</span>}</section>;
}

export function queueDescendantBeforeRemoval() {
	if (invalidateChild === null || removeChild === null) {
		throw new Error('scheduler fixture is not mounted');
	}
	invalidateChild();
	removeChild();
}

export interface SchedulerControls {
	update?: () => void;
	remove?: () => void;
}

function DeepCounter({ controls }: { controls: SchedulerControls }) {
	const [value, setValue] = useState(0);
	controls.update = () => setValue(1);
	if (value > 0 && value < 3) setValue(value + 1);
	return <output>{value}</output>;
}

function DeepBranch({ depth, controls }: { depth: number; controls: SchedulerControls }) {
	return depth === 0 ? (
		<DeepCounter controls={controls} />
	) : (
		<DeepBranch depth={depth - 1} controls={controls} />
	);
}

export function DeepSchedulerApp({ controls }: { controls: SchedulerControls }) {
	const [visible, setVisible] = useState(true);
	controls.remove = () => setVisible(false);
	return <section>{visible ? <DeepBranch depth={40} controls={controls} /> : 'removed'}</section>;
}

interface OrderedCounterProps {
	label: string;
	controls: SchedulerControls;
	onCommit(label: string): void;
}

function OrderedCounter({ label, controls, onCommit }: OrderedCounterProps) {
	const [value, setValue] = useState(0);
	controls.update = () => setValue(value + 1);
	useLayoutEffect(() => {
		if (value > 0) onCommit(label + ':' + value);
	}, [value, label, onCommit]);
	return <output data-counter={label}>{value}</output>;
}

function CounterWrapper({ label, controls, onCommit }: OrderedCounterProps) {
	return (
		<section>
			<OrderedCounter label={label} controls={controls} onCommit={onCommit} />
		</section>
	);
}

export function SiblingSchedulerApp({
	first,
	second,
	onCommit,
}: {
	first: SchedulerControls;
	second: SchedulerControls;
	onCommit(label: string): void;
}) {
	return (
		<main>
			<CounterWrapper label="first" controls={first} onCommit={onCommit} />
			<CounterWrapper label="second" controls={second} onCommit={onCommit} />
		</main>
	);
}

export function RunawaySchedulerApp({ controls }: { controls: SchedulerControls }) {
	const [value, setValue] = useState(0);
	controls.update = () => setValue(1);
	// The upper bound makes a missing render-loop error fail without hanging the test.
	if (value > 0 && value < 100) setValue(value + 1);
	return <output>{value}</output>;
}
