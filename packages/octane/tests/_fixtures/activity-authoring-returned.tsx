/** @jsxImportSource octane */
import { Activity, useState, type OctaneNode } from 'octane';

type Mode = 'visible' | 'hidden';

interface ActivityProps {
	mode: Mode;
	label: string;
	activityKey?: string;
	config?: { mode?: Mode; key?: string; children?: OctaneNode };
	boundary?: typeof Activity;
}

function Stateful(props: { label: string }) {
	const [count, setCount] = useState(0);
	return (
		<button data-activity-child={props.label} onClick={() => setCount((value) => value + 1)}>
			{props.label + ':' + count}
		</button>
	);
}

export function ReturnedActivity(props: ActivityProps) {
	return (
		<Activity {...props.config}>
			<Stateful label={props.label} />
		</Activity>
	);
}

export function NestedReturnedActivity(props: ActivityProps) {
	return (
		<section>
			<Activity key={props.activityKey} {...props.config}>
				<Stateful label={props.label} />
			</Activity>
			<i data-activity-tail>tail</i>
		</section>
	);
}

export function ReturnedDynamicSpreadWinsActivity(props: ActivityProps) {
	const Boundary = props.boundary ?? Activity;
	return (
		<Boundary key={props.activityKey} {...props.config}>
			<Activity mode="visible">
				<Stateful label={props.label} />
			</Activity>
		</Boundary>
	);
}

export function ReturnedDynamicExplicitWinsActivity(props: ActivityProps) {
	const Boundary = props.boundary ?? Activity;
	return (
		<Boundary {...props.config} key={props.activityKey}>
			<Activity mode="visible">
				<Stateful label={props.label} />
			</Activity>
		</Boundary>
	);
}

export function ActivityConfigOrder(props: {
	config: { mode?: Mode; key?: string };
	readName(): string;
	readKey(): string;
	readMode(): Mode;
	readLabel(): string;
}) {
	return (
		<section>
			<Activity
				name={props.readName()}
				{...props.config}
				key={props.readKey()}
				mode={props.readMode()}
			>
				<Stateful label={props.readLabel()} />
			</Activity>
		</section>
	);
}
